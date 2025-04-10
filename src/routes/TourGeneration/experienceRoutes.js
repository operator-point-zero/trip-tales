

// import express from "express";
// import axios from "axios";
// import { GoogleGenerativeAI } from "@google/generative-ai";
// import Experience from "../../models/experiences/Experience.js";

// const router = express.Router();
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// // Enhanced cache with categorization of attractions
// const placesCache = {
//   attractions: new Map(),
//   getKey: (lat, lon, radius) => `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`,
//   get: function(type, lat, lon, radius) {
//     const key = this.getKey(lat, lon, radius);
//     return this[type].get(key);
//   },
//   set: function(type, lat, lon, radius, data) {
//     const key = this.getKey(lat, lon, radius);
//     this[type].set(key, data);
//     // Set expiration (1 hour)
//     setTimeout(() => this[type].delete(key), 60 * 60 * 1000);
//   }
// };

// // Get location name from coordinates using reverse geocoding
// const getLocationNameFromCoordinates = async (lat, lon) => {
//   try {
//     const response = await axios.get(
//       `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${process.env.GOOGLE_PLACES_API_KEY}`
//     );
    
//     if (response.data.results && response.data.results.length > 0) {
//       // Try to find locality (city) or administrative_area_level_1 (state/province)
//       const addressComponents = response.data.results[0].address_components;
//       const locality = addressComponents.find(component => 
//         component.types.includes('locality')
//       );
      
//       const adminArea = addressComponents.find(component => 
//         component.types.includes('administrative_area_level_1')
//       );
      
//       const country = addressComponents.find(component => 
//         component.types.includes('country')
//       );
      
//       // Return city, state/province, or country in that order of preference
//       return (locality?.long_name || adminArea?.long_name || country?.long_name || 'this area');
//     }
    
//     return 'this area'; // Default if we can't determine location
//   } catch (error) {
//     console.error("Failed to get location name:", error.message);
//     return 'this area';
//   }
// };

// // Enhanced to fetch and categorize places
// const getNearbyPlaces = async (lat, lon, radius = 5000) => {
//   try {
//     // Check cache first
//     const cacheKey = placesCache.getKey(lat, lon, radius);
//     const cachedData = placesCache.get('attractions', lat, lon, radius);
//     if (cachedData) return cachedData;

//     const response = await axios.get(
//       `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=tourist_attraction&key=${process.env.GOOGLE_PLACES_API_KEY}`
//     );
    
//     const places = response.data.results.map(place => ({
//       locationName: place.name,
//       lat: place.geometry.location.lat,
//       lon: place.geometry.location.lng,
//       placeId: place.place_id,
//       types: place.types,
//       rating: place.rating || "N/A",
//       vicinity: place.vicinity || null
//     }));
    
//     // Cache the results
//     placesCache.set('attractions', lat, lon, radius, places);
//     return places;
//   } catch (error) {
//     console.error("Failed to fetch nearby places:", error.message);
//     return [];
//   }
// };

// // Function to search for additional types of attractions
// const searchForAdditionalAttractions = async (lat, lon) => {
//   try {
//     // Check cache first
//     const cacheKey = placesCache.getKey(lat, lon, 15000);
//     const cachedData = placesCache.get('attractions', lat, lon, 15000);
//     if (cachedData) return cachedData;

//     // Perform a single search with multiple types to reduce API calls
//     const response = await axios.get(
//       `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=15000&type=museum|park|church|mosque|temple|zoo|aquarium&key=${process.env.GOOGLE_PLACES_API_KEY}`
//     );
    
//     const attractions = response.data.results.map(place => ({
//       locationName: place.name,
//       lat: place.geometry.location.lat,
//       lon: place.geometry.location.lng,
//       placeId: place.place_id,
//       types: place.types,
//       rating: place.rating || "N/A",
//       vicinity: place.vicinity || null
//     }));
    
//     // Cache the results
//     placesCache.set('attractions', lat, lon, 15000, attractions);
//     return attractions;
//   } catch (error) {
//     console.error("Failed to fetch additional attractions:", error.message);
//     return [];
//   }
// };

