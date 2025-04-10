

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
const getWeightedRandomSelection = (items, count, weights = null) => {
  if (!items || items.length === 0) return [];
  if (items.length <= count) return [...items];
  
  const selected = [];
  const availableItems = [...items];
  
  for (let i = 0; i < count && availableItems.length > 0; i++) {
    let index;
    if (weights && weights.length === availableItems.length) {
      // Weighted selection
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);
      let random = Math.random() * totalWeight;
      for (index = 0; index < weights.length; index++) {
        random -= weights[index];
        if (random <= 0) break;
      }
    } else {
      // Random selection
      index = Math.floor(Math.random() * availableItems.length);
    }
    
    selected.push(availableItems[index]);
    availableItems.splice(index, 1);
    if (weights) weights.splice(index, 1);
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

// NEW: Function to generate diverse location sets
const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
  // Categorize all attractions
  const categorized = categorizeAttractions(attractions);

  // Calculate distance from user to each attraction
  attractions.forEach(place => {
    place.distanceFromUser = Math.sqrt(
      Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2)
    );
  });

  // Prepare diverse theme sets (keep as is)
  const themeSets = [
    // ... (your themes remain here)
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

  const locationSets = [];
  const usedLocationCombinations = new Set(); // <-- Track used combinations

  // Try generating more sets initially to increase chances of diversity
  const maxAttempts = numSets * 2;
  let attempts = 0;

  while (locationSets.length < numSets && attempts < maxAttempts && themeSets.length > 0) {
    attempts++;
    // Pick a theme (maybe cycle through or pick randomly)
    const themeIndex = attempts % themeSets.length; // Simple cycling
    const [theme, categoriesToUse, minPerCategory] = themeSets[themeIndex];

    let availableForTheme = [];
    categoriesToUse.forEach(category => {
      if (categorized[category] && categorized[category].length > 0) {
        availableForTheme = [...availableForTheme, ...categorized[category]];
      }
    });

    availableForTheme = Array.from(
      new Map(availableForTheme.map(item => [item.placeId, item])).values()
    );

    // Need at least 'locationsPerSet' unique places for the theme
    if (availableForTheme.length < locationsPerSet) {
        // Maybe remove this theme if it consistently fails?
        // themeSets.splice(themeIndex, 1); // Optional: prevents retrying failing themes
        continue;
    }


    const weights = availableForTheme.map(place =>
      1 / (place.distanceFromUser + 0.01)
    );

    const selectedLocations = getWeightedRandomSelection(
      availableForTheme,
      locationsPerSet,
      weights
    );

    if (selectedLocations.length >= 2) { // Ensure at least 2 locations selected
        // Create a unique key for this combination of placeIds
        const combinationKey = selectedLocations
            .map(loc => loc.placeId)
            .sort() // Sort IDs to make order irrelevant
            .join(',');

        // Only add if this exact combination hasn't been used yet
        if (!usedLocationCombinations.has(combinationKey)) {
            locationSets.push({
                theme,
                locations: selectedLocations
            });
            usedLocationCombinations.add(combinationKey); // Mark as used
        }
    }
  }

  // If we still don't have enough, maybe add some random combinations? (Optional enhancement)

  return locationSets;
};

// Modified to generate diverse experiences and fetch location photos
// const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
//   try {
//     // Get location name for the prompt
//     const locationName = await getLocationNameFromCoordinates(latitude, longitude);
    
//     // Generate diverse location sets
//     const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude);
    
//     if (diverseLocationSets.length === 0) {
//       console.error("Failed to generate diverse location sets");
//       return [];
//     }
    
//     const model = genAI.getGenerativeModel({ 
//       model: "gemini-1.5-flash",
//       safetySettings: [
//         {
//           category: "HARM_CATEGORY_HARASSMENT",
//           threshold: "BLOCK_MEDIUM_AND_ABOVE"
//         },
//         {
//           category: "HARM_CATEGORY_HATE_SPEECH",
//           threshold: "BLOCK_MEDIUM_AND_ABOVE"
//         },
//         {
//           category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
//           threshold: "BLOCK_MEDIUM_AND_ABOVE"
//         },
//         {
//           category: "HARM_CATEGORY_DANGEROUS_CONTENT",
//           threshold: "BLOCK_MEDIUM_AND_ABOVE"
//         }
//       ],
//       generationConfig: {
//         temperature: 0.7,
//         topP: 0.8,
//         topK: 40,
//         maxOutputTokens: 8192
//       }
//     });
    

