

import express from "express";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Experience from "../../models/experiences/Experience.js";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Enhanced cache with categorization of attractions
const placesCache = {
  attractions: new Map(),
  getKey: (lat, lon, radius) => `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`,
  get: function(type, lat, lon, radius) {
    const key = this.getKey(lat, lon, radius);
    return this[type].get(key);
  },
  set: function(type, lat, lon, radius, data) {
    const key = this.getKey(lat, lon, radius);
    this[type].set(key, data);
    // Set expiration (1 hour)
    setTimeout(() => this[type].delete(key), 60 * 60 * 1000);
  }
};

// Get location name from coordinates using reverse geocoding
const getLocationNameFromCoordinates = async (lat, lon) => {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    
    if (response.data.results && response.data.results.length > 0) {
      // Try to find locality (city) or administrative_area_level_1 (state/province)
      const addressComponents = response.data.results[0].address_components;
      const locality = addressComponents.find(component => 
        component.types.includes('locality')
      );
      
      const adminArea = addressComponents.find(component => 
        component.types.includes('administrative_area_level_1')
      );
      
      const country = addressComponents.find(component => 
        component.types.includes('country')
      );
      
      // Return city, state/province, or country in that order of preference
      return (locality?.long_name || adminArea?.long_name || country?.long_name || 'this area');
    }
    
    return 'this area'; // Default if we can't determine location
  } catch (error) {
    console.error("Failed to get location name:", error.message);
    return 'this area';
  }
};

// Enhanced to fetch and categorize places
const getNearbyPlaces = async (lat, lon, radius = 20000) => {
  try {
    // Check cache first
    const cacheKey = placesCache.getKey(lat, lon, radius);
    const cachedData = placesCache.get('attractions', lat, lon, radius);
    if (cachedData) return cachedData;

    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=tourist_attraction&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    
    const places = response.data.results.map(place => ({
      locationName: place.name,
      lat: place.geometry.location.lat,
      lon: place.geometry.location.lng,
      placeId: place.place_id,
      types: place.types,
      rating: place.rating || "N/A",
      vicinity: place.vicinity || null
    }));
    
    // Cache the results
    placesCache.set('attractions', lat, lon, radius, places);
    return places;
  } catch (error) {
    console.error("Failed to fetch nearby places:", error.message);
    return [];
  }
};

// Function to search for additional types of attractions
const searchForAdditionalAttractions = async (lat, lon) => {
  try {
    // Check cache first
    const cacheKey = placesCache.getKey(lat, lon, 15000);
    const cachedData = placesCache.get('attractions', lat, lon, 15000);
    if (cachedData) return cachedData;

    // Perform a single search with multiple types to reduce API calls
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=15000&type=museum|park|church|mosque|temple|zoo|aquarium&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    
    const attractions = response.data.results.map(place => ({
      locationName: place.name,
      lat: place.geometry.location.lat,
      lon: place.geometry.location.lng,
      placeId: place.place_id,
      types: place.types,
      rating: place.rating || "N/A",
      vicinity: place.vicinity || null
    }));
    
    // Cache the results
    placesCache.set('attractions', lat, lon, 15000, attractions);
    return attractions;
  } catch (error) {
    console.error("Failed to fetch additional attractions:", error.message);
    return [];
  }
};

// NEW: Helper to categorize attractions by type
// const categorizeAttractions = (attractions) => {
//   const categories = {
//     museums: [],
//     historical: [],
//     nature: [],
//     entertainment: [],
//     religious: [],
//     arts: [],
//     shopping: [],
//     neighborhoods: [],
//     landmarks: [],
//     other: []
//   };

//   attractions.forEach(place => {
//     const types = place.types || [];
    
//     // Categorize based on place types
//     if (types.includes('museum')) {
//       categories.museums.push(place);
//     } else if (types.includes('park') || types.includes('natural_feature')) {
//       categories.nature.push(place);
//     } else if (types.includes('church') || types.includes('mosque') || types.includes('temple') || types.includes('place_of_worship')) {
//       categories.religious.push(place);
//     } else if (types.includes('art_gallery') || types.includes('theater')) {
//       categories.arts.push(place);
//     } else if (types.includes('amusement_park') || types.includes('zoo') || types.includes('aquarium')) {
//       categories.entertainment.push(place);
//     } else if (types.includes('department_store') || types.includes('shopping_mall')) {
//       categories.shopping.push(place);
//     } else if (types.some(type => type.includes('historical') || type.includes('landmark'))) {
//       categories.historical.push(place);
//     } else if (types.includes('neighborhood') || types.includes('sublocality')) {
//       categories.neighborhoods.push(place);
//     } else if (types.includes('point_of_interest')) {
//       categories.landmarks.push(place);
//     } else {
//       categories.other.push(place);
//     }
//   });
  
//   return categories;
// };