// // NEW: Helper to categorize attractions by type
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

// // NEW: Function to get weighted random items from an array
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

// // NEW: Function to generate diverse location sets
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

// // Modified to generate diverse experiences and fetch location photos
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

// // NEW: Function to get photos for a location
// const getLocationPhotos = async (placeId) => {
//   if (!placeId) return [];
  
//   try {
//     const response = await axios.get(
//       `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${process.env.GOOGLE_PLACES_API_KEY}`
//     );
    
//     if (response.data.result && response.data.result.photos) {
//       return response.data.result.photos.slice(0, 3).map(photo => {
//         return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
//       });
//     }
    
//     return [];
//   } catch (error) {
//     console.error("Failed to fetch location photos:", error.message);
//     return [];
//   }
// };

// // Implement rate limiting middleware
// const rateLimiter = {
//   requests: new Map(),
//   limit: 60, // 60 requests per minute
//   reset: 60 * 1000, // 1 minute
//   check: function(ip) {
//     const now = Date.now();
//     if (!this.requests.has(ip)) {
//       this.requests.set(ip, { count: 1, resetTime: now + this.reset });
//       return true;
//     }
    
//     const request = this.requests.get(ip);
//     if (now > request.resetTime) {
//       this.requests.set(ip, { count: 1, resetTime: now + this.reset });
//       return true;
//     }
    
//     if (request.count >= this.limit) {
//       return false;
//     }
    
//     request.count++;
//     return true;
//   }
// };

// // Rate limiting middleware
// const rateLimit = (req, res, next) => {
//   const ip = req.ip;
//   if (!rateLimiter.check(ip)) {
//     return res.status(429).json({ error: "Too many requests, please try again later." });
//   }
//   next();
// };

// // NEW: Helper to filter out experiences that don't match user preferences
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

// // NEW: Function to save experiences with a storage strategy
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



// // Helper to determine if a location is urban (used for box size calculation)
// async function isUrbanLocation(lat, lon) {
//   try {
//     // Use Google Places API to determine if the area is densely populated
//     const response = await axios.get(
//       `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=500&type=establishment&key=${process.env.GOOGLE_PLACES_API_KEY}`
//     );
    
//     // If there are many establishments in a small radius, it's likely urban
//     return response.data.results.length > 10;
//   } catch (error) {
//     console.error("Error determining location type:", error.message);
//     return false; // Default to non-urban
//   }
// }

// export default router;

import express from "express";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Experience from "../../models/experiences/Experience.js";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Enhanced cache with categorization of attractions
const placesCache = {
  attractions: new Map(),
  getKey: (lat, lon, radius) => `<span class="math-inline">\{lat\.toFixed\(4\)\},</span>{lon.toFixed(4)},${radius}`,
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
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=<span class="math-inline">\{lat\},</span>{lon}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );

    if (response.data.results && response.data.results.length > 0) {
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

      return (locality?.long_name || adminArea?.long_name || country?.long_name || 'this area');
    }

    return 'this area';
  } catch (error) {
    console.error("Failed to get location name:", error.message);
    return 'this area';
  }
};

// Enhanced to fetch and categorize places
const getNearbyPlaces = async (lat, lon, radius = 5000) => {
  try {
    const cacheKey = placesCache.getKey(lat, lon, radius);
    const cachedData = placesCache.get('attractions', lat, lon, radius);
    if (cachedData) return cachedData;

    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=<span class="math-inline">\{lat\},</span>{lon}&radius=<span class="math-inline">\{radius\}&type\=tourist\_attraction&key\=</span>{process.env.GOOGLE_PLACES_API_KEY}`
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
    const cacheKey = placesCache.getKey(lat, lon, 15000);
    const cachedData = placesCache.get('attractions', lat, lon, 15000);
    if (cachedData) return cachedData;

    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=<span class="math-inline">\{lat\},</span>{lon}&radius=15000&type=museum|park|church|mosque|temple|zoo|aquarium&key=${process.env.GOOGLE_PLACES_API_KEY}`
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

    placesCache.set('attractions', lat, lon, 15000, attractions);
    return attractions;
  } catch (error) {
    console.error("Failed to fetch additional attractions:", error.message);
    return [];
  }
};

