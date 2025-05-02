// import express from "express";
// import axios from "axios";
// import { GoogleGenerativeAI } from "@google/generative-ai";
// import Experience from "../../models/experiences/Experience.js"; // Adjust the path as needed
// import geohash from 'ngeohash'; // Import the geohash library

// const router = express.Router();
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// /* ---------------------------------------------------------------------------
//    Utility Function: Reverse Geocoding to Extract a Stable Location Name
//    --------------------------------------------------------------------------- */
// const getLocationNameFromCoordinates = async (lat, lon) => {
//   try {
//     const response = await axios.get(
//       `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${process.env.GOOGLE_PLACES_API_KEY}`
//     );
//     const results = response.data.results;
//     if (!results || results.length === 0) return null;
//     const addressComponents = results[0].address_components;
//     // Prefer locality; fallback to administrative_area_level_1
//     const locality = addressComponents.find(comp => comp.types.includes("locality"));
//     const adminArea = addressComponents.find(comp => comp.types.includes("administrative_area_level_1"));
//     const locationName = locality?.long_name || adminArea?.long_name || null;
//     return locationName;
//   } catch (error) {
//     console.error("Error in reverse geocoding:", error.message);
//     return null;
//   }
// };

// // Normalize the location name to be used as a key in the DB, including a geohash.
// const normalizeLocationName = (name, lat, lon) => {
//   const baseKey = name.toLowerCase().replace(/\s+/g, "_").trim();
//   // Geohash precision of 6 gives a cell size of approximately 1.2km x 0.6km
//   const geoHash = geohash.encode(lat, lon, 6);
//   return `${baseKey}_${geoHash}`;
// };

// /* ---------------------------------------------------------------------------
//    Places Caching & API Functions
//    --------------------------------------------------------------------------- */
// const placesCache = {
//   attractions: new Map(),
//   additional_attractions: new Map(),
//   getKey: (lat, lon, radius) => `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`,
//   get: function (type, lat, lon, radius) {
//     const key = this.getKey(lat, lon, radius);
//     return this[type].get(key);
//   },
//   set: function (type, lat, lon, radius, data) {
//     const key = this.getKey(lat, lon, radius);
//     this[type].set(key, data);
//     // Cache expires in 1 hour
//     setTimeout(() => {
//       console.log(`Cache expired and removed for key: ${key}`);
//       this[type].delete(key);
//     }, 60 * 60 * 1000);
//     console.log(`Cache set for key: ${key}`);
//   },
// };

// const getNearbyPlaces = async (lat, lon, radius = 15000) => {
//   const type = "attractions";
//   try {
//     const cachedData = placesCache.get(type, lat, lon, radius);
//     if (cachedData) {
//       console.log(`Cache hit for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}`);
//       return cachedData;
//     }
//     console.log(`Cache miss for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}. Fetching from API...`);
//     const response = await axios.get(
//       `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=tourist_attraction&key=${process.env.GOOGLE_PLACES_API_KEY}`
//     );
//     const places = response.data.results.map((place) => ({
//       locationName: place.name,
//       lat: place.geometry.location.lat,
//       lon: place.geometry.location.lng,
//       placeId: place.place_id,
//       types: place.types,
//       rating: place.rating || "N/A",
//       vicinity: place.vicinity || null,
//     }));
//     placesCache.set(type, lat, lon, radius, places);
//     return places;
//   } catch (error) {
//     console.error("Failed to fetch nearby places:", error.message);
//     return [];
//   }
// };

// const getLocationPhotos = async (placeId) => {
//   if (!placeId) return [];
//   try {
//     const detailsResponse = await axios.get(
//       `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${process.env.GOOGLE_PLACES_API_KEY}`
//     );
//     if (detailsResponse.data.result && detailsResponse.data.result.photos) {
//       return detailsResponse.data.result.photos.slice(0, 3).map(photo => {
//         return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
//       });
//     }
//     return [];
//   } catch (error) {
//     console.error(`Failed to fetch photos for placeId ${placeId}:`, error.message);
//     return [];
//   }
// };

// /* ---------------------------------------------------------------------------
//    Experience Generation Helpers (Categorization, Selection, Generation)
//    --------------------------------------------------------------------------- */
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
//     let categorized = false;
//     if (types.includes("museum")) { categories.museums.push(place); categorized = true; }
//     if (types.includes("park") || types.includes("natural_feature")) { categories.nature.push(place); categorized = true; }
//     if (types.includes("church") || types.includes("mosque") || types.includes("temple") ||
//         types.includes("hindu_temple") || types.includes("synagogue") || types.includes("place_of_worship")) { categories.religious.push(place); categorized = true; }
//     if (types.includes("art_gallery") || types.includes("performing_arts_theater")) { categories.arts.push(place); categorized = true; }
//     if (types.includes("amusement_park") || types.includes("zoo") || types.includes("aquarium")) { categories.entertainment.push(place); categorized = true; }
//     if (types.includes("department_store") || types.includes("shopping_mall")) { categories.shopping.push(place); categorized = true; }
//     if (types.some(type => type.includes("historic") || type.includes("monument") || type.includes("castle"))) { categories.historical.push(place); categorized = true; }
//     if (types.includes("neighborhood") || types.includes("sublocality")) { categories.neighborhoods.push(place); categorized = true; }
//     if (types.includes("landmark") || types.includes("point_of_interest")) { categories.landmarks.push(place); categorized = true; }
//     if (!categorized) { categories.other.push(place); }
//   });

//   // De-duplicate across categories
//   const seenPlaceIds = new Set();
//   for (const category in categories) {
//     categories[category] = categories[category].filter(place => {
//       if (seenPlaceIds.has(place.placeId)) return false;
//       seenPlaceIds.add(place.placeId);
//       return true;
//     });
//   }
//   return categories;
// };

// const getWeightedRandomSelection = (items, count, weights = null) => {
//   if (!items || items.length === 0) return [];
//   const numToSelect = Math.min(count, items.length);
//   if (items.length <= count) return [...items];

//   const selected = [];
//   const availableItems = [...items];
//   let currentWeights = weights ? [...weights] : null;

//   for (let i = 0; i < numToSelect; i++) {
//     let index;
//     if (currentWeights && currentWeights.length === availableItems.length && currentWeights.length > 0) {
//       const totalWeight = currentWeights.reduce((sum, w) => sum + w, 0);
//       if (totalWeight <= 0) {
//         index = Math.floor(Math.random() * availableItems.length);
//       } else {
//         let random = Math.random() * totalWeight;
//         for (index = 0; index < currentWeights.length; index++) {
//           random -= currentWeights[index];
//           if (random <= 0) break;
//         }
//         index = Math.min(index, availableItems.length - 1);
//       }
//     } else {
//       index = Math.floor(Math.random() * availableItems.length);
//     }
//     selected.push(availableItems[index]);
//     availableItems.splice(index, 1);
//     if (currentWeights) {
//       currentWeights.splice(index, 1);
//     }
//   }
//   return selected;
// };

// const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
//   if (!attractions || attractions.length === 0) return [];
//   const categorized = categorizeAttractions(attractions);

//   // Compute squared distances from user for weighting
//   attractions.forEach(place => {
//     const epsilon = 0.0001;
//     place.distanceSq = Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2) + epsilon;
//   });