// Updated - Helper to categorize attractions by type
const categorizeAttractions = (attractions) => {
  const categories = {
    museums: [],
    historical: [],
    nature: [],
    entertainment: [],
    religious: [],
    arts: [],
    shopping: [],
    neighborhoods: [],
    landmarks: [],
    other: []
  };

  attractions.forEach(place => {
    const types = place.types || [];
    
    // Categorize based on place types
    if (types.includes('museum')) {
      categories.museums.push(place);
    } else if (types.includes('park') || types.includes('natural_feature')) {
      categories.nature.push(place);
    } else if (types.includes('church') || types.includes('mosque') || types.includes('temple') || types.includes('place_of_worship')) {
      categories.religious.push(place);
    } else if (types.includes('art_gallery') || types.includes('theater')) {
      categories.arts.push(place);
    } else if (types.includes('amusement_park') || types.includes('zoo') || types.includes('aquarium')) {
      categories.entertainment.push(place);
    } else if (types.includes('department_store') || types.includes('shopping_mall')) {
      categories.shopping.push(place);
    } else if (types.some(type => type.includes('historical') || type.includes('landmark'))) {
      categories.historical.push(place);
    } else if (types.includes('neighborhood') || types.includes('sublocality')) {
      categories.neighborhoods.push(place);
    } else if (types.includes('point_of_interest')) {
      categories.landmarks.push(place);
    } else {
      categories.other.push(place);
    }
  });
  
  return categories;
};

// NEW: Function to get weighted random items from an array
// const getWeightedRandomSelection = (items, count, weights = null) => {
//   if (!items || items.length === 0) return [];
//   if (items.length <= count) return [...items];
  
//   const selected = [];
//   const availableItems = [...items];
  
//   for (let i = 0; i < count && availableItems.length > 0; i++) {
//     let index;
//     if (weights && weights.length === availableItems.length) {
//       // Weighted selection
//       const totalWeight = weights.reduce((sum, w) => sum + w, 0);
//       let random = Math.random() * totalWeight;
//       for (index = 0; index < weights.length; index++) {
//         random -= weights[index];
//         if (random <= 0) break;
//       }
//     } else {
//       // Random selection
//       index = Math.floor(Math.random() * availableItems.length);
//     }
    
//     selected.push(availableItems[index]);
//     availableItems.splice(index, 1);
//     if (weights) weights.splice(index, 1);
//   }
  
//   return selected;
// };

const getWeightedRandomSelection = (items, count, weights = null) => {
  if (!items || items.length === 0) return [];
  if (items.length <= count) return [...items];
  
  const selected = [];
  const availableItems = [...items];
  const availableWeights = weights ? [...weights] : null;
  
  for (let i = 0; i < count && availableItems.length > 0; i++) {
    let index;
    if (availableWeights && availableWeights.length === availableItems.length) {
      // Weighted selection
      const totalWeight = availableWeights.reduce((sum, w) => sum + w, 0);
      let random = Math.random() * totalWeight;
      for (index = 0; index < availableWeights.length; index++) {
        random -= availableWeights[index];
        if (random <= 0) break;
      }
    } else {
      // Random selection
      index = Math.floor(Math.random() * availableItems.length);
    }
    
    selected.push(availableItems[index]);
    availableItems.splice(index, 1);
    if (availableWeights) availableWeights.splice(index, 1);
  }
  
  return selected;
};

// NEW: Function to generate diverse location sets
// const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
//   // Categorize all attractions
//   const categorized = categorizeAttractions(attractions);
  
//   // Calculate distance from user to each attraction
//   attractions.forEach(place => {
//     place.distanceFromUser = Math.sqrt(
//       Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2)
//     );
//   });
  
//   // Prepare diverse theme sets
//   const themeSets = [
//     // Format: [Theme name, [categories to sample from], min items per category]
//     ["Historical Highlights", ["historical", "landmarks"], 2],
//     ["Arts & Culture", ["museums", "arts", "historical"], 2],
//     ["Nature Escape", ["nature", "landmarks"], 2],
//     ["Religious Heritage", ["religious", "historical"], 2],
//     ["Family Fun", ["entertainment", "nature", "landmarks"], 2],
//     ["Local Neighborhoods", ["neighborhoods", "shopping", "landmarks"], 2],
//     ["Hidden Gems", ["other", "landmarks", "neighborhoods"], 2],
//     ["Architectural Marvels", ["historical", "religious", "landmarks"], 2],
//     ["Photography Spots", ["nature", "landmarks", "historical"], 2],
//     ["Cultural Immersion", ["museums", "arts", "neighborhoods"], 2]
//   ];
  
//   // Generate diverse location sets
//   const locationSets = [];
//   for (let i = 0; i < numSets && i < themeSets.length; i++) {
//     const [theme, categoriesToUse, minPerCategory] = themeSets[i];
    
//     // Gather all available attractions for this theme
//     let availableForTheme = [];
//     categoriesToUse.forEach(category => {
//       if (categorized[category] && categorized[category].length > 0) {
//         availableForTheme = [...availableForTheme, ...categorized[category]];
//       }
//     });
    
//     // Remove duplicates (same place might be in multiple categories)
//     availableForTheme = Array.from(
//       new Map(availableForTheme.map(item => [item.placeId, item])).values()
//     );
    
//     // Apply proximity weighting (favor closer places)
//     const weights = availableForTheme.map(place => 
//       1 / (place.distanceFromUser + 0.01) // Add small value to avoid division by zero
//     );
    
//     // Get unique locations for this set
//     const selectedLocations = getWeightedRandomSelection(
//       availableForTheme, 
//       locationsPerSet,
//       weights
//     );
    
//     // If we have enough locations, add this set
//     if (selectedLocations.length >= 2) {
//       locationSets.push({
//         theme,
//         locations: selectedLocations
//       });
//     }
//   }
  
//   return locationSets;
// };