//     // We'll generate experiences for each theme separately to keep memory usage manageable
//     const generatedExperiences = [];
    
//     for (let i = 0; i < diverseLocationSets.length; i++) {
//       const locationSet = diverseLocationSets[i];
      
//       // Skip if not enough locations
//       if (!locationSet.locations || locationSet.locations.length < 2) continue;
      
//       // Create a custom prompt for this specific theme and locations
//       const themePrompt = `
// You are a passionate and highly knowledgeable local tour guide from ${locationName} with decades of experience. 
// Your mission is to craft a single immersive, one-of-a-kind tour experience with the theme "${locationSet.theme}".

// For EACH of the following REAL locations, provide a rich, detailed 300-500 word narration in first-person as if you're standing there with travelers:
// ${locationSet.locations.map(loc => `- ${loc.locationName}`).join('\n')}

// Your narration for each location MUST include:
// - A warm welcome and orientation to the location
// - Vivid sensory descriptions (sights, sounds, smells, textures)
// - Fascinating historical context with specific dates, names, and events
// - Personal anecdotes and observations as a local guide
// - Cultural significance and how locals interact with this place
// - Hidden details most tourists miss
// - Practical tips (best photo spots, quieter areas, accessibility notes)
// - 2-3 specific questions you might ask visitors to engage them
// - Connections to other locations in the tour
// - A compelling transition to the next location

// Format your response as a JSON object, following this structure EXACTLY:
// {
//   "title": "An engaging title for your '${locationSet.theme}' themed tour",
//   "description": "Overall tour description connecting these specific locations",
//   "locations": [
//     {
//       "locationName": "${locationSet.locations[0].locationName}",
//       "lat": ${locationSet.locations[0].lat},
//       "lon": ${locationSet.locations[0].lon},
//       "narration": "Your detailed 300-500 word narration here...",
//       "photos": ["URL1","URL2"]
//     },
//     ... (continue for all provided locations)
//   ]
// }

// Return ONLY the JSON object with no additional text or explanations.
// `;

//       try {
//         const result = await model.generateContent({
//           contents: [{ role: "user", parts: [{ text: themePrompt }] }],
//         });

//         const responseText = result.response.candidates[0].content.parts[0].text;
        
//         // Clean up the response text to remove markdown code blocks
//         let cleanedResponse = responseText;
//         if (responseText.trim().startsWith("```") && responseText.includes("```")) {
//           cleanedResponse = responseText.replace(/```json\s*|\s*```/g, "");
//         }

//         // Parse the JSON response
//         const experience = JSON.parse(cleanedResponse);
        
//         // Add placeIds to locations where available
//         const enhancedLocations = await Promise.all(experience.locations.map(async location => {
//           // Try to find a match in the nearbyPlaces array
//           const matchingPlace = locationSet.locations.find(place => 
//             place.locationName.toLowerCase() === location.locationName.toLowerCase() ||
//             place.locationName.toLowerCase().includes(location.locationName.toLowerCase()) ||
//             location.locationName.toLowerCase().includes(place.locationName.toLowerCase())
//           );
          
//           // If a match is found, use the more accurate info
//           if (matchingPlace) {
//             const photos = await getLocationPhotos(matchingPlace.placeId);
//             return {
//               ...location,
//               lat: matchingPlace.lat,
//               lon: matchingPlace.lon,
//               placeId: matchingPlace.placeId,
//               types: matchingPlace.types || [],
//               rating: matchingPlace.rating || null,
//               vicinity: matchingPlace.vicinity || null,
//               photos: photos || []
//             };
//           }
          
//           return location;
//         }));
        