//   const themeSets = [
//     ["Historical Highlights", ["historical", "landmarks", "museums"], 2],
//     ["Arts & Culture", ["arts", "museums", "historical", "landmarks"], 2],
//     ["Nature Escape", ["nature", "landmarks", "parks"], 2],
//     ["Religious & Spiritual Sites", ["religious", "historical", "landmarks"], 2],
//     ["Family Fun", ["entertainment", "nature", "landmarks", "zoo", "aquarium"], 2],
//     ["Local Vibe & Shopping", ["neighborhoods", "shopping", "landmarks", "cafes"], 2],
//     ["Hidden Gems & Local Spots", ["other", "landmarks", "neighborhoods", "restaurants"], 2],
//     ["Architectural Wonders", ["historical", "religious", "landmarks", "modern_architecture"], 2],
//     ["Scenic Views & Photo Ops", ["nature", "landmarks", "historical", "viewpoints"], 2],
//     ["Cultural Immersion", ["museums", "arts", "neighborhoods", "markets"], 2]
//   ];

//   const locationSets = [];
//   const usedPlaceIdsInSession = new Set();
//   for (let i = 0; i < numSets && i < themeSets.length; i++) {
//     const [theme, categoriesToUse] = themeSets[i];
//     let availableForTheme = [];
//     categoriesToUse.forEach(category => {
//       if (categorized[category] && categorized[category].length > 0) {
//         const uniquePlacesInCategory = categorized[category].filter(p => !usedPlaceIdsInSession.has(p.placeId));
//         availableForTheme = availableForTheme.concat(uniquePlacesInCategory);
//       }
//     });
//     // Remove duplicates
//     availableForTheme = Array.from(new Map(availableForTheme.map(item => [item.placeId, item])).values());
//     if (availableForTheme.length < 2) continue;
//     const weights = availableForTheme.map(place => 1 / place.distanceSq);
//     const selectedLocations = getWeightedRandomSelection(availableForTheme, locationsPerSet, weights);
//     if (selectedLocations.length >= 2) {
//       locationSets.push({ theme, locations: selectedLocations });
//       selectedLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
//     }
//   }
//   // Fallback if not enough sets
//   if(locationSets.length < Math.min(numSets, 5) && attractions.length >= locationsPerSet) {
//     console.log("Generating additional 'Best Of' sets due to low theme-specific results.");
//     const allAvailable = attractions.filter(p => !usedPlaceIdsInSession.has(p.placeId));
//     if(allAvailable.length >= 2) {
//       const weights = allAvailable.map(place => 1 / place.distanceSq);
//       const bestOfLocations = getWeightedRandomSelection(allAvailable, locationsPerSet, weights);
//       if(bestOfLocations.length >= 2) {
//         locationSets.push({ theme: "Best Of The Area", locations: bestOfLocations });
//         bestOfLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
//       }
//     }
//   }
//   console.log(`Generated ${locationSets.length} diverse location sets.`);
//   return locationSets;
// };

// const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
//   if (!nearbyPlaces || nearbyPlaces.length === 0) {
//     console.error("fetchGeminiExperiences called with no nearby places.");
//     return [];
//   }
//   try {
//     const locationName = await getLocationNameFromCoordinates(latitude, longitude);
//     console.log(`Generating experiences for: ${locationName}`);
//     const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude, 10, 4);
//     if (diverseLocationSets.length === 0) {
//       console.error("Failed to generate any diverse location sets from nearby places.");
//       const fallbackPlaces = nearbyPlaces.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);
//       if (fallbackPlaces.length >= 2) {
//         console.log("Using fallback selection of top places.");
//         diverseLocationSets.push({ theme: `Highlights of ${locationName}`, locations: fallbackPlaces });
//       } else {
//         return [];
//       }
//     }

//     const model = genAI.getGenerativeModel({
//       model: "gemini-1.5-flash",
//       safetySettings: [
//         { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
//         { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
//         { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
//         { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
//       ],
//       generationConfig: {
//         temperature: 0.7,
//         topP: 0.9,
//         topK: 40,
//         maxOutputTokens: 8192,
//         responseMimeType: "application/json"
//       }
//     });

//     const generatedExperiences = [];
//     const generationPromises = [];
//     for (let i = 0; i < diverseLocationSets.length; i++) {
//       const locationSet = diverseLocationSets[i];
//       if (!locationSet.locations || locationSet.locations.length < 2) continue;
//       const locationListString = locationSet.locations
//         .map(loc => `- ${loc.locationName} (Place ID: ${loc.placeId || "N/A"})`)
//         .join("\n");

//       const themePrompt = `
// You are an expert local tour guide for ${locationName}. Create a single, compelling, themed tour experience titled "${locationSet.theme}".

// Your tour focuses *exclusively* on the following real locations:
// ${locationListString}

// Generate a JSON object for this tour. The JSON object MUST follow this exact structure:
// {
//   "title": "An engaging title for the '${locationSet.theme}' tour in ${locationName}",
//   "description": "A brief (2-3 sentences) overall tour description connecting these specific locations under the theme '${locationSet.theme}'. Mention the general area (${locationName}).",
//   "locations": [
//     {
//       "locationName": "Full Name of Location 1",
//       "lat": ${locationSet.locations[0].lat},
//       "lon": ${locationSet.locations[0].lon},
//       "placeId": "${locationSet.locations[0].placeId || ''}",
//       "narration": "Detailed 150-300 word first-person narration for this specific location. Include: Welcome, sensory details, brief history/significance, interesting facts, connection to '${locationSet.theme}', and a transition hint.",
//       "photos": []
//     }
//     // Repeat for each location provided.
//   ]
// }
// Constraints:
// - Output ONLY the JSON object.
// - The 'locations' array must contain an object for each location.
// - Ensure 'lat', 'lon', and 'placeId' are correctly copied.
// - Keep narration concise (150-300 words per location).
// `;