// const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
//   // Categorize all attractions
//   const categorized = categorizeAttractions(attractions);
  
//   // Calculate distance from user to each attraction
//   attractions.forEach(place => {
//     place.distanceFromUser = Math.sqrt(
//       Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2)
//     );
//   });
  
//   // Prepare diverse theme sets
//   const themeSets = [
//     // Format: [Theme name, [categories to sample from], min items per category]
//     ["Historical Highlights", ["historical", "landmarks"], 2],
//     ["Arts & Culture", ["museums", "arts", "historical"], 2],
//     ["Nature Escape", ["nature", "landmarks"], 2],
//     ["Religious Heritage", ["religious", "historical"], 2],
//     ["Family Fun", ["entertainment", "nature", "landmarks"], 2],
//     ["Local Neighborhoods", ["neighborhoods", "shopping", "landmarks"], 2],
//     ["Hidden Gems", ["other", "landmarks", "neighborhoods"], 2],
//     ["Architectural Marvels", ["historical", "religious", "landmarks"], 2],
//     ["Photography Spots", ["nature", "landmarks", "historical"], 2],
//     ["Cultural Immersion", ["museums", "arts", "neighborhoods"], 2]
//   ];
  
//   // Generate diverse location sets
//   const locationSets = [];
//   for (let i = 0; i < numSets && i < themeSets.length; i++) {
//     const [theme, categoriesToUse, minPerCategory] = themeSets[i];
    
//     // Gather all available attractions for this theme
//     let availableForTheme = [];
//     categoriesToUse.forEach(category => {
//       if (categorized[category] && categorized[category].length > 0) {
//         availableForTheme = [...availableForTheme, ...categorized[category]];
//       }
//     });
    
//     // Create a more robust unique identifier using both placeId and coordinates
//     // This ensures deduplication even when placeId might be missing
//     availableForTheme = Array.from(
//       new Map(
//         availableForTheme.map(item => {
//           // Create a composite key using placeId if available, otherwise use lat/lon
//           const uniqueKey = item.placeId || `${item.lat.toFixed(6)}_${item.lon.toFixed(6)}`;
//           return [uniqueKey, item];
//         })
//       ).values()
//     );
    
//     // Apply proximity weighting (favor closer places)
//     const weights = availableForTheme.map(place => 
//       1 / (place.distanceFromUser + 0.01) // Add small value to avoid division by zero
//     );
    
//     // Get unique locations for this set
//     const selectedLocations = getWeightedRandomSelection(
//       availableForTheme, 
//       locationsPerSet,
//       weights
//     );
    
//     // If we have enough locations, add this set
//     if (selectedLocations.length >= 2) {
//       locationSets.push({
//         theme,
//         locations: selectedLocations
//       });
//     }
//   }
  
//   return locationSets;
// };

const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
  // Categorize all attractions
  const categorized = categorizeAttractions(attractions);
  
  // Calculate distance from user to each attraction
  attractions.forEach(place => {
    place.distanceFromUser = Math.sqrt(
      Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2)
    );
  });
  
  // Prepare diverse theme sets
  const themeSets = [
    // Format: [Theme name, [categories to sample from], min items per category]
    ["Historical Highlights", ["historical", "landmarks"], 2],
    ["Arts & Culture", ["museums", "arts", "historical"], 2],
    ["Nature Escape", ["nature", "landmarks"], 2],
    ["Religious Heritage", ["religious", "historical"], 2],
    ["Family Fun", ["entertainment", "nature", "landmarks"], 2],
    ["Local Neighborhoods", ["neighborhoods", "shopping", "landmarks"], 2],
    ["Hidden Gems", ["other", "landmarks", "neighborhoods"], 2],
    ["Architectural Marvels", ["historical", "religious", "landmarks"], 2],
    ["Photography Spots", ["nature", "landmarks", "historical"], 2],
    ["Cultural Immersion", ["museums", "arts", "neighborhoods"], 2]
  ];
  
  // Track all selected locations across all sets to prevent cross-theme duplicates
  const allSelectedLocations = new Set();
  
  // Generate diverse location sets
  const locationSets = [];
  for (let i = 0; i < numSets && i < themeSets.length; i++) {
    const [theme, categoriesToUse, minPerCategory] = themeSets[i];
    
    // Gather all available attractions for this theme
    let availableForTheme = [];
    categoriesToUse.forEach(category => {
      if (categorized[category] && categorized[category].length > 0) {
        availableForTheme = [...availableForTheme, ...categorized[category]];
      }
    });
    
    // Create a more robust unique identifier using both placeId and coordinates
    // This ensures deduplication even when placeId might be missing
    availableForTheme = Array.from(
      new Map(
        availableForTheme.map(item => {
          // Create a composite key using placeId if available, otherwise use lat/lon
          const uniqueKey = item.placeId || `${item.lat.toFixed(6)}_${item.lon.toFixed(6)}`;
          return [uniqueKey, item];
        })
      ).values()
    );
    
    // Filter out locations already used in other themes
    availableForTheme = availableForTheme.filter(item => {
      const uniqueKey = item.placeId || `${item.lat.toFixed(6)}_${item.lon.toFixed(6)}`;
      return !allSelectedLocations.has(uniqueKey);
    });
    
    // If not enough locations available after filtering, continue to next theme
    if (availableForTheme.length < 2) continue;
    
    // Apply proximity weighting (favor closer places)
    const weights = availableForTheme.map(place => 
      1 / (place.distanceFromUser + 0.01) // Add small value to avoid division by zero
    );
    
    // Get unique locations for this set
    const selectedLocations = getWeightedRandomSelection(
      availableForTheme, 
      locationsPerSet,
      weights
    );
    
    // If we have enough locations, add this set
    if (selectedLocations.length >= 2) {
      // Add the selected location keys to our tracking set
      selectedLocations.forEach(item => {
        const uniqueKey = item.placeId || `${item.lat.toFixed(6)}_${item.lon.toFixed(6)}`;
        allSelectedLocations.add(uniqueKey);
      });
      
      locationSets.push({
        theme,
        locations: selectedLocations
      });
    }
  }
  
  return locationSets;
};