// Helper to categorize attractions by type
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

// Helper to get weighted random items from an array
const getWeightedRandomSelection = (items, count, weights = null) => {
  if (!items || items.length === 0) return [];
  if (items.length <= count) return [...items];

  const selected = [];
  const availableItems = [...items];
  const availableWeights = weights ? [...weights] : null;

  for (let i = 0; i < count && availableItems.length > 0; i++) {
    let index;
    if (availableWeights && availableWeights.length === availableItems.length) {
      const totalWeight = availableWeights.reduce((sum, w) => sum + w, 0);
      let random = Math.random() * totalWeight;
      for (index = 0; index < availableWeights.length; index++) {
        random -= availableWeights[index];
        if (random <= 0) break;
      }
    } else {
      index = Math.floor(Math.random() * availableItems.length);
    }

    selected.push(availableItems[index]);
    availableItems.splice(index, 1);
    if (availableWeights) availableWeights.splice(index, 1);
  }

  return selected;
};

// Helper to generate diverse location sets with de-duplication
const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
  const categorized = categorizeAttractions(attractions);
  const locationSets = [];
  const seenPlaceIds = new Set(); // Track placeIds to avoid duplicates

  attractions.forEach(place => {
    place.distanceFromUser = Math.sqrt(
      Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2)
    );
  });

  const themeSets = [
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

  for (let i = 0; i < numSets && i < themeSets.length; i++) {
    const [theme, categoriesToUse, minPerCategory] = themeSets[i];
    let availableForTheme = [];

    categoriesToUse.forEach(category => {
      if (categorized[category] && categorized[category].length > 0) {
        availableForTheme = [...availableForTheme, ...categorized[category]];
      }
    });

    // De-duplicate within the theme set based on placeId
    availableForTheme = availableForTheme.filter(place => {
      if (seenPlaceIds.has(place.placeId)) {
        return false;
      }
      return true;
    });

    const weights = availableForTheme.map(place =>
      1 / (place.distanceFromUser + 0.01)
    );

    const selectedLocations = getWeightedRandomSelection(
      availableForTheme,
      locationsPerSet,
      weights
    ).filter(loc => !seenPlaceIds.has(loc.placeId)); // Ensure selected are not already used

    if (selectedLocations.length >= 2) {
      locationSets.push({
        theme,
        locations: selectedLocations
      });
      selectedLocations.forEach(loc => seenPlaceIds.add(loc.placeId)); // Mark as seen for subsequent sets
    }
  }

  return locationSets;
};