//       generationPromises.push(
//         model.generateContent({
//           contents: [{ role: "user", parts: [{ text: themePrompt }] }]
//         })
//         .then(async result => {
//           if (
//             !result.response ||
//             !result.response.candidates ||
//             !result.response.candidates[0].content ||
//             !result.response.candidates[0].content.parts ||
//             !result.response.candidates[0].content.parts[0].text
//           ) {
//             throw new Error(`Invalid response structure from Gemini for theme: ${locationSet.theme}`);
//           }
//           const responseText = result.response.candidates[0].content.parts[0].text;
//           let experience;
//           try {
//             experience = JSON.parse(responseText);
//           } catch(parseError) {
//             console.error(`JSON parsing failed for theme ${locationSet.theme}. Raw response:`, responseText);
//             throw new Error(`Failed to parse JSON response for theme ${locationSet.theme}: ${parseError.message}`);
//           }
//           if (!experience || !experience.title || !experience.description || !Array.isArray(experience.locations)) {
//             console.error("Parsed JSON is missing required fields for theme:", locationSet.theme, experience);
//             throw new Error(`Invalid JSON structure for theme: ${locationSet.theme}`);
//           }
//           const enhancedLocations = await Promise.all(
//             experience.locations.map(async (genLocation) => {
//               const inputLocation = locationSet.locations.find(
//                 inputLoc =>
//                   (genLocation.placeId && inputLoc.placeId === genLocation.placeId) ||
//                   (inputLoc.locationName.toLowerCase() === genLocation.locationName.toLowerCase() &&
//                     Math.abs(inputLoc.lat - genLocation.lat) < 0.001 &&
//                     Math.abs(inputLoc.lon - genLocation.lon) < 0.001)
//               );
//               if (!inputLocation) {
//                 console.warn(`Could not match generated location "${genLocation.locationName}" for theme ${locationSet.theme}.`);
//                 const photos = genLocation.placeId ? await getLocationPhotos(genLocation.placeId) : [];
//                 return { ...genLocation, photos: photos || [] };
//               }
//               const photos = await getLocationPhotos(inputLocation.placeId);
//               return {
//                 locationName: inputLocation.locationName,
//                 lat: inputLocation.lat,
//                 lon: inputLocation.lon,
//                 placeId: inputLocation.placeId,
//                 types: inputLocation.types || [],
//                 rating: inputLocation.rating || null,
//                 vicinity: inputLocation.vicinity || null,
//                 narration: genLocation.narration || `Welcome to ${inputLocation.locationName}.`,
//                 photos: photos || []
//               };
//             })
//           );
//           generatedExperiences.push({ ...experience, locations: enhancedLocations });
//           console.log(`Successfully generated experience for theme: ${locationSet.theme}`);
//         })
//         .catch(error => {
//           console.error(`Error processing generation for theme ${locationSet.theme}:`, error.message);
//         })
//       );
//     }

//     await Promise.allSettled(generationPromises);
//     console.log(`Finished generating experiences. ${generatedExperiences.length} successful.`);
//     return generatedExperiences;
//   } catch (error) {
//     console.error("Gemini API or processing error:", error);
//     return [];
//   }
// };

// /* ---------------------------------------------------------------------------
//    Simple In-Memory Rate Limiter Middleware
//    --------------------------------------------------------------------------- */
// const rateLimiter = {
//   requests: new Map(),
//   limit: 60, // per minute
//   windowMs: 60 * 1000,
//   resetTimeouts: new Map(),
//   check: function(ip) {
//     const now = Date.now();
//     const windowStart = now - this.windowMs;
//     if (Math.random() < 0.01) {
//       this.requests.forEach((data, keyIp) => {
//         if (data.firstRequestTimestamp < windowStart) {
//           this.requests.delete(keyIp);
//           const timeoutId = this.resetTimeouts.get(keyIp);
//           if (timeoutId) clearTimeout(timeoutId);
//           this.resetTimeouts.delete(keyIp);
//         }
//       });
//     }
//     let requestData = this.requests.get(ip);
//     if (!requestData || requestData.firstRequestTimestamp < windowStart) {
//       requestData = { count: 1, firstRequestTimestamp: now };
//       this.requests.set(ip, requestData);
//       const existingTimeout = this.resetTimeouts.get(ip);
//       if (existingTimeout) clearTimeout(existingTimeout);
//       const timeoutId = setTimeout(() => {
//         this.requests.delete(ip);
//         this.resetTimeouts.delete(ip);
//       }, this.windowMs);
//       this.resetTimeouts.set(ip, timeoutId);
//       return true;
//     }
//     if (requestData.count < this.limit) {
//       requestData.count++;
//       return true;
//     }
//     return false;
//   }
// };

// const rateLimit = (req, res, next) => {
//   const ip = req.ip || req.connection.remoteAddress;
//   if (!rateLimiter.check(ip)) {
//     console.warn(`Rate limit exceeded for IP: ${ip}`);
//     return res.status(429).json({ error: "Too many requests, please try again later." });
//   }
//   next();
// };

// /* ---------------------------------------------------------------------------
//    Main API Route: Using Location Name + Geohash as Key for Caching Experiences
//    --------------------------------------------------------------------------- */
// router.post("/", rateLimit, async (req, res) => {
//   try {
//     const { lat, lon, user_id } = req.body; // user_id can be supplied from the client if available
//     if (!lat || !lon) {
//       return res.status(400).json({ error: "Latitude and longitude are required." });
//     }

//     // Reverse geocode to obtain a stable location name key.
//     const rawLocationName = await getLocationNameFromCoordinates(lat, lon);
//     if (!rawLocationName) {
//       return res.status(500).json({ error: "Failed to determine location name." });
//     }
//     // Generate locationKey including geohash
//     const locationKey = normalizeLocationName(rawLocationName, lat, lon);
//     console.log("Generated locationKey:", locationKey);

//     // Query for ANY experiences with this locationKey
//     const existingExperiences = await Experience.find({ locationKey });
//     console.log("Found cached experiences:", existingExperiences);

//     if (existingExperiences && existingExperiences.length > 0) {
//       console.log(`Returning cached experiences for ${locationKey}`);
//       return res.json({ experiences: existingExperiences });
//     }

//     // No cached experiences for this location: get nearby places and generate new experiences.
//     const nearbyPlaces = await getNearbyPlaces(lat, lon, 15000);
//     const generatedExperiences = await fetchGeminiExperiences(nearbyPlaces, lat, lon);
//     if (generatedExperiences.length === 0) {
//       return res.status(500).json({ error: "Failed to generate experiences." });
//     }

//     // Use the provided user_id or a fallback value ("system") if not provided.
//     const effectiveUserId = user_id || "system";

//     const enrichedExperiences = generatedExperiences.map(exp => ({
//       ...exp,
//       user_id: effectiveUserId,
//       locationKey,
//       times_shown: 0,
//       created_at: new Date()
//     }));
//     const savedExperiences = await Experience.insertMany(enrichedExperiences);
//     console.log(`Saved ${savedExperiences.length} experiences for ${locationKey} by user ${effectiveUserId}`);
//     return res.json({ experiences: savedExperiences });
//   } catch (error) {
//     console.error("Error in /api/experiences:", error);
//     return res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// export default router;

import express from "express";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Experience from "../../models/experiences/Experience.js"; // Adjust the path as needed
import geohash from 'ngeohash'; // Import the geohash library

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/* ---------------------------------------------------------------------------
   Utility Function: Reverse Geocoding to Extract a Stable Location Name
   --------------------------------------------------------------------------- */
const getLocationNameFromCoordinates = async (lat, lon) => {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    const results = response.data.results;
    if (!results || results.length === 0) return null;
    // Prefer locality, then administrative_area_level_1, then administrative_area_level_2
    const addressComponents = results[0].address_components;
    const locality = addressComponents.find(comp => comp.types.includes("locality"));
    const adminArea1 = addressComponents.find(comp => comp.types.includes("administrative_area_level_1"));
    const adminArea2 = addressComponents.find(comp => comp.types.includes("administrative_area_level_2"));

    const locationName = locality?.long_name || adminArea1?.long_name || adminArea2?.long_name || null;
    return locationName;
  } catch (error) {
    console.error("Error in reverse geocoding:", error.message);
    return null;
  }
};

// Normalize the location name to be used as a key in the DB, including a geohash.
const normalizeLocationName = (name, lat, lon) => {
  // Sanitize name: replace non-alphanumeric/underscore with underscore, remove leading/trailing underscores
  const baseKey = name.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  // Geohash precision of 6 gives a cell size of approximately 1.2km x 0.6km
  const geoHash = geohash.encode(lat, lon, 6);
  return `${baseKey}_${geoHash}`;
};