const checkForDuplicateExperiences = async (newExperiences, latitude, longitude, boxSize = 0.05) => {
  try {
    // Find existing experiences in the same area
    const existingExperiences = await Experience.find({
      is_seed: true,
      "location_center.lat": { $gte: latitude - boxSize, $lte: latitude + boxSize },
      "location_center.lon": { $gte: longitude - boxSize, $lte: longitude + boxSize },
    });
    
    if (existingExperiences.length === 0) return newExperiences;
    
    console.log(`Found ${existingExperiences.length} existing experiences in the area to check against`);
    
    // Filter out new experiences that are too similar to existing ones
    const uniqueExperiences = newExperiences.filter(newExp => {
      // Consider an experience a duplicate if 50% or more of its locations
      // are very close to locations in an existing experience
      const isDuplicate = existingExperiences.some(existingExp => {
        // Count how many locations in the new experience are similar to existing ones
        const similarLocations = newExp.locations.filter(newLoc => 
          existingExp.locations.some(existingLoc => {
            const latDiff = Math.abs(newLoc.lat - existingLoc.lat);
            const lonDiff = Math.abs(newLoc.lon - existingLoc.lon);
            // Very small difference threshold (approximately 50-100 meters)
            return latDiff < 0.0005 && lonDiff < 0.0005; 
          })
        );
        
        // If more than half of locations are similar, consider it a duplicate
        return similarLocations.length >= (newExp.locations.length * 0.5);
      });
      
      return !isDuplicate;
    });
    
    console.log(`Filtered out ${newExperiences.length - uniqueExperiences.length} duplicate experiences`);
    return uniqueExperiences;
  } catch (error) {
    console.error("Error in checkForDuplicateExperiences:", error);
    // In case of error, return original experiences
    return newExperiences;
  }
};

// Modified to generate diverse experiences and fetch location photos
const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
  try {
    // Get location name for the prompt
    const locationName = await getLocationNameFromCoordinates(latitude, longitude);
    
    // Generate diverse location sets
    const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude);
    
    if (diverseLocationSets.length === 0) {
      console.error("Failed to generate diverse location sets");
      return [];
    }
    
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 8192
      }
    });
    

    // We'll generate experiences for each theme separately to keep memory usage manageable
    const generatedExperiences = [];
    
    for (let i = 0; i < diverseLocationSets.length; i++) {
      const locationSet = diverseLocationSets[i];
      
      // Skip if not enough locations
      if (!locationSet.locations || locationSet.locations.length < 2) continue;
      
      // Create a custom prompt for this specific theme and locations
      const themePrompt = `
You are a passionate and highly knowledgeable local tour guide from ${locationName} with decades of experience. 
Your mission is to craft a single immersive, one-of-a-kind tour experience with the theme "${locationSet.theme}".

For EACH of the following REAL locations, provide a rich, detailed 300-500 word narration in first-person as if you're standing there with travelers:
${locationSet.locations.map(loc => `- ${loc.locationName}`).join('\n')}

Your narration for each location MUST include:
- A warm welcome and orientation to the location
- Vivid sensory descriptions (sights, sounds, smells, textures)
- Fascinating historical context with specific dates, names, and events
- Personal anecdotes and observations as a local guide
- Cultural significance and how locals interact with this place
- Hidden details most tourists miss
- Practical tips (best photo spots, quieter areas, accessibility notes)
- 2-3 specific questions you might ask visitors to engage them
- Connections to other locations in the tour
- A compelling transition to the next location

Format your response as a JSON object, following this structure EXACTLY:
{
  "title": "An engaging title for your '${locationSet.theme}' themed tour",
  "description": "Overall tour description connecting these specific locations",
  "locations": [
    {
      "locationName": "${locationSet.locations[0].locationName}",
      "lat": ${locationSet.locations[0].lat},
      "lon": ${locationSet.locations[0].lon},
      "narration": "Your detailed 300-500 word narration here...",
      "photos": ["URL1","URL2"]
    },
    ... (continue for all provided locations)
  ]
}

Return ONLY the JSON object with no additional text or explanations.
`;

      try {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: themePrompt }] }],
        });

        const responseText = result.response.candidates[0].content.parts[0].text;
        
        // Clean up the response text to remove markdown code blocks
        let cleanedResponse = responseText;
        if (responseText.trim().startsWith("```") && responseText.includes("```")) {
          cleanedResponse = responseText.replace(/```json\s*|\s*```/g, "");
        }

        // Parse the JSON response
        const experience = JSON.parse(cleanedResponse);
        
        // Add placeIds to locations where available
        const enhancedLocations = await Promise.all(experience.locations.map(async location => {
          // Try to find a match in the nearbyPlaces array
          const matchingPlace = locationSet.locations.find(place => 
            place.locationName.toLowerCase() === location.locationName.toLowerCase() ||
            place.locationName.toLowerCase().includes(location.locationName.toLowerCase()) ||
            location.locationName.toLowerCase().includes(place.locationName.toLowerCase())
          );
          
          // If a match is found, use the more accurate info
          if (matchingPlace) {
            const photos = await getLocationPhotos(matchingPlace.placeId);
            return {
              ...location,
              lat: matchingPlace.lat,
              lon: matchingPlace.lon,
              placeId: matchingPlace.placeId,
              types: matchingPlace.types || [],
              rating: matchingPlace.rating || null,
              vicinity: matchingPlace.vicinity || null,
              photos: photos || []
            };
          }
          
          return location;
        }));
        
        // Add the enhanced experience
        generatedExperiences.push({
          ...experience,
          locations: enhancedLocations
        });
      } catch (error) {
        console.error(`Error generating experience for theme ${locationSet.theme}:`, error);
        // Continue with other themes if one fails
      }
    }

    return generatedExperiences;
  } catch (error) {
    console.error("Gemini API request failed:", error);
    if (error instanceof SyntaxError) {
      console.error("JSON parsing error. Raw response was likely not valid JSON");
    }
    return [];
  }
};