// Modified to generate diverse experiences and fetch location photos
const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
  try {
    const locationName = await getLocationNameFromCoordinates(latitude, longitude);
    const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude);

    if (diverseLocationSets.length === 0) {
      console.error("Failed to generate diverse location sets");
      return [];
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
      ],
      generationConfig: { temperature: 0.7, topP: 0.8, topK: 40, maxOutputTokens: 8192 }
    });

    const generatedExperiences = [];
    const processedPlaceIds = new Set(); // Track placeIds used in generated experiences

    for (let i = 0; i < diverseLocationSets.length; i++) {
      const locationSet = diverseLocationSets[i];

      if (!locationSet.locations || locationSet.locations.length < 2) continue;

      const themePrompt = `
You are a passionate and highly knowledgeable local tour guide from <span class="math-inline">\{locationName\} with decades of experience\.
Your mission is to craft a single immersive, one\-of\-a\-kind tour experience with the theme "</span>{locationSet.theme}".

For EACH of the following REAL locations, provide a rich, detailed 300-500 word narration in first-person as if you're standing there with travelers:
${locationSet.locations.filter(loc => !processedPlaceIds.has(loc.placeId)).map(loc => `- ${loc.locationName}`).join('\n')}

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
  "title": "An engaging title for your '<span class="math-inline">\{locationSet\.theme\}' themed tour",
"description"\: "Overall tour description connecting these specific locations",
"locations"\: \[
\{
"locationName"\: "</span>{locationSet.locations[0].locationName}",
      "lat": ${locationSet.locations[0].lat},
      "lon": <span class="math-inline">\{locationSet\.locations\[0\]\.lon\},
"placeId"\: "</span>{locationSet.locations[0].placeId}",
      "narration": "Your detailed 300-500 word narration here...",
      "photos": ["URL1","URL2"]
    },
    ... (continue for all provided locations)
  ]
}

Return ONLY the JSON object with no additional text or explanations.
`;

      try {
        const filteredLocationsForPrompt = locationSet.locations.filter(loc => !processedPlaceIds.has(loc.placeId));
        if (filteredLocationsForPrompt.length < 2) continue; // Ensure at least 2 unique locations for the prompt

        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: themePrompt }] }],
        });

        const responseText = result.response.candidates[0].content.parts[0].text;
        let cleanedResponse = responseText;
        if (responseText.trim().startsWith("```") && responseText.includes("```")) {
          cleanedResponse = responseText.replace(/```json\s*|\s*```/g, "");
        }

        try {
          const experience = JSON.parse(cleanedResponse);

          const enhancedLocations = await Promise.all(experience.locations.map(async location => {
            const matchingPlace = locationSet.locations.find(place =>
              place.placeId === location.placeId // Match based on placeId
            );

            if (matchingPlace) {
              const photos = await getLocationPhotos(matchingPlace.placeId);
              processedPlaceIds.add(matchingPlace.placeId); // Mark as processed
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

          generatedExperiences.push({
            ...experience,
            locations: enhancedLocations.filter(loc => loc.placeId) // Only include locations with placeIds
          });

        } catch (parseError) {
          console.error(`JSON parsing error for theme ${locationSet.theme}:`, parseError, responseText);
        }

      } catch (error) {
        console.error(`Error generating experience for theme ${locationSet.theme}:`, error);
      }
    }

    return generatedExperiences.filter(exp => exp.locations.length >= 2); // Ensure generated experiences have at least 2 unique locations
  } catch (error) {
    console.error("Gemini API request failed:", error);
    if (error instanceof SyntaxError) {
      console.error("JSON parsing error. Raw response was likely not valid JSON");
    }
    return [];
  }
};