/* ---------------------------------------------------------------------------
   Places Caching & API Functions (Updated)
   --------------------------------------------------------------------------- */
const placesCache = {
  attractions: new Map(),
  // Include radius and fetched types in the cache key
  getKey: (lat, lon, radius, types) => `${lat.toFixed(4)},${lon.toFixed(4)},${radius},${types.sort().join("_")}`,
  get: function (lat, lon, radius, types) {
    const key = this.getKey(lat, lon, radius, types);
    return this.attractions.get(key);
  },
  set: function (lat, lon, radius, types, data) {
    const key = this.getKey(lat, lon, radius, types);
    this.attractions.set(key, data);
    // Cache expires in 1 hour (adjust as needed)
    setTimeout(() => {
      console.log(`Cache expired and removed for key: ${key}`);
      this.attractions.delete(key);
    }, 60 * 60 * 1000);
    console.log(`Cache set for key: ${key} for ${data.length} places.`);
  },
};

// --- Helper to fetch a single page with a type and token ---
const fetchPlacesPage = async (lat, lon, radius, type, pageToken = null) => {
    const params = {
        location: `${lat},${lon}`,
        radius: radius,
        type: type,
        key: process.env.GOOGLE_PLACES_API_KEY,
    };
    if (pageToken) {
        params.pageToken = pageToken;
    }
    try {
        // Add a small delay for pagination requests as recommended by Google
        if (pageToken) {
             await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        }
        const response = await axios.get(
            `https://maps.googleapis.com/maps/api/place/nearbysearch/json`,
            { params }
        );
        if (response.data.status === 'OK' || response.data.status === 'ZERO_RESULTS') {
             return {
                places: response.data.results.map((place) => ({
                    locationName: place.name,
                    lat: place.geometry.location.lat,
                    lon: place.geometry.location.lng,
                    placeId: place.place_id,
                    types: place.types || [], // Ensure types is always an array
                    rating: place.rating || null,
                    user_ratings_total: place.user_ratings_total || 0, // Include total ratings for better weighting
                    vicinity: place.vicinity || null,
                })),
                nextPageToken: response.data.next_page_token,
             };
        } else {
            console.error("Google Places API error:", response.data.status, response.data.error_message);
            return { places: [], nextPageToken: null };
        }
    } catch (error) {
        console.error(`Failed to fetch places page for type ${type}:`, error.message);
        return { places: [], nextPageToken: null };
    }
};

// --- Updated getNearbyPlaces with pagination, multiple types, and positive filtering ---
const getNearbyPlaces = async (lat, lon, radius = 15000) => {
  // Define the initial broad types to fetch
  const typesToFetch = ['tourist_attraction', 'point_of_interest', 'landmark', 'museum', 'park']; // Add more if desired for initial fetch volume

  // Use these types for the cache key
  const cacheKeyTypes = typesToFetch;

  const cachedData = placesCache.get(lat, lon, radius, cacheKeyTypes);
  if (cachedData) {
    console.log(`Cache hit for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}, Types: ${cacheKeyTypes.join(',')}`);
    return cachedData;
  }

  console.log(`Cache miss for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}, Types: ${cacheKeyTypes.join(',')}. Fetching from API...`);

  let allPlaces = [];
  const fetchedPlaceIds = new Set(); // Use a Set to ensure unique places by placeId across all fetches

  // Fetch places for each type, including pagination
  for (const type of typesToFetch) {
      let pageToken = null;
      let placesFetchedForType = 0;
      const maxPages = 3; // Google Places API limits to 3 pages per request

      console.log(`Workspaceing places for type: ${type}`);
      for (let i = 0; i < maxPages; i++) {
          const { places, nextPageToken } = await fetchPlacesPage(lat, lon, radius, type, pageToken);

          places.forEach(place => {
              if (!fetchedPlaceIds.has(place.placeId)) {
                  allPlaces.push(place);
                  fetchedPlaceIds.add(place.placeId);
              }
          });
          placesFetchedForType += places.length;

          if (nextPageToken && i < maxPages - 1) { // Continue to next page if token exists and not on the last page loop
              pageToken = nextPageToken;
          } else {
              break; // No more pages or reached max pages for this type
          }
      }
      console.log(`Workspaceed ${placesFetchedForType} raw results for type '${type}'. Total unique places collected so far: ${allPlaces.length}`);
  }

  // --- Positive Filtering Step: Keep places with AT LEAST ONE relevant type ---
  // This list is more comprehensive than the initial fetch types and defines what we consider relevant for experiences.
  const relevantTypes = [
      'tourist_attraction',
      'point_of_interest', // General but important inclusion
      'landmark',
      'museum',
      'park',
      'natural_feature',
      'historical_site',
      'church', // Often architectural/historical landmarks
      'art_gallery',
      'performing_arts_theater',
      'zoo',
      'aquarium',
      'amusement_park',
      'national_park',
      'campground',
      'university', // Often have notable architecture or history (e.g., historic campus)
      'library', // Can be architecturally significant or cultural hubs
      'stadium', // Can be landmarks
      'town_square', // Important public spaces
      'place_of_worship', // Broader religious category
      'cathedral', 'synagogue', 'temple', 'mosque', // Specific religious types
      'castle',
      'palace',
      'ruins',
       'bridge', // Often landmarks or architectural interest
       'building', // Some general buildings can be landmarks
       'tourist_information_center', // Might be useful starting points (though maybe exclude from *sets*)
       'viewpoint', 'scenic_spot' // Custom types for scenic locations
      // Add or remove types here to fine-tune what qualifies as a relevant place
  ];

  const filteredPlaces = allPlaces.filter(place =>
      place.types.some(type => relevantTypes.includes(type))
  );

  console.log(`Filtered down to ${filteredPlaces.length} relevant places using the positive list.`);

  placesCache.set(lat, lon, radius, cacheKeyTypes, filteredPlaces); // Cache the filtered list
  return filteredPlaces;
};