// NEW: Function to get photos for a location
const getLocationPhotos = async (placeId) => {
  if (!placeId) return [];
  
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    
    if (response.data.result && response.data.result.photos) {
      return response.data.result.photos.slice(0, 3).map(photo => {
        return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
      });
    }
    
    return [];
  } catch (error) {
    console.error("Failed to fetch location photos:", error.message);
    return [];
  }
};

// Implement rate limiting middleware
const rateLimiter = {
  requests: new Map(),
  limit: 60, // 60 requests per minute
  reset: 60 * 1000, // 1 minute
  check: function(ip) {
    const now = Date.now();
    if (!this.requests.has(ip)) {
      this.requests.set(ip, { count: 1, resetTime: now + this.reset });
      return true;
    }
    
    const request = this.requests.get(ip);
    if (now > request.resetTime) {
      this.requests.set(ip, { count: 1, resetTime: now + this.reset });
      return true;
    }
    
    if (request.count >= this.limit) {
      return false;
    }
    
    request.count++;
    return true;
  }
};

// Rate limiting middleware
const rateLimit = (req, res, next) => {
  const ip = req.ip;
  if (!rateLimiter.check(ip)) {
    return res.status(429).json({ error: "Too many requests, please try again later." });
  }
  next();
};

// NEW: Helper to filter out experiences that don't match user preferences
// const filterExperiencesForUser = (experiences, userLat, userLon, params = {}) => {
//   // Calculate diversity score based on how many experiences share same locations
//   const locationCounts = new Map();
//   let totalLocations = 0;
  
//   experiences.forEach(exp => {
//     exp.locations.forEach(loc => {
//       const locKey = `${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}`;
//       locationCounts.set(locKey, (locationCounts.get(locKey) || 0) + 1);
//       totalLocations++;
//     });
//   });
  
//   // Calculate average location occurrence
//   const avgOccurrence = totalLocations / Math.max(1, locationCounts.size);
  
//   // Score experiences based on location diversity and proximity to user
//   experiences.forEach(exp => {
//     // Base score starts at 50
//     let score = 50;
    
//     // Diversity score - lower is better (less overlap with other experiences)
//     let diversityScore = 0;
//     exp.locations.forEach(loc => {
//       const locKey = `${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}`;
//       diversityScore += locationCounts.get(locKey) / avgOccurrence;
//     });
//     diversityScore = diversityScore / exp.locations.length;
    
//     // Lower score for experiences with many duplicate locations
//     score -= (diversityScore - 1) * 15;
    
//     // Proximity score - higher for locations closer to user
//     let proximityScore = 0;
//     exp.locations.forEach(loc => {
//       const distance = Math.sqrt(Math.pow(loc.lat - userLat, 2) + Math.pow(loc.lon - userLon, 2));
//       // Convert to a 0-10 score where 10 is closest
//       proximityScore += Math.max(0, 10 - (distance * 500));
//     });
//     proximityScore = proximityScore / exp.locations.length;
    
//     // Add proximity bonus
//     score += proximityScore * 2;
    
//     // Store the score with the experience
//     exp.relevanceScore = Math.round(score);
//   });
  
//   // Sort by relevance score and return the top ones
//   return experiences.sort((a, b) => b.relevanceScore - a.relevanceScore);
// };