//         // Add the enhanced experience
//         generatedExperiences.push({
//           ...experience,
//           locations: enhancedLocations
//         });
//       } catch (error) {
//         console.error(`Error generating experience for theme ${locationSet.theme}:`, error);
//         // Continue with other themes if one fails
//       }
//     }

//     return generatedExperiences;
//   } catch (error) {
//     console.error("Gemini API request failed:", error);
//     if (error instanceof SyntaxError) {
//       console.error("JSON parsing error. Raw response was likely not valid JSON");
//     }
//     return [];
//   }
// };

// Modified to generate diverse experiences and fetch location photos
// const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
//   try {
//     const locationName = await getLocationNameFromCoordinates(latitude, longitude);
//     const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude);

//     if (diverseLocationSets.length === 0) {
//       console.error("Failed to generate diverse location sets");
//       return [];
//     }

//     const model = genAI.getGenerativeModel({ /* ... your model config ... */ });

//     const generatedExperiencesRaw = []; // Store raw results first
//     const generatedLocationKeys = new Set(); // Track location sets used

//     for (let i = 0; i < diverseLocationSets.length; i++) {
//         // ... (rest of the loop generating prompt and calling model) ...
//          const locationSet = diverseLocationSets[i];

//       if (!locationSet.locations || locationSet.locations.length < 2) continue;

//       // Create a unique key for the location set *before* calling Gemini
//       const potentialKey = locationSet.locations
//             .map(loc => loc.placeId)
//             .sort()
//             .join(',');

//       // Skip if we already successfully generated an experience for this exact set
//       if (generatedLocationKeys.has(potentialKey)) {
//           console.log(`Skipping generation for duplicate location set: ${potentialKey}`);
//           continue;
//       }

//       const themePrompt = `... your prompt ...`; // Keep your detailed prompt

//       try {
//         const result = await model.generateContent({ /* ... */ });
//         const responseText = result.response.candidates[0].content.parts[0].text;
//         let cleanedResponse = responseText.replace(/```json\s*|\s*```/g, "");
//         const experience = JSON.parse(cleanedResponse);

//         // Add placeIds and photos (your existing logic)
//         const enhancedLocations = await Promise.all(experience.locations.map(async location => {
//            const matchingPlace = locationSet.locations.find(place =>
//              // ... your matching logic ...
//               place.locationName.toLowerCase() === location.locationName.toLowerCase() ||
//               place.locationName.toLowerCase().includes(location.locationName.toLowerCase()) ||
//               location.locationName.toLowerCase().includes(place.locationName.toLowerCase())
//             );
//             if (matchingPlace) {
//                 const photos = await getLocationPhotos(matchingPlace.placeId);
//                 return { /* ... enhance location ... */
//                     ...location,
//                     lat: matchingPlace.lat,
//                     lon: matchingPlace.lon,
//                     placeId: matchingPlace.placeId,
//                     types: matchingPlace.types || [],
//                     rating: matchingPlace.rating || null,
//                     vicinity: matchingPlace.vicinity || null,
//                     photos: photos || []
//                 };
//             }
//              return location; // Return original if no match
//         }));

//         // Check again for placeId uniqueness after enhancement
//         const finalKey = enhancedLocations
//             .map(loc => loc.placeId)
//             .filter(Boolean) // Remove null/undefined placeIds
//             .sort()
//             .join(',');

//         // Add only if the final key is unique and valid
//         if (finalKey && !generatedLocationKeys.has(finalKey)) {
//             generatedExperiencesRaw.push({
//                 ...experience,
//                 locations: enhancedLocations
//             });
//             generatedLocationKeys.add(finalKey); // Mark this set as used
//         } else {
//              console.log(`Skipping duplicate experience post-generation/enhancement for key: ${finalKey}`);
//         }

//       } catch (error) {
//         console.error(`Error generating experience for theme ${locationSet.theme}:`, error);
//       }
//     } // End of loop

//     // Optional: Further deduplication based on title/description similarity if needed
//     // (More complex, might use string similarity libraries)

//     return generatedExperiencesRaw; // Return the deduplicated list
//   } catch (error) {
//     // ... your error handling ...
//      console.error("Gemini API request failed:", error);
//     if (error instanceof SyntaxError) {
//       console.error("JSON parsing error. Raw response was likely not valid JSON");
//     }
//     return [];
//   }
// };