const getLocationPhotos = async (placeId) => {
  if (!placeId) {
      console.warn("getLocationPhotos called with null placeId.");
      return [];
  }
  try {
    const detailsResponse = await axios.get(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    if (detailsResponse.data.result && detailsResponse.data.result.photos) {
      // Return up to 3 photo URLs
      return detailsResponse.data.result.photos.slice(0, 3).map(photo => {
        return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
      });
    }
    return []; // No photos found
  } catch (error) {
    console.error(`Failed to fetch photos for placeId ${placeId}:`, error.message);
    // Return empty array on error so it doesn't block the experience generation
    return [];
  }
};

/* ---------------------------------------------------------------------------
   Experience Generation Helpers (Categorization, Selection, Generation) - Updated
   --------------------------------------------------------------------------- */
const categorizeAttractions = (attractions) => {
    const categories = {
        museums: [],
        historical: [],
        nature: [],
        entertainment: [],
        religious: [],
        arts: [],
        shopping: [], // Can include malls, markets - less focus for core tours
        neighborhoods: [], // Good for local vibe
        landmarks: [],
        architecture: [], // Added architectural category
        viewpoints: [], // Added viewpoints/scenic category
        other: [], // For relevant 'point_of_interest' or less common types that passed the filter
    };

    attractions.forEach(place => {
        const types = place.types || [];
        let categorized = false;

        // Categorize based on types - prioritize more specific categories
        if (types.includes("museum")) { categories.museums.push(place); categorized = true; }
        if (types.includes("art_gallery") || types.includes("performing_arts_theater")) { categories.arts.push(place); categorized = true; }
        if (types.includes("park") || types.includes("natural_feature") || types.includes("national_park") || types.includes("campground")) { categories.nature.push(place); categorized = true; }
        if (types.includes("church") || types.includes("mosque") || types.includes("temple") ||
            types.includes("hindu_temple") || types.includes("synagogue") || types.includes("place_of_worship") || types.includes("cathedral")) { categories.religious.push(place); categorized = true; }
        if (types.includes("amusement_park") || types.includes("zoo") || types.includes("aquarium")) { categories.entertainment.push(place); categorized = true; }
        // Broader historical types
        if (types.some(type => type.includes("historic") || type.includes("castle") || type.includes("palace") || type.includes("ruins"))) { categories.historical.push(place); categorized = true; }
        if (types.includes("shopping_mall") || types.includes("department_store") || types.includes("market")) { categories.shopping.push(place); categorized = true; }
        if (types.includes("neighborhood") || types.includes("sublocality")) { categories.neighborhoods.push(place); categorized = true; }
         if (types.includes("landmark")) { categories.landmarks.push(place); categorized = true; } // Specific landmark type
        // Architectural types (look for building or architecture or specific building types like bridge)
        if (types.some(type => type.includes("architecture") || type.includes("building") || type.includes("bridge"))) { categories.architecture.push(place); categorized = true; }
        if (types.some(type => type.includes("viewpoint") || type.includes("scenic_spot"))) { categories.viewpoints.push(place); categorized = true; } // Capture scenic spots

        // Catch remaining relevant point_of_interest places that didn't fit a specific category
        if (types.includes("point_of_interest") && !categorized) {
             // Optionally try to infer category from name for common POI types
             const name = place.locationName.toLowerCase();
             if (name.includes(" square") || name.includes(" plaza")) { categories.landmarks.push(place); categorized = true; }
             else if (name.includes(" garden")) { categories.nature.push(place); categorized = true; }
             // Add more name-based inferences if needed
             else { categories.other.push(place); categorized = true; } // Generic point of interest goes to 'other'
        }

        // If still not categorized but passed the initial relevantTypes filter, put in 'other'
        if (!categorized) {
            categories.other.push(place);
        }
    });

    // De-duplicate places across categories using a Set of placeIds
    const seenPlaceIds = new Set();
    const uniqueCategories = {};
     for (const category in categories) {
         uniqueCategories[category] = [];
         for (const place of categories[category]) {
             if (!seenPlaceIds.has(place.placeId)) {
                 uniqueCategories[category].push(place);
                 seenPlaceIds.add(place.placeId);
             }
         }
     }
     // Log counts of unique places per category (useful for debugging)
     console.log("Categorization counts:", Object.fromEntries(Object.entries(uniqueCategories).map(([key, value]) => [key, value.length])));

    return uniqueCategories;
};

// Simple helper to get weighted random selection
const getWeightedRandomSelection = (items, count, weights = null) => {
  if (!items || items.length === 0 || count <= 0) return [];
  const numToSelect = Math.min(count, items.length);
  if (items.length <= count) return [...items]; // If fewer items than requested, return all

  const selected = [];
  // Work with a copy to avoid modifying the original array
  const availableItems = [...items];
  let currentWeights = weights ? [...weights] : null;

  for (let i = 0; i < numToSelect; i++) {
    let index;
    if (currentWeights && currentWeights.length === availableItems.length) {
      const totalWeight = currentWeights.reduce((sum, w) => sum + w, 0);
      if (totalWeight <= 0) { // Handle cases where all weights are zero or negative
        index = Math.floor(Math.random() * availableItems.length);
      } else {
        let random = Math.random() * totalWeight;
        let weightSum = 0;
        for (index = 0; index < currentWeights.length; index++) {
            weightSum += currentWeights[index];
          if (random <= weightSum) break;
        }
         // Ensure index is within bounds in case of floating point issues
        index = Math.min(index, availableItems.length - 1);
      }
    } else { // Fallback to uniform random if weights are invalid or not provided
      index = Math.floor(Math.random() * availableItems.length);
    }
    selected.push(availableItems[index]);

    // Remove selected item and its weight
    availableItems.splice(index, 1);
    if (currentWeights) {
      currentWeights.splice(index, index + 1);
    }
  }
  return selected;
};


const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
  // Need at least enough unique places to form one set of the desired size
  if (!attractions || attractions.length < locationsPerSet) {
      console.warn(`Not enough unique attractions (${attractions.length}) to generate sets of size ${locationsPerSet}.`);
      // Fallback: return a single set of the best available places if possible
      if (attractions.length >= 2) { // Still need at least 2 for a basic experience
           const weights = attractions.map(place => {
                // Use weighted score (rating * user_ratings_total + small constant) / distanceSq
                const epsilon = 0.0001; // Small constant to avoid division by zero
                const distanceSq = Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2) + epsilon;
                const score = (place.rating || 3) * (place.user_ratings_total > 0 ? Math.log(place.user_ratings_total) : 1); // Log scale for ratings total
                return Math.max(0.1, score / distanceSq); // Ensure weight is not zero or negative
           });
           const fallbackLocations = getWeightedRandomSelection(attractions, locationsPerSet, weights);
            if(fallbackLocations.length >= 2){
                console.log(`Returning a single fallback set of size ${fallbackLocations.length}.`);
                 const fallbackTheme = `Highlights of ${attractions[0]?.vicinity || 'The Area'}`; // Use vicinity of first place as fallback theme
                return [{ theme: fallbackTheme, locations: fallbackLocations }];
            }
      }
      console.log("Cannot even form a fallback set with at least 2 locations.");
      return []; // Cannot generate any valid set
  }
  const categorized = categorizeAttractions(attractions);

  // Compute weighted scores for selection (Rating influence * Popularity influence / Distance influence)
  attractions.forEach(place => {
    const epsilon = 0.0001;
    const distanceSq = Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2) + epsilon;
    // Combine rating and user_ratings_total for a popularity score
    // Using log scale for total ratings so places with 1000 ratings aren't disproportionately favored over 100
    const popularityScore = (place.rating || 3) * (place.user_ratings_total > 0 ? Math.log(place.user_ratings_total + 1) : 1); // Add 1 to ratings total before log to avoid log(0)
    place.weightedScore = Math.max(0.1, popularityScore / distanceSq); // Ensure score is not too low
  });

  // Define themes and categories. Added weights/priorities can influence selection order.
  const themeConfigs = [
      { theme: "Historical Highlights", categories: ["historical", "landmarks", "museums", "religious", "architecture"], weight: 1.2 },
      { theme: "Arts & Culture Exploration", categories: ["arts", "museums", "landmarks", "architecture"], weight: 1.1 },
      { theme: "Nature & Outdoors Escape", categories: ["nature", "landmarks", "viewpoints"], weight: 1.1 },
      { theme: "Religious & Spiritual Heritage", categories: ["religious", "historical", "landmarks", "architecture"], weight: 0.8 },
      { theme: "Family Fun Adventures", categories: ["entertainment", "nature", "landmarks", "museums"], weight: 0.9 },
      { theme: "Local Vibe & Hidden Gems", categories: ["neighborhoods", "other", "point_of_interest", "landmarks", "architecture"], weight: 1.0 }, // Broader local focus
      { theme: "Architectural Wonders", categories: ["architecture", "historical", "religious", "landmarks", "museums", "building"], weight: 0.9 },
      { theme: "Scenic Views & Photo Spots", categories: ["viewpoints", "nature", "landmarks", "architecture"], weight: 1.1 },
      { theme: "Around Town Highlights", categories: ["landmarks", "point_of_interest", "museums", "parks", "other"], weight: 1.2 }, // More general popular spots
      { theme: "City Exploration Mix", categories: ["museums", "arts", "historical", "nature", "landmarks", "architecture", "other"], weight: 1.0 }, // Mix of popular categories
       // Add more diverse themes if needed, e.g., "Shopping & Leisure", "Waterfront Attractions" etc.
  ];

  // Sort themes by weight/priority (higher weight first)
  themeConfigs.sort((a, b) => b.weight - a.weight);

  const locationSets = [];
  const usedPlaceIdsInSession = new Set(); // Track used places *across* sets in this batch to promote diversity

  // Attempt to generate sets based on themes
  for (let i = 0; i < themeConfigs.length && locationSets.length < numSets; i++) {
    const themeConfig = themeConfigs[i];
    const theme = themeConfig.theme;
    const categoriesToUse = themeConfig.categories;

    let availableForTheme = [];
    categoriesToUse.forEach(category => {
        if (categorized[category] && categorized[category].length > 0) {
            // Filter out places already used in a previous set in this run
             const uniquePlacesInCategory = categorized[category].filter(p => !usedPlaceIdsInSession.has(p.placeId));
            availableForTheme = availableForTheme.concat(uniquePlacesInCategory);
        }
    });

    // Remove duplicates within the potential pool for this theme
    availableForTheme = Array.from(new Map(availableForTheme.map(item => [item.placeId, item])).values());

    // If not enough places for the desired set size for this theme, try to make a smaller set
    if (availableForTheme.length < locationsPerSet) {
        console.log(`Not enough unique places (${availableForTheme.length}) available for theme "${theme}" to form a set of size ${locationsPerSet}.`);
        // Option: Try to form a smaller set if there are at least 2 locations available
        if (availableForTheme.length >= 2) {
             const weights = availableForTheme.map(place => place.weightedScore);
             // Select ALL available places for a smaller set
             const selectedLocations = getWeightedRandomSelection(availableForTheme, availableForTheme.length, weights);
             if (selectedLocations.length >= 2) {
                  locationSets.push({ theme, locations: selectedLocations });
                  selectedLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
                   console.log(`Generated smaller set (${selectedLocations.length}) for theme "${theme}".`);
             }
        }
        continue; // Move to the next theme
    }

    // Select locations for the desired set size from the available pool for this theme
    const weights = availableForTheme.map(place => place.weightedScore);
    const selectedLocations = getWeightedRandomSelection(availableForTheme, locationsPerSet, weights);

    if (selectedLocations.length === locationsPerSet) { // Only add if we got the desired number of locations
      locationSets.push({ theme, locations: selectedLocations });
      selectedLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
      console.log(`Generated set for theme: ${theme} with ${selectedLocations.length} locations.`);
    } else {
        console.warn(`Attempted to generate set for "${theme}" but only got ${selectedLocations.length}/${locationsPerSet} locations. Skipping set.`);
    }
  }

    // Final Fallback: If we still haven't reached the target number of sets, create generic sets from remaining unused places
    const remainingUnused = attractions.filter(p => !usedPlaceIdsInSession.has(p.placeId));
    console.log(`Remaining unused places for potential fallback sets: ${remainingUnused.length}`);

    while (locationSets.length < numSets && remainingUnused.length >= locationsPerSet) {
         console.log(`Generating additional generic 'More Highlights' set. Sets generated so far: ${locationSets.length}`);
         const weights = remainingUnused.map(place => place.weightedScore);
         const selectedLocations = getWeightedRandomSelection(remainingUnused, locationsPerSet, weights);

         if (selectedLocations.length === locationsPerSet) { // Only add if we got the desired number
              locationSets.push({ theme: `More Highlights of ${attractions[0]?.vicinity || 'The Area'} (Set ${locationSets.length + 1})`, locations: selectedLocations }); // Use first vicinity as fallback theme
              selectedLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
              // Remove selected places from remainingUnused for the next iteration
              selectedLocations.forEach(selectedLoc => {
                  const index = remainingUnused.findIndex(p => p.placeId === selectedLoc.placeId);
                   if (index > -1) {
                       remainingUnused.splice(index, 1);
                   }
              });
         } else {
             console.warn(`Cannot form another generic set of size ${locationsPerSet} from remaining unused places.`);
             break; // Cannot form another set of the desired size
         }
     }


  console.log(`Finished generateDiverseLocationSets. Total sets generated: ${locationSets.length}. Target: ${numSets}`);
  return locationSets;
};