// Function to get photos for a location
const getLocationPhotos = async (placeId) => {
  if (!placeId) return [];

  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=<span class="math-inline">\{placeId\}&fields\=photos&key\=</span>{process.env.GOOGLE_PLACES_API_KEY}`
    );

    if (response.data.result && response.data.result.photos) {
      return response.data.result.photos.slice(0, 3).map(photo => {
        return `https://maps.googleapis.maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
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

// Helper to filter out experiences that don't match user preferences
const filterExperiencesForUser = (experiences, userLat, userLon, params = {}) => {
  const locationCounts = new Map();
  let totalLocations = 0;

  experiences.forEach(exp => {
    exp.locations.forEach(loc => {
      if (loc.placeId) {
        locationCounts.set(loc.placeId, (locationCounts.get(loc.placeId) || 0) + 1);
        totalLocations++;
      }
    });
  });

  const avgOccurrence = totalLocations / Math.max(1, locationCounts.size);

  experiences.forEach(exp => {
    let score = 50;
    let diversityScore = 0;
    let validLocationCount = 0;

    exp.locations.forEach(loc => {
      if (loc.placeId) {
        diversityScore += (locationCounts.get(loc.placeId) || 1) / avgOccurrence;
        const distance = Math.sqrt(Math.pow(loc.lat - userLat, 2) + Math.pow(loc.lon - userLon, 2));
        score += Math.max(0, 10 - (distance * 500)) * 0.5; // Proximity bonus
        validLocationCount++;
      }
    });

    if (validLocationCount > 0) {
      diversityScore = diversityScore / validLocationCount;
      score -= (diversityScore - 1) * 15; // Penalize less diverse experiences
    }

    exp.relevanceScore = Math.round(Math.max(0, score)); // Ensure score is not negative
  });

  return experiences.sort((a, b) => b.relevanceScore - a.relevanceScore);
};

// Helper to save experiences with a storage strategy
const saveExperiencesToDatabase = async (experiences, userId, latitude, longitude) => {
  const enhancedExperiences = experiences.map(exp => ({
    ...exp,
    user_id: userId,
    created_at: new Date(),
    location_center: { lat: latitude, lon: longitude },
    is_seed: true,
    times_shown: 0
  }));

  await Experience.insertMany(enhancedExperiences);
  return enhancedExperiences;
};

router.post("/", rateLimit, async (req, res) => {
  try {
    const { lat, lon, user_id, preferences } = req.body;
    if (!lat || !lon || !user_id) {
      return res.status(400).json({ error: "Latitude, longitude, and user_id are required." });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    const userPrefs = preferences ? JSON.parse(preferences) : {};
    const boxSize = await isUrbanLocation(latitude, longitude) ? 0.15 : 0.45;

    // Step 1: Check for exact user experiences
    const userExperiences = await Experience.find({
      user_id: user_id,
      "locations.lat": { $gte: latitude - boxSize, $lte: latitude + boxSize },
      "locations.lon": { $gte: longitude - boxSize, $lte: longitude + boxSize },
    });

    if (userExperiences.length > 0) {
      return res.json({ experiences: userExperiences, source: "user_cache" });
    }

    // Step 2: Check for adaptable seed experiences
    const seedExperiences = await Experience.find({
      is_seed: true,
      "locations.lat": { $gte: latitude - boxSize, $lte: latitude + boxSize },
      "locations.lon": { $gte: longitude - boxSize, $lte: longitude + boxSize },
    }).sort({ times_shown: 1 }).limit(20);

    if (seedExperiences.length >= 5) {
      const experienceIds = seedExperiences.map(exp => exp._id);
      await Experience.updateMany(
        { _id: { $in: experienceIds } },
        { $inc: { times_shown: 1 } }
      );

      const filteredExperiences = filterExperiencesForUser(
        seedExperiences,
        latitude,
        longitude,
        userPrefs
      );

      const selectedExperiences = filteredExperiences.slice(0, 10);
      const userClones = selectedExperiences.map(exp => ({
        ...exp.toObject(),
        _id: undefined,
        user_id: user_id,
        is_seed: false,
        source_experience_id: exp._id,
        created_at: new Date()
      }));

      await Experience.insertMany(userClones);

      return res.json({ experiences: userClones, source: "customized_from_seed" });
    }

    // Step 3: Generate new experiences
    let nearbyPlaces = await getNearbyPlaces(latitude, longitude);
    if (nearbyPlaces.length < 5) {
      nearbyPlaces.push(...await getNearbyPlaces(latitude, longitude, 10000));
    }
    const additionalAttractions = await searchForAdditionalAttractions(latitude, longitude);
    nearbyPlaces = Array.from(new Map(nearbyPlaces.map(item => [item.placeId, item])).values());

    if (nearbyPlaces.length === 0) {
      return res.status(404).json({ error: "No points of interest found" });
    }

    const generatedExperiences = await fetchGeminiExperiences(nearbyPlaces, latitude, longitude);
    if (!Array.isArray(generatedExperiences) || generatedExperiences.length === 0) {
      return res.status(500).json({ error: "Failed to generate tour experiences" });
    }

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
        narration: loc.narration || `Welcome to ${loc.locationName}, a highlight of our tour.`
      })),
      user_id,
      is_seed: true,
      times_shown: 1,
      created_at: new Date(),
      location_center: { lat: latitude, lon: longitude }
    }));

    await Experience.insertMany(newExperiences);

    const userVersions = newExperiences.map(exp => ({
      ...exp,
      _id: undefined,
      is_seed: false,
      source_experience_id: exp._id
    }));

    await Experience.insertMany(userVersions);

    res.json({ experiences: userVersions, source: "newly_generated" });

  } catch (error) {
    console.error("Error in experiences route:", error);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

async function isUrbanLocation(lat, lon) {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=500&type=establishment&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    return response.data.results.length > 10;
  } catch (error) {
    console.error("Error determining location type:", error.message);
    return false;
  }
}

export default router;