const filterExperiencesForUser = (experiences, userLat, userLon, params = {}) => {
  // Calculate diversity score based on how many experiences share same locations
  const locationCounts = new Map();
  let totalLocations = 0;
  
  experiences.forEach(exp => {
    exp.locations.forEach(loc => {
      // Create a more robust unique identifier for locations
      const locKey = loc.placeId || `${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}`;
      locationCounts.set(locKey, (locationCounts.get(locKey) || 0) + 1);
      totalLocations++;
    });
  });
  
  // Calculate average location occurrence
  const avgOccurrence = totalLocations / Math.max(1, locationCounts.size);
  
  // Score experiences based on location diversity and proximity to user
  experiences.forEach(exp => {
    // Base score starts at 50
    let score = 50;
    
    // Diversity score - lower is better (less overlap with other experiences)
    let diversityScore = 0;
    exp.locations.forEach(loc => {
      const locKey = loc.placeId || `${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}`;
      diversityScore += locationCounts.get(locKey) / avgOccurrence;
    });
    diversityScore = diversityScore / exp.locations.length;
    
    // Lower score for experiences with many duplicate locations
    score -= (diversityScore - 1) * 15;
    
    // Proximity score - higher for locations closer to user
    let proximityScore = 0;
    exp.locations.forEach(loc => {
      const distance = Math.sqrt(Math.pow(loc.lat - userLat, 2) + Math.pow(loc.lon - userLon, 2));
      // Convert to a 0-10 score where 10 is closest
      proximityScore += Math.max(0, 10 - (distance * 500));
    });
    proximityScore = proximityScore / exp.locations.length;
    
    // Add proximity bonus
    score += proximityScore * 2;
    
    // Store the score with the experience
    exp.relevanceScore = Math.round(score);
  });
  
  // Sort by relevance score and return the top ones
  return experiences.sort((a, b) => b.relevanceScore - a.relevanceScore);
};

const getNearbyPlacesWithDeduplication = async (latitude, longitude) => {
  // Get nearby places
  let nearbyPlaces = await getNearbyPlaces(latitude, longitude);
  
  // If not enough places found, search with larger radius
  if (nearbyPlaces.length < 5) {
    nearbyPlaces.push(...await getNearbyPlaces(latitude, longitude, 10000));
  }
  
  // Add additional attractions from targeted searches
  const additionalAttractions = await searchForAdditionalAttractions(latitude, longitude);
  nearbyPlaces = [...nearbyPlaces, ...additionalAttractions];
  
  // Remove duplicates with improved approach that handles missing placeIds
  nearbyPlaces = Array.from(
    new Map(nearbyPlaces.map(item => {
      // Create a composite key using placeId if available, otherwise use coordinates
      const uniqueKey = item.placeId || `${item.lat.toFixed(6)}_${item.lon.toFixed(6)}`;
      return [uniqueKey, item];
    })).values()
  );
  
  return nearbyPlaces;
};

// NEW: Function to save experiences with a storage strategy
// const saveExperiencesToDatabase = async (experiences, userId, latitude, longitude) => {
//   // Add strategic metadata to experiences
//   const enhancedExperiences = experiences.map(exp => ({
//     ...exp,
//     user_id: userId,
//     created_at: new Date(),
//     location_center: {
//       lat: latitude,
//       lon: longitude
//     },
//     // This is a reuse flag that indicates these are seed experiences that can be shown to other users
//     is_seed: true,
//     times_shown: 0
//   }));
  
//   // Save to database
//   await Experience.insertMany(enhancedExperiences);
//   return enhancedExperiences;
// };

const saveExperiencesToDatabase = async (experiences, userId, latitude, longitude) => {
  try {
    // Check for duplicates before saving
    const uniqueExperiences = await checkForDuplicateExperiences(experiences, latitude, longitude);
    
    // Add strategic metadata to experiences
    const enhancedExperiences = uniqueExperiences.map(exp => ({
      ...exp,
      user_id: userId,
      created_at: new Date(),
      location_center: {
        lat: latitude,
        lon: longitude
      },
      // This is a reuse flag that indicates these are seed experiences that can be shown to other users
      is_seed: true,
      times_shown: 0
    }));
    
    // Only save if we have unique experiences
    if (enhancedExperiences.length > 0) {
      await Experience.insertMany(enhancedExperiences);
    }
    
    return enhancedExperiences;
  } catch (error) {
    console.error("Error saving experiences to database:", error);
    throw error;
  }
};

const formattedExperiences = generatedExperiences.map(exp => ({
  title: exp.title,
  description: exp.description,
  locations: exp.locations.map(loc => ({
    lat: loc.lat,
    lon: loc.lon,
    locationName: loc.locationName,
    placeId: loc.placeId || null,
    types: loc.types || [],
    rating: loc.rating || null,
    vicinity: loc.vicinity || null,
    photos: loc.photos || [],
    narration: loc.narration || `Welcome to ${loc.locationName}, one of the must-visit spots in our tour.`
  }))
}));

// Save seed experiences to database, checking for duplicates
const savedExperiences = await saveExperiencesToDatabase(formattedExperiences, user_id, latitude, longitude);

// Create user-specific copies
const userVersions = savedExperiences.map(exp => ({
  ...exp,
  _id: undefined, // Let MongoDB create a new ID
  is_seed: false,
  source_experience_id: exp._id
}));

// Only save user versions if we have experiences
if (userVersions.length > 0) {
  await Experience.insertMany(userVersions);
}

// Return appropriate response
if (userVersions.length === 0) {
  return res.status(404).json({ error: "No unique experiences could be generated for this location" });
}

res.json({
  experiences: userVersions,
  source: "newly_generated"
});


// router.post("/", rateLimit, async (req, res) => {
//   try {
//     const { lat, lon, user_id, preferences } = req.body;
//     if (!lat || !lon || !user_id) {
//       return res.status(400).json({ error: "Latitude, longitude, and user_id are required." });
//     }
    