const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
  try {
    // Get location name for the prompt (using current location context)
    const locationName = await getLocationNameFromCoordinates(latitude, longitude);
    // Using the provided context:
    // const locationName = "Nakuru, Nakuru County, Kenya"; // Using context provided

    // Generate diverse location sets (using the previously enhanced function)
    const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude);

    if (!diverseLocationSets || diverseLocationSets.length === 0) {
      console.error("Failed to generate diverse location sets. Nearby places count:", nearbyPlaces.length);
      return [];
    }
     console.log(`Generated ${diverseLocationSets.length} diverse location sets to attempt.`);

    // Define the model configuration object
    const modelConfig = {
        model: "gemini-1.5-flash", // Ensure this model name is correct and available
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
        ],
        generationConfig: {
            temperature: 0.7,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 8192 // Make sure this isn't too high for the model/API limits if issues persist
        }
    };

    // *** DEBUGGING LOG ***: Log the configuration object right before the call
    console.log("Attempting to initialize model with config:", JSON.stringify(modelConfig, null, 2));

    // Get the generative model instance using the defined config
    const model = genAI.getGenerativeModel(modelConfig);

    const generatedExperiencesRaw = []; // Store raw results first
    const generatedLocationKeys = new Set(); // Track location sets used to prevent duplicates

    // We'll generate experiences for each theme separately
    for (let i = 0; i < diverseLocationSets.length; i++) {
      const locationSet = diverseLocationSets[i];

      // Skip if not enough locations
      if (!locationSet || !locationSet.locations || locationSet.locations.length < 2) {
        console.log(`Skipping location set ${i} due to insufficient locations.`);
        continue;
      }

       // Create a unique key for the location set *before* calling Gemini
       // Ensure placeId exists, filter out null/undefined before joining
      const potentialKey = locationSet.locations
            .map(loc => loc.placeId)
            .filter(Boolean) // Only consider locations with a placeId
            .sort()
            .join(',');

       // Skip if we already successfully generated an experience for this exact set or if key is empty
      if (!potentialKey || generatedLocationKeys.has(potentialKey)) {
          console.log(`Skipping generation for duplicate or invalid location set key: ${potentialKey || 'EMPTY_KEY'}`);
          continue;
      }

      // Create a custom prompt for this specific theme and locations
      const themePrompt = `
You are a passionate and highly knowledgeable local tour guide from ${locationName} with decades of experience.
Your mission is to craft a single immersive, one-of-a-kind tour experience with the theme "${locationSet.theme}".

For EACH of the following REAL locations provided, give a rich, detailed 300-500 word narration in first-person as if you're standing there with travelers:
${locationSet.locations.map(loc => `- ${loc.locationName} (Place ID: ${loc.placeId || 'N/A'})`).join('\n')}

Your narration for each location MUST include:
- A warm welcome and orientation.
- Vivid sensory details (sights, sounds, smells).
- Fascinating historical context (specific dates, names, events if known and relevant).
- Personal anecdotes or local insights.
- Cultural significance.
- Hidden details often missed.
- Practical tips (photos, best times, etc.).
- 2-3 engaging questions for visitors.
- Smooth transitions connecting locations within this tour.

Format your response as a JSON object, following this structure EXACTLY:
{
  "title": "Engaging title for your '${locationSet.theme}' tour in ${locationName}",
  "description": "Overall tour description connecting these specific locations for the '${locationSet.theme}' theme.",
  "locations": [
    {
      "locationName": "${locationSet.locations[0].locationName}",
      "lat": ${locationSet.locations[0].lat},
      "lon": ${locationSet.locations[0].lon},
      "narration": "Detailed 300-500 word narration for ${locationSet.locations[0].locationName} here...",
      "photos": [] // Placeholder, will be filled later
    }
    // ... include ONE object for EACH location provided above
  ]
}

Return ONLY the raw JSON object with no introductory text, explanations, or markdown formatting like \`\`\`json or \`\`\`.
`; // End of themePrompt

      try {
        console.log(`Generating content for theme: "${locationSet.theme}" with locations: ${locationSet.locations.map(l=>l.locationName).join(', ')}`);
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: themePrompt }] }],
        });

        // Check if response and candidate exist before accessing parts
        if (!result.response || !result.response.candidates || result.response.candidates.length === 0 || !result.response.candidates[0].content || !result.response.candidates[0].content.parts) {
            console.error(`Invalid response structure received from Gemini for theme ${locationSet.theme}. Skipping.`);
            continue; // Skip to the next location set
        }

        const responseText = result.response.candidates[0].content.parts[0].text;

        // Clean up potential markdown code blocks
        let cleanedResponse = responseText.trim();
        if (cleanedResponse.startsWith("```json")) {
            cleanedResponse = cleanedResponse.substring(7); // Remove ```json
        }
        if (cleanedResponse.endsWith("```")) {
           cleanedResponse = cleanedResponse.substring(0, cleanedResponse.length - 3); // Remove ```
        }
        cleanedResponse = cleanedResponse.trim(); // Trim again after removing backticks


        // Parse the JSON response
        const experience = JSON.parse(cleanedResponse);

        // Add placeIds and fetch photos (using your existing logic)
        const enhancedLocations = await Promise.all(experience.locations.map(async (locationFromJson) => {
          // Find the corresponding location from the input set to get accurate data
           const matchingPlace = locationSet.locations.find(place =>
              // Prioritize matching by name provided in the JSON, fall back to other checks
              place.locationName.toLowerCase() === locationFromJson.locationName.toLowerCase() ||
              place.locationName.toLowerCase().includes(locationFromJson.locationName.toLowerCase()) ||
              locationFromJson.locationName.toLowerCase().includes(place.locationName.toLowerCase())
            );

          if (matchingPlace && matchingPlace.placeId) {
            const photos = await getLocationPhotos(matchingPlace.placeId); // Fetch photos
            return {
              ...locationFromJson, // Keep narration, lat/lon from Gemini for now
              lat: matchingPlace.lat, // Override with original accurate lat
              lon: matchingPlace.lon, // Override with original accurate lon
              placeId: matchingPlace.placeId, // Add the correct placeId
              types: matchingPlace.types || [],
              rating: matchingPlace.rating || null,
              vicinity: matchingPlace.vicinity || null,
              photos: photos || [] // Add fetched photos
            };
          } else {
             // If no match found (Gemini might have hallucinated or name mismatch is too large),
             // return the Gemini data but log a warning. Photos won't be fetched.
             console.warn(`Could not find matching placeId for location: "${locationFromJson.locationName}" in experience "${experience.title}". Using data from Gemini response.`);
             return {
                 ...locationFromJson,
                 photos: [] // Ensure photos is an empty array
             };
          }
        }));

        // Final check for placeId uniqueness after enhancement
        const finalKey = enhancedLocations
            .map(loc => loc.placeId)
            .filter(Boolean) // Remove null/undefined placeIds
            .sort()
            .join(',');

        // Add only if the final key is unique and valid
        if (finalKey && !generatedLocationKeys.has(finalKey)) {
            generatedExperiencesRaw.push({
                ...experience,
                locations: enhancedLocations // Use the enhanced locations array
            });
            generatedLocationKeys.add(finalKey); // Mark this unique set as used
            console.log(`Successfully generated and added experience for theme: "${locationSet.theme}", final key: ${finalKey}`);
        } else {
             console.log(`Skipping duplicate experience post-generation/enhancement for key: ${finalKey || 'EMPTY_KEY'}`);
        }

      } catch (error) {
         // Log errors during generation or parsing for a specific theme
        console.error(`Error processing experience for theme "${locationSet.theme}":`, error);
        if (error instanceof SyntaxError) {
            console.error("JSON parsing error likely occurred for the above theme. Raw response might be invalid JSON.");
            // Optionally log the 'cleanedResponse' here for debugging, but be mindful of log size/PII
            // console.error("Raw response text before parse failure:", cleanedResponse);
        }
        // Continue with other themes even if one fails
      }
    } // End of for loop iterating through diverseLocationSets

    console.log(`Finished generation loop. Total experiences generated: ${generatedExperiencesRaw.length}`);
    return generatedExperiencesRaw; // Return the deduplicated list

  } catch (error) {
    // Catch errors related to initial setup (getting model, location name etc.)
    console.error("Error in fetchGeminiExperiences function:", error);
    // Check if it's the specific model name error we were looking for
    if (error.message && error.message.includes("Must provide a model name")) {
        console.error(">>> THE 'Must provide a model name' ERROR PERSISTS! Check Render environment variables and deployment status. <<<");
    }
    return []; // Return empty array on failure
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

// NEW: Helper to filter out experiences that don't match user preferences
const filterExperiencesForUser = (experiences, userLat, userLon, userPrefs = {}) => {
  // --- Preference Filtering (Example) ---
  let filteredByPrefs = experiences;
  if (userPrefs.avoidCategories && Array.isArray(userPrefs.avoidCategories)) {
      const lowerCaseAvoid = userPrefs.avoidCategories.map(cat => cat.toLowerCase());
      filteredByPrefs = experiences.filter(exp => {
          // Check experience title/description/theme if available
          // Check location types
          const hasAvoidedType = exp.locations.some(loc =>
              (loc.types || []).some(type => lowerCaseAvoid.includes(type))
          );
          // Add theme check if you store theme explicitly on the experience
          // const themeAvoided = lowerCaseAvoid.includes(exp.theme?.toLowerCase());
          return !hasAvoidedType; // Keep if it doesn't have avoided types
      });
  }
  // Add more preference checks (e.g., required features, accessibility)

  // --- Scoring based on Diversity and Proximity (Applied to Preference-Filtered List) ---
  const locationCounts = new Map();
  let totalLocations = 0;

  filteredByPrefs.forEach(exp => {
    exp.locations.forEach(loc => {
      // Use placeId if available, otherwise fallback to lat/lon key
      const locKey = loc.placeId || `${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}`;
      locationCounts.set(locKey, (locationCounts.get(locKey) || 0) + 1);
      totalLocations++;
    });
  });

  // Avoid division by zero if locationCounts is empty
  const avgOccurrence = totalLocations / Math.max(1, locationCounts.size);

  filteredByPrefs.forEach(exp => {
    let score = 50;
    let diversityScore = 0;
    let uniqueLocationsInExp = 0; // Count locations unique to *this* experience in the current set

    if (exp.locations.length > 0) { // Avoid division by zero
        exp.locations.forEach(loc => {
          const locKey = loc.placeId || `${loc.lat.toFixed(5)},${loc.lon.toFixed(5)}`;
          const count = locationCounts.get(locKey) || 0;
          diversityScore += count / avgOccurrence; // Penalize frequently occurring locations
          if (count === 1) {
              uniqueLocationsInExp++;
          }
        });
        diversityScore = diversityScore / exp.locations.length;

        // Stronger penalty for high overlap, bonus for uniqueness
        score -= (diversityScore - 1) * 20; // Increased penalty
        score += (uniqueLocationsInExp / exp.locations.length) * 15; // Bonus for unique places
    }


    let proximityScore = 0;
     if (exp.locations.length > 0) { // Avoid division by zero
        exp.locations.forEach(loc => {
            const distance = Math.sqrt(Math.pow(loc.lat - userLat, 2) + Math.pow(loc.lon - userLon, 2));
            // Adjust multiplier based on expected coordinate scale (degrees?)
            // Lower distance = higher score. Max score 10 per location.
            proximityScore += Math.max(0, 10 - (distance * 200)); // Adjust 200 based on scale
        });
        proximityScore = proximityScore / exp.locations.length;
        score += proximityScore * 1.5; // Slightly reduced proximity weight to favor diversity
     }

    // Rating boost (Optional)
    let avgRating = 0;
    let ratedLocations = 0;
     if (exp.locations.length > 0) {
        exp.locations.forEach(loc => {
            if (typeof loc.rating === 'number' && loc.rating > 0) {
                avgRating += loc.rating;
                ratedLocations++;
            }
        });
        if (ratedLocations > 0) {
             avgRating = avgRating / ratedLocations;
             score += (avgRating - 3) * 3; // Boost for ratings above 3
        }
     }


    exp.relevanceScore = Math.max(0, Math.round(score)); // Ensure score is not negative
  });

  // Sort by relevance score
  return filteredByPrefs.sort((a, b) => b.relevanceScore - a.relevanceScore);
};

// NEW: Function to save experiences with a storage strategy
const saveExperiencesToDatabase = async (experiences, userId, latitude, longitude) => {
  // Add strategic metadata to experiences
  const enhancedExperiences = experiences.map(exp => ({
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
  
  // Save to database
  await Experience.insertMany(enhancedExperiences);
  return enhancedExperiences;
};


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
    // ... (parsing lat, lon, user_id, preferences)
    const { lat, lon, user_id, preferences } = req.body;
     if (!lat || !lon || !user_id) {
      return res.status(400).json({ error: "Latitude, longitude, and user_id are required." });
    }
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    const userPrefs = preferences ? JSON.parse(preferences) : {}; // Already parsing prefs

    // ... (isUrbanArea check)
    const isUrbanArea = await isUrbanLocation(latitude, longitude);
    const boxSize = isUrbanArea ? 0.15 : 0.45;

    // Step 1: Check user experiences (keep as is)
    // ...

    // Step 2: Check seed experiences
    const seedExperiences = await Experience.find({ /* ... */ })
        .sort({ times_shown: 1 }) // Prioritize less shown
        .limit(30); // Fetch more seeds initially

    if (seedExperiences.length >= 5) { // Require a minimum pool size
      await Experience.updateMany(/* ... update times_shown ... */);

      // Filter and prioritize using the enhanced function
      const filteredExperiences = filterExperiencesForUser(
        seedExperiences,
        latitude,
        longitude,
        userPrefs // Pass user preferences here
      );

      // Take **fewer** top experiences (e.g., 7)
      const selectedExperiences = filteredExperiences.slice(0, 7); // <-- Limit results

      // Clone for user (keep as is)
      const userClones = selectedExperiences.map(exp => ({ /* ... clone ... */ }));
      await Experience.insertMany(userClones);

      return res.json({
        experiences: userClones, // Return the limited, diverse set
        source: "customized_from_seed"
      });
    }

    // Step 3: Generate new experiences
    // ... (fetch nearby places, deduplicate places list)
    let nearbyPlaces = await getNearbyPlaces(latitude, longitude);
    // ... (add additional attractions, deduplicate places again)

     if (nearbyPlaces.length === 0) {
      return res.status(404).json({ error: "No points of interest found" });
     }

    // Generate experiences (already enhanced to be more diverse)
    const generatedExperiences = await fetchGeminiExperiences(nearbyPlaces, latitude, longitude);
     if (!Array.isArray(generatedExperiences) || generatedExperiences.length === 0) {
       return res.status(500).json({ error: "Failed to generate tour experiences" });
     }

    // Format experiences (keep as is)
    const newExperiences = generatedExperiences.map(exp => ({ /* ... format ... */ }));

    // Save seed experiences
    const savedSeeds = await Experience.insertMany(newExperiences); // Get the saved docs with IDs

    // Create user-specific copies from the *actually saved* seeds
    const userVersions = savedSeeds.map(exp => ({
      ...exp.toObject(), // Use toObject() to get a plain object
      _id: undefined,
      is_seed: false,
      source_experience_id: exp._id, // Link to the saved seed ID
       user_id: user_id, // Ensure user_id is set correctly
       times_shown: 0, // Reset times_shown for user copy
       created_at: new Date() // New creation date for user copy
    }));

    await Experience.insertMany(userVersions);

    // Return a limited set of the newly generated ones too
    const finalUserExperiences = filterExperiencesForUser(
        userVersions, latitude, longitude, userPrefs
    ).slice(0, 7); // Apply filtering and limit here too

    res.json({
      experiences: finalUserExperiences, // Return the limited, diverse set
      source: "newly_generated"
    });

  } catch (error) {
    // ... (error handling)
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