const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
  // Need enough places to potentially form at least one set of the desired size
  const MIN_PLACES_FOR_GENERATION = 4; // Corresponds to locationsPerSet default
   if (!nearbyPlaces || nearbyPlaces.length < MIN_PLACES_FOR_GENERATION) {
    console.error(`WorkspaceGeminiExperiences called with insufficient nearby places (${nearbyPlaces?.length || 0}) for generation.`);
    return [];
  }
  try {
    const locationName = await getLocationNameFromCoordinates(latitude, longitude);
     // Use a fallback name for prompts if reverse geocoding fails
     const areaDescription = locationName || `the area around ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    console.log(`Attempting to generate experiences for: ${areaDescription}`);

     // Attempt to generate multiple sets (e.g., 10 sets of 4 places)
    const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude, 10, 4);

    if (diverseLocationSets.length === 0) {
      console.warn(`Failed to generate any diverse location sets from ${nearbyPlaces.length} nearby places.`);
       // Check if we can at least generate a basic "Top Rated" set from the initial pool if no themed sets worked
       if (nearbyPlaces.length >= 2) { // Need at least 2 places for any set
            console.log("Using fallback selection of top rated/closest popular places.");
            // Sort by weighted score (rating * popularity / inverse distance)
            const sortedPlaces = nearbyPlaces.sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0));
             const fallbackPlaces = sortedPlaces.slice(0, Math.min(nearbyPlaces.length, 5)); // Take up to 5 best places

            if (fallbackPlaces.length >= 2) {
                 // Add a single fallback set
                diverseLocationSets.push({ theme: `Top Highlights of ${areaDescription}`, locations: fallbackPlaces });
                 console.log(`Added a single fallback set based on sorting, size ${fallbackPlaces.length}.`);
            } else {
                 console.warn("Not enough places (less than 2) even for a basic fallback set.");
                 return []; // Cannot generate any set
            }
       } else {
             console.warn("Insufficient initial places found (less than 2) to attempt any set generation.");
            return []; // Still not enough places for even a fallback set
       }
    }
    console.log(`Proceeding with generating ${diverseLocationSets.length} location sets using Gemini.`);


    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", // Use 1.5 Flash for speed and cost
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
      ],
      generationConfig: {
        temperature: 0.7, // Slightly creative but focused
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 2048, // Adjust based on expected JSON size per set (aim for smaller JSON)
        responseMimeType: "application/json" // Request JSON output
      }
    });

    const generatedExperiences = [];
    const MAX_CONCURRENT_GENERATIONS = 5; // Limit concurrent Gemini calls to manage API limits and memory

    // Async function to process a single location set through Gemini
    const processSet = async (locationSet) => {
         if (!locationSet.locations || locationSet.locations.length < 2) {
              console.warn(`Skipping set with insufficient locations for theme: ${locationSet.theme}`);
              return null; // Return null or reject to indicate failure
         }
         // Create a clear list of locations for the prompt
         const locationListString = locationSet.locations
            .map(loc => `- ${loc.locationName} (Place ID: ${loc.placeId || 'N/A'})`)
            .join("\n");

         const themePrompt = `
You are an expert local tour guide for ${areaDescription}. Create a single, compelling, themed tour experience titled "${locationSet.theme}".

Your tour focuses *exclusively* on the following real locations in ${areaDescription}. Do NOT include any other locations:
${locationListString}

Generate a JSON object for this tour. The JSON object MUST follow this exact structure:
{
  "title": "An engaging title for the '${locationSet.theme}' tour in ${areaDescription}",
  "description": "A brief (2-3 sentences) overall tour description connecting these specific locations under the theme '${locationSet.theme}'. Mention the general area (${areaDescription}).",
  "locations": [
    {
      "locationName": "Full Name of Location 1",
      "narration": "Detailed 150-300 word first-person narration for this specific location. Include: Welcome to the location, sensory details, brief history/significance, interesting facts, connection to the overall theme '${locationSet.theme}', and a subtle transition hint towards the next stop.",
      "lat": ${locationSet.locations[0].lat}, // Include original coordinates
      "lon": ${locationSet.locations[0].lon},
      "placeId": "${locationSet.locations[0].placeId || ''}" // Include original place ID
      // Photos will be added separately
    }
    // Repeat this object structure for EACH of the provided locations, ensuring lat, lon, and placeId are copied correctly.
    // Maintain the order of locations if possible, but prioritize including all listed locations.
  ]
}
Constraints:
- Output ONLY the JSON object.
- The 'locations' array must contain an object for EACH of the provided locations from the list above.
- Ensure 'lat', 'lon', and 'placeId' are correctly copied for each location object.
- Narration length must be detailed (aim for 150-300 words per location).
- The title and description must incorporate the theme and area name.
- Do not include introductory or concluding text outside the JSON.
- Do not include a 'photos' key in the generated JSON; photos are added in post-processing.
`;
         try {
            console.log(`Sending prompt to Gemini for theme: ${locationSet.theme}`);
            const result = await model.generateContent({
              contents: [{ role: "user", parts: [{ text: themePrompt }] }]
            });

             // Check for blocked candidates or empty response
            if (!result?.response?.candidates || result.response.candidates.length === 0) {
                 console.warn(`Gemini returned no candidates for theme: ${locationSet.theme}. Response:`, result.response);
                 // Check prompt feedback for safety reasons
                 if (result.response?.promptFeedback) {
                     console.warn("Prompt Feedback:", JSON.stringify(result.response.promptFeedback, null, 2));
                 }
                 throw new Error(`Gemini generated no content for theme: ${locationSet.theme}. Check safety settings/prompt.`);
            }

            // Get the text response, assuming the first candidate is the desired one
            const responseText = result.response.candidates[0].content.parts[0].text;

            let experience;
            try {
              // Attempt to parse the JSON, cleaning potential markdown code block markers
               const cleanedResponseText = responseText.replace(/```json\n|\n```/g, '').trim();
              experience = JSON.parse(cleanedResponseText);
            } catch(parseError) {
              console.error(`JSON parsing failed for theme ${locationSet.theme}. Raw response:`, responseText);
               // Throw error to indicate parsing failure
              throw new Error(`Failed to parse JSON response for theme ${locationSet.theme}: ${parseError.message}`);
            }

            // Validate the parsed JSON structure
            if (!experience || typeof experience !== 'object' || !experience.title || typeof experience.title !== 'string' || !experience.description || typeof experience.description !== 'string' || !Array.isArray(experience.locations) || experience.locations.length === 0) {
              console.error("Parsed JSON is missing required fields or has invalid structure for theme:", locationSet.theme, experience);
              throw new Error(`Invalid JSON structure for theme: ${locationSet.theme}`);
            }

            // --- Post-processing: Map generated narration back to original location data and fetch photos ---
            const finalLocations = await Promise.all(locationSet.locations.map(async (inputLocation) => {
                 // Find the generated location object that corresponds to this input location
                 const genLocMatch = experience.locations.find(
                      genLocation =>
                          (genLocation.placeId && inputLocation.placeId === genLocation.placeId) || // Match by placeId first
                          (inputLocation.locationName.toLowerCase() === genLocation.locationName.toLowerCase() && // Fallback match by name and coords
                            Math.abs(inputLocation.lat - (genLocation.lat || Infinity)) < 0.001 && // Ensure lat/lon exist in generated data before comparing
                            Math.abs(inputLocation.lon - (genLocation.lon || Infinity)) < 0.001)
                  );

                 // Fetch photos for the original input location's placeId
                 const photos = await getLocationPhotos(inputLocation.placeId);

                 // Return an object structure based on the original inputLocation,
                 // merging in the generated narration if found.
                 return {
                      locationName: inputLocation.locationName,
                      lat: inputLocation.lat,
                      lon: inputLocation.lon,
                      placeId: inputLocation.placeId,
                      types: inputLocation.types, // Keep original types
                      rating: inputLocation.rating, // Keep original rating
                      user_ratings_total: inputLocation.user_ratings_total, // Keep original total ratings
                      vicinity: inputLocation.vicinity, // Keep original vicinity
                      narration: genLocMatch?.narration || `Discover ${inputLocation.locationName}.`, // Use generated narration if available, otherwise use a fallback
                      photos: photos || [] // Add fetched photos
                 };
            }));

            // Create the final experience object, ensuring the locations array uses the enhanced data
            const finalExperience = {
                title: experience.title,
                description: experience.description,
                locations: finalLocations
            };

            console.log(`Successfully processed and enhanced experience for theme: ${locationSet.theme}`);
            return finalExperience; // Return the processed experience object

         } catch (error) {
            console.error(`Error during generation or processing for theme ${locationSet.theme}:`, error.message);
            return null; // Return null to indicate failure for this set
         }
    };

     // Use a promise pool (or queue) to limit concurrent API calls to Gemini
     const generationPromises = diverseLocationSets.map(set => () => processSet(set)); // Array of functions returning promises

     const results = [];
     // Simple promise pool execution
     const executePool = async (tasks, limit) => {
         const pool = [];
         const running = [];

         for (const task of tasks) {
             const promise = task(); // Start the task
             results.push(promise); // Add promise to results tracking

             const runningPromise = promise.finally(() => {
                 // When a task finishes, remove it from the running pool
                 const index = running.indexOf(runningPromise);
                 if (index > -1) running.splice(index, 1);
             });

             running.push(runningPromise);

             // If the running pool is full, wait for one to finish
             if (running.length >= limit) {
                 await Promise.race(running);
             }
         }
          // Wait for any remaining tasks in the pool
         await Promise.all(running);
     };

     await executePool(generationPromises, MAX_CONCURRENT_GENERATIONS);

     // Filter out any null results (failed generations)
    const successfulExperiences = (await Promise.all(results)).filter(exp => exp !== null);

    console.log(`Finished generating experiences. ${successfulExperiences.length} successful out of ${diverseLocationSets.length} attempts.`);
    return successfulExperiences;
  } catch (error) {
    console.error("Top-level Gemini API or processing error:", error);
    return []; // Return empty array on critical failure
  }
};

/* ---------------------------------------------------------------------------
   Simple In-Memory Rate Limiter Middleware (Remains the same)
   --------------------------------------------------------------------------- */
const rateLimiter = {
  requests: new Map(),
  limit: 60, // requests per minute
  windowMs: 60 * 1000, // 1 minute window
  resetTimeouts: new Map(),
  check: function(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
     // Basic cleanup (perform check randomly to avoid iterating map on every request)
    if (Math.random() < 0.05) { // Check 5% of the time
      this.requests.forEach((data, keyIp) => {
        if (data.firstRequestTimestamp < windowStart) {
          this.requests.delete(keyIp);
          const timeoutId = this.resetTimeouts.get(keyIp);
          if (timeoutId) clearTimeout(timeoutId);
          this.resetTimeouts.delete(keyIp);
        }
      });
    }
    let requestData = this.requests.get(ip);
    if (!requestData || requestData.firstRequestTimestamp < windowStart) {
      // First request in the new window or map entry expired
      requestData = { count: 1, firstRequestTimestamp: now };
      this.requests.set(ip, requestData);
      // Set a timeout to remove the entry after the window passes
      const existingTimeout = this.resetTimeouts.get(ip);
      if (existingTimeout) clearTimeout(existingTimeout); // Clear previous timeout if exists
      const timeoutId = setTimeout(() => {
        this.requests.delete(ip);
        this.resetTimeouts.delete(ip);
      }, this.windowMs);
      this.resetTimeouts.set(ip, timeoutId);
      return true;
    }
    if (requestData.count < this.limit) {
      requestData.count++;
      return true;
    }
    // Limit exceeded
    return false;
  }
};

const rateLimit = (req, res, next) => {
  // Use req.ip which is more standard in Express, falls back to connection.remoteAddress
  const ip = req.ip || req.connection.remoteAddress;
  if (!ip) {
      // If IP is somehow unavailable, allow the request but log a warning
      console.warn("Could not determine IP address for rate limiting.");
      return next();
  }
  if (!rateLimiter.check(ip)) {
    console.warn(`Rate limit exceeded for IP: ${ip}`);
    return res.status(429).json({ error: "Too many requests, please try again later." });
  }
  next();
};

/* ---------------------------------------------------------------------------
   Main API Route (Minor Adjustments)
   --------------------------------------------------------------------------- */
router.post("/", rateLimit, async (req, res) => {
  try {
    const { lat, lon, user_id } = req.body;
    // Basic validation for required fields
    if (lat === undefined || lat === null || lon === undefined || lon === null) {
      return res.status(400).json({ error: "Latitude and longitude are required." });
    }

    // Attempt reverse geocode, use fallback if it fails
    const rawLocationName = await getLocationNameFromCoordinates(lat, lon);
     const safeLocationName = rawLocationName || `Area(${lat.toFixed(4)},${lon.toFixed(4)})`; // Fallback name

    // Generate locationKey including geohash for caching DB lookups
    const locationKey = normalizeLocationName(safeLocationName, lat, lon);
    console.log("Generated locationKey:", locationKey);

    // Query the database for existing experiences with this locationKey
    const existingExperiences = await Experience.find({ locationKey }).lean(); // Use .lean() for faster read
    console.log(`Found ${existingExperiences.length} cached experiences for ${locationKey}`);

    if (existingExperiences && existingExperiences.length > 0) {
      console.log(`Returning ${existingExperiences.length} cached experiences.`);
      // Optionally increment times_shown for these experiences if needed
      // await Experience.updateMany({ locationKey }, { $inc: { times_shown: 1 } });
      return res.json({ experiences: existingExperiences });
    }

    console.log("No cached experiences found. Proceeding to fetch nearby places and generate new ones.");

    // No cached experiences found: get nearby places and generate new experiences.
    const nearbyPlaces = await getNearbyPlaces(lat, lon, 30000); // Use 15km radius (can be adjusted)

    // Check if enough relevant places were found after fetching and filtering
    const MIN_PLACES_FOR_GENERATION_ATTEMPT = 4; // Should match locationsPerSet default
     if (!nearbyPlaces || nearbyPlaces.length < MIN_PLACES_FOR_GENERATION_ATTEMPT) {
         console.warn(`Found only ${nearbyPlaces.length || 0} relevant places within radius after filtering. Not attempting generation.`);
         return res.status(404).json({ error: `Not enough relevant places found nearby (need at least ${MIN_PLACES_FOR_GENERATION_ATTEMPT}) to generate experiences.` });
     }

    const generatedExperiences = await fetchGeminiExperiences(nearbyPlaces, lat, lon);

    // Check if any experiences were successfully generated by Gemini
    if (!generatedExperiences || generatedExperiences.length === 0) {
      console.error("fetchGeminiExperiences returned no successful experiences.");
      return res.status(500).json({ error: "Failed to generate experiences from the found places." });
    }

    // Prepare experiences for saving to the database
    // Use the provided user_id or a fallback value ("system") if not provided.
    const effectiveUserId = user_id || "system";

    const experiencesToSave = generatedExperiences.map(exp => ({
      ...exp, // Includes title, description, locations (with narration, photos, etc.)
      user_id: effectiveUserId,
      locationKey, // Key for caching
      times_shown: 0, // Initialize show count
      created_at: new Date() // Timestamp
    }));

     // Only insert if we have experiences ready to save
     let savedExperiences = [];
     if(experiencesToSave.length > 0) {
        try {
           savedExperiences = await Experience.insertMany(experiencesToSave, { ordered: false }); // ordered: false allows other docs to be inserted if one fails
           console.log(`Saved ${savedExperiences.length} experiences for ${locationKey} by user ${effectiveUserId}`);
        } catch (dbError) {
            console.error("Error saving experiences to database:", dbError);
             // Decide how to handle this - maybe return 200 with the generated experiences anyway?
             // For now, return the generated ones even if saving failed partially/fully.
             return res.status(200).json({ experiences: generatedExperiences, warning: "Generated experiences could not be saved to the database." });
        }
     } else {
         console.warn("No experiences were prepared for saving despite successful generation attempt.");
     }


    return res.json({ experiences: savedExperiences }); // Return the saved ones (or the generated ones if saving failed)
  } catch (error) {
    console.error("Critical Error in /api/experiences route:", error);
     // Return a generic 500 error for unexpected issues
    return res.status(500).json({ error: "An internal server error occurred while processing your request." });
  }
});

export default router;