//     const latitude = parseFloat(lat);
//     const longitude = parseFloat(lon);
    
//     // Parse user preferences if provided
//     const userPrefs = preferences ? JSON.parse(preferences) : {};
    
//     // Determine area granularity based on location type
//     // In dense urban areas, we use a smaller radius
//     const isUrbanArea = await isUrbanLocation(latitude, longitude);
//     const boxSize = isUrbanArea ? 0.15 : 0.45; // Smaller box for urban areas
    
//     // Step 1: Check if we already have experiences for this EXACT user
//     const userExperiences = await Experience.find({
//       user_id: user_id,
//       "locations.lat": { $gte: latitude - boxSize, $lte: latitude + boxSize },
//       "locations.lon": { $gte: longitude - boxSize, $lte: longitude + boxSize },
//     });
    
//     // If this user already has experiences in the area, return them
//     if (userExperiences.length > 0) {
//       return res.json({experiences: userExperiences, source: "user_cache"});
//     }
    
//     // Step 2: Check if we have seed experiences in the area that can be adapted
//     const seedExperiences = await Experience.find({
//       is_seed: true,
//       "locations.lat": { $gte: latitude - boxSize, $lte: latitude + boxSize },
//       "locations.lon": { $gte: longitude - boxSize, $lte: longitude + boxSize },
//     }).sort({ times_shown: 1 }).limit(20); // Get least shown experiences first
    
//     // If we have seed experiences, customize some for this user
//     if (seedExperiences.length >= 5) {
//       // Update usage count for these experiences
//       const experienceIds = seedExperiences.map(exp => exp._id);
//       await Experience.updateMany(
//         { _id: { $in: experienceIds } },
//         { $inc: { times_shown: 1 } }
//       );
      
//       // Filter and prioritize experiences for this specific user
//       const filteredExperiences = filterExperiencesForUser(
//         seedExperiences, 
//         latitude, 
//         longitude,
//         userPrefs
//       );
      
//       // Take top 10 most relevant experiences
//       const selectedExperiences = filteredExperiences.slice(0, 10);
      
//       // Create clones for this user
//       const userClones = selectedExperiences.map(exp => ({
//         ...exp.toObject(),
//         _id: undefined, // Let MongoDB create a new ID
//         user_id: user_id,
//         is_seed: false,
//         source_experience_id: exp._id,
//         created_at: new Date()
//       }));
      
//       // Save user-specific clones
//       await Experience.insertMany(userClones);
      
//       return res.json({
//         experiences: userClones,
//         source: "customized_from_seed"
//       });
//     }
    
//     // Step 3: Generate completely new experiences
//     // Get nearby places
//     let nearbyPlaces = await getNearbyPlaces(latitude, longitude);
    
//     // If not enough places found, search with larger radius
//     if (nearbyPlaces.length < 5) {
//       nearbyPlaces.push(...await getNearbyPlaces(latitude, longitude, 10000));
//     }
    
//     // Add additional attractions from targeted searches
//     const additionalAttractions = await searchForAdditionalAttractions(latitude, longitude);
//     nearbyPlaces = [...nearbyPlaces, ...additionalAttractions];
    
//     // Remove duplicates based on placeId
//     nearbyPlaces = Array.from(
//       new Map(nearbyPlaces.map(item => [item.placeId, item])).values()
//     );
    
//     if (nearbyPlaces.length === 0) {
//       return res.status(404).json({ error: "No points of interest found" });
//     }

//     // Generate diverse experiences
//     const generatedExperiences = await fetchGeminiExperiences(nearbyPlaces, latitude, longitude);
//     if (!Array.isArray(generatedExperiences) || generatedExperiences.length === 0) {
//       return res.status(500).json({ error: "Failed to generate tour experiences" });
//     }

//     // Format and save experiences
//     const newExperiences = generatedExperiences.map(exp => ({
//       title: exp.title,
//       description: exp.description,
//       locations: exp.locations.map(loc => ({
//         lat: loc.lat,
//         lon: loc.lon,
//         locationName: loc.locationName,
//         placeId: loc.placeId || null,
//         types: loc.types || [],
//         rating: loc.rating || null,
//         vicinity: loc.vicinity || null,
//         photos: loc.photos || [],
//         narration: loc.narration || `Welcome to ${loc.locationName}, one of the must-visit spots in our tour.`
//       })),
//       user_id,
//       is_seed: true,
//       times_shown: 1,
//       created_at: new Date(),
//       location_center: {
//         lat: latitude,
//         lon: longitude
//       }
//     }));

//     // Save experiences to database
//     await Experience.insertMany(newExperiences);
    
//     // Create user-specific copies
//     const userVersions = newExperiences.map(exp => ({
//       ...exp,
//       _id: undefined, // Let MongoDB create a new ID
//       is_seed: false,
//       source_experience_id: exp._id
//     }));
    
//     await Experience.insertMany(userVersions);

//     res.json({
//       experiences: userVersions,
//       source: "newly_generated"
//     });
//   } catch (error) {
//     console.error("Error in experiences route:", error);
//     res.status(500).json({ error: "Server error", details: error.message });
//   }
// });

router.post("/", rateLimit, async (req, res) => {
  try {
    const { lat, lon, user_id, preferences } = req.body;
    if (!lat || !lon || !user_id) {
      return res.status(400).json({ error: "Latitude, longitude, and user_id are required." });
    }
    
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    
    // Parse user preferences if provided
    const userPrefs = preferences ? JSON.parse(preferences) : {};
    
    // Determine area granularity based on location type
    // In dense urban areas, we use a smaller radius
    const isUrbanArea = await isUrbanLocation(latitude, longitude);
    const boxSize = isUrbanArea ? 0.15 : 0.45; // Smaller box for urban areas
    
    // Step 1: Check if we already have experiences for this EXACT user
    const userExperiences = await Experience.find({
      user_id: user_id,
      "locations.lat": { $gte: latitude - boxSize, $lte: latitude + boxSize },
      "locations.lon": { $gte: longitude - boxSize, $lte: longitude + boxSize },
    });
    
    // If this user already has experiences in the area, return them
    if (userExperiences.length > 0) {
      return res.json({experiences: userExperiences, source: "user_cache"});
    }
    
    // Step 2: Check if we have seed experiences in the area that can be adapted
    const seedExperiences = await Experience.find({
      is_seed: true,
      "locations.lat": { $gte: latitude - boxSize, $lte: latitude + boxSize },
      "locations.lon": { $gte: longitude - boxSize, $lte: longitude + boxSize },
    }).sort({ times_shown: 1 }).limit(20); // Get least shown experiences first
    
    // If we have seed experiences, customize some for this user
    if (seedExperiences.length >= 5) {
      // Update usage count for these experiences
      const experienceIds = seedExperiences.map(exp => exp._id);
      await Experience.updateMany(
        { _id: { $in: experienceIds } },
        { $inc: { times_shown: 1 } }
      );
      
      // Filter and prioritize experiences for this specific user
      const filteredExperiences = filterExperiencesForUser(
        seedExperiences, 
        latitude, 
        longitude,
        userPrefs
      );
      
      // Take top 10 most relevant experiences
      const selectedExperiences = filteredExperiences.slice(0, 10);
      
      // Create clones for this user
      const userClones = selectedExperiences.map(exp => ({
        ...exp.toObject(),
        _id: undefined, // Let MongoDB create a new ID
        user_id: user_id,
        is_seed: false,
        source_experience_id: exp._id,
        created_at: new Date()
      }));
      
      // Save user-specific clones
      await Experience.insertMany(userClones);
      
      return res.json({
        experiences: userClones,
        source: "customized_from_seed"
      });
    }
    
    // Step 3: Generate completely new experiences
    // Get nearby places
    let nearbyPlaces = await getNearbyPlaces(latitude, longitude);
    
    // If not enough places found, search with larger radius
    if (nearbyPlaces.length < 5) {
      nearbyPlaces.push(...await getNearbyPlaces(latitude, longitude, 10000));
    }
    
    // Add additional attractions from targeted searches
    const additionalAttractions = await searchForAdditionalAttractions(latitude, longitude);
    nearbyPlaces = [...nearbyPlaces, ...additionalAttractions];
    
    // Remove duplicates with improved approach that handles missing placeIds
    nearbyPlaces = Array.from(
      new Map(nearbyPlaces.map(item => {
        // Create a composite key using placeId if available, otherwise use coordinates
        const uniqueKey = item.placeId || `${item.lat.toFixed(6)}_${item.lon.toFixed(6)}`;
        return [uniqueKey, item];
      })).values()
    );
    
    if (nearbyPlaces.length === 0) {
      return res.status(404).json({ error: "No points of interest found" });
    }

    // Generate diverse experiences
    const generatedExperiences = await fetchGeminiExperiences(nearbyPlaces, latitude, longitude);
    if (!Array.isArray(generatedExperiences) || generatedExperiences.length === 0) {
      return res.status(500).json({ error: "Failed to generate tour experiences" });
    }

    // Format and save experiences
    const newExperiences = generatedExperiences.map(exp => ({
      title: exp.title,
      description: exp.description,
      locations: exp.locations.map(loc => ({
        lat: loc.lat,
        lon: loc.lon,
        locationName: loc.locationName,
        placeId: loc.placeId || null,
        types: loc.types || [],
        rating: loc.rating || null,
        vicinity: loc.vicinity || null,
        photos: loc.photos || [],
        narration: loc.narration || `Welcome to ${loc.locationName}, one of the must-visit spots in our tour.`
      })),
      user_id,
      is_seed: true,
      times_shown: 1,
      created_at: new Date(),
      location_center: {
        lat: latitude,
        lon: longitude
      }
    }));

    // Save experiences to database
    await Experience.insertMany(newExperiences);
    
    // Create user-specific copies
    const userVersions = newExperiences.map(exp => ({
      ...exp,
      _id: undefined, // Let MongoDB create a new ID
      is_seed: false,
      source_experience_id: exp._id
    }));
    
    await Experience.insertMany(userVersions);

    res.json({
      experiences: userVersions,
      source: "newly_generated"
    });
  } catch (error) {
    console.error("Error in experiences route:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});



// Helper to determine if a location is urban (used for box size calculation)
async function isUrbanLocation(lat, lon) {
  try {
    // Use Google Places API to determine if the area is densely populated
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=500&type=establishment&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    
    // If there are many establishments in a small radius, it's likely urban
    return response.data.results.length > 10;
  } catch (error) {
    console.error("Error determining location type:", error.message);
    return false; // Default to non-urban
  }
}

export default router;