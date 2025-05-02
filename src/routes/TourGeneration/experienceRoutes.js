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
  const baseKey = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); // Sanitize name
  // Geohash precision of 6 gives a cell size of approximately 1.2km x 0.6km
  const geoHash = geohash.encode(lat, lon, 6);
  return `${baseKey}_${geoHash}`;
};

/* ---------------------------------------------------------------------------
   Places Caching & API Functions (Modified)
   --------------------------------------------------------------------------- */
const placesCache = {
  attractions: new Map(),
  getKey: (lat, lon, radius, types) => `${lat.toFixed(4)},${lon.toFixed(4)},${radius},${types.sort().join("_")}`, // Include types in key
  get: function (lat, lon, radius, types) {
    const key = this.getKey(lat, lon, radius, types);
    return this.attractions.get(key);
  },
  set: function (lat, lon, radius, types, data) {
    const key = this.getKey(lat, lon, radius, types);
    this.attractions.set(key, data);
    // Cache expires in 1 hour
    setTimeout(() => {
      console.log(`Cache expired and removed for key: ${key}`);
      this.attractions.delete(key);
    }, 60 * 60 * 1000);
    console.log(`Cache set for key: ${key}`);
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
             await new Promise(resolve => setTimeout(resolve, 2000));
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
                    types: place.types,
                    rating: place.rating || null,
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

// --- Updated getNearbyPlaces with pagination and multiple types ---
const getNearbyPlaces = async (lat, lon, radius = 15000) => {
  // Define types to search for. Start with broad ones likely to capture attractions/landmarks.
  const typesToFetch = ['tourist_attraction', 'point_of_interest', 'landmark', 'museum', 'park']; // Add more if needed

  const cacheKeyTypes = typesToFetch; // Use this for cache key

  const cachedData = placesCache.get(lat, lon, radius, cacheKeyTypes);
  if (cachedData) {
    console.log(`Cache hit for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}, Types: ${cacheKeyTypes.join(',')}`);
    return cachedData;
  }

  console.log(`Cache miss for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}, Types: ${cacheKeyTypes.join(',')}. Fetching from API...`);

  let allPlaces = [];
  const fetchedPlaceIds = new Set(); // Use a Set to ensure unique places by placeId

  for (const type of typesToFetch) {
      let pageToken = null;
      let placesFetchedForType = 0;
      const maxPages = 3; // Google Places API limits to 3 pages per request

      for (let i = 0; i < maxPages; i++) {
          const { places, nextPageToken } = await fetchPlacesPage(lat, lon, radius, type, pageToken);

          places.forEach(place => {
              if (!fetchedPlaceIds.has(place.placeId)) {
                  allPlaces.push(place);
                  fetchedPlaceIds.add(place.placeId);
              }
          });
          placesFetchedForType += places.length;

          if (nextPageToken) {
              pageToken = nextPageToken;
          } else {
              break; // No more pages for this type
          }
      }
      console.log(`Workspaceed ${placesFetchedForType} potential places for type '${type}'. Total unique: ${allPlaces.length}`);
  }

  // --- Add filtering step: Remove irrelevant business types ---
  const irrelevantTypes = [
    'restaurant', 'cafe', 'food', 'store', 'establishment', 'lodging',
    'atm', 'bank', 'gas_station', 'pharmacy', 'supermarket', 'convenience_store',
    'doctor', 'hospital', 'pharmacy', // Health
    'bus_station', 'train_station', 'subway_station', 'airport', 'transit_station', // Transit (unless a major landmark station)
    'parking', 'taxi_stand', // Transport
    'car_repair', 'car_wash', 'dealer', 'rental', // Car services
    'hair_care', 'laundry', 'locksmith', 'mover', 'painter', 'plumber', 'post_office', 'real_estate_agency', 'roofing_contractor', 'storage', // Services
    'city_hall', 'courthouse', 'embassy', 'fire_station', 'police', 'local_government_office', // Government/Admin (unless significant landmark)
    'funeral_home', 'veterinary_care', // Misc
    'school', 'university', // Education (unless a specific historic building)
    'accounting', 'lawyer', 'insurance_agency' // Professional
  ];

  const filteredPlaces = allPlaces.filter(place =>
      !place.types.some(type => irrelevantTypes.includes(type))
  );

  console.log(`Filtered down to ${filteredPlaces.length} relevant places after removing irrelevant types.`);

  placesCache.set(lat, lon, radius, cacheKeyTypes, filteredPlaces);
  return filteredPlaces;
};


const getLocationPhotos = async (placeId) => {
  if (!placeId) return [];
  try {
    const detailsResponse = await axios.get(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    if (detailsResponse.data.result && detailsResponse.data.result.photos) {
      return detailsResponse.data.result.photos.slice(0, 3).map(photo => {
        return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photo.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
      });
    }
    return [];
  } catch (error) {
    console.error(`Failed to fetch photos for placeId ${placeId}:`, error.message);
    // Return empty array on error so it doesn't block the experience generation
    return [];
  }
};

/* ---------------------------------------------------------------------------
   Experience Generation Helpers (Categorization, Selection, Generation)
   (Minor Adjustments)
   --------------------------------------------------------------------------- */
const categorizeAttractions = (attractions) => {
    const categories = {
        museums: [],
        historical: [],
        nature: [],
        entertainment: [],
        religious: [],
        arts: [],
        shopping: [], // Keep, but rely less on for core tours
        neighborhoods: [], // Keep, good for local vibe
        landmarks: [],
        other: [], // Filtered "other" should be more relevant now
        architecture: [], // Added architectural category
        viewpoints: [], // Added viewpoints/scenic category
    };

    attractions.forEach(place => {
        const types = place.types || [];
        let categorized = false;

        // Prioritize more specific types first
        if (types.includes("museum")) { categories.museums.push(place); categorized = true; }
        if (types.includes("art_gallery") || types.includes("performing_arts_theater")) { categories.arts.push(place); categorized = true; }
        if (types.includes("park") || types.includes("natural_feature") || types.includes("campground")) { categories.nature.push(place); categorized = true; } // Added campground
        if (types.includes("church") || types.includes("mosque") || types.includes("temple") ||
            types.includes("hindu_temple") || types.includes("synagogue") || types.includes("place_of_worship")) { categories.religious.push(place); categorized = true; }
        if (types.includes("amusement_park") || types.includes("zoo") || types.includes("aquarium")) { categories.entertainment.push(place); categorized = true; }
        if (types.some(type => type.includes("historic") || type.includes("castle"))) { categories.historical.push(place); categorized = true; } // Broadened historical
        if (types.includes("shopping_mall") || types.includes("department_store") || types.includes("market")) { categories.shopping.push(place); categorized = true; } // Added market
        if (types.includes("neighborhood") || types.includes("sublocality")) { categories.neighborhoods.push(place); categorized = true; }
         if (types.includes("landmark")) { categories.landmarks.push(place); categorized = true; } // Specific landmark type
        if (types.some(type => type.includes("architecture") || type.includes("building"))) { categories.architecture.push(place); categorized = true; } // Capture architectural interest
        if (types.some(type => type.includes("viewpoint") || type.includes("scenic"))) { categories.viewpoints.push(place); categorized = true; } // Capture scenic spots


        // Catch remaining relevant point_of_interest places
        if (types.includes("point_of_interest") && !categorized) {
             // Try to infer category from name or vicinity if not strictly typed
             const name = place.locationName.toLowerCase();
             if (name.includes(" square") || name.includes(" plaza")) { categories.landmarks.push(place); categorized = true; }
             else if (name.includes(" bridge")) { categories.architecture.push(place); categorized = true; }
             else if (name.includes(" garden")) { categories.nature.push(place); categorized = true; }
             else if (name.includes(" university") || name.includes(" college")) { /* Maybe categorize as education if relevant? For now, let's leave if not already caught */ }
             else { categories.other.push(place); categorized = true; } // Generic point of interest goes to other
        }


        if (!categorized) {
            // If still not categorized, and it wasn't filtered, put in 'other'
             categories.other.push(place);
        }
    });

    // De-duplicate across categories using a Set of placeIds
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
     console.log("Categorization counts:", Object.fromEntries(Object.entries(uniqueCategories).map(([key, value]) => [key, value.length])));

    return uniqueCategories;
};


// getWeightedRandomSelection remains the same

const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
  if (!attractions || attractions.length < locationsPerSet) { // Need at least locationsPerSet unique places
      console.warn(`Not enough unique attractions (${attractions.length}) to generate sets of size ${locationsPerSet}.`);
      // Fallback: return a single set of the best available places if possible
      if (attractions.length >= 2) { // Still need at least 2 for a basic experience
           const weights = attractions.map(place => {
                const epsilon = 0.0001;
                const distanceSq = Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2) + epsilon;
                return (place.rating || 3) / distanceSq; // Weight by rating and inverse distance
           });
           const fallbackLocations = getWeightedRandomSelection(attractions, locationsPerSet, weights);
            if(fallbackLocations.length >= 2){
                console.log("Returning a single fallback set.");
                return [{ theme: "Highlights of The Area", locations: fallbackLocations }];
            }
      }
      return []; // Cannot generate any valid set
  }
  const categorized = categorizeAttractions(attractions);

  // Compute weighted scores (rating * inverse distance)
  attractions.forEach(place => {
    const epsilon = 0.0001;
    const distanceSq = Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2) + epsilon;
    place.weightedScore = (place.rating || 3) / distanceSq; // Use a default rating of 3 if none exists
  });

    // Refined theme sets - include new categories, adjust weights or counts if needed
  const themeSets = [
    { theme: "Historical Highlights", categories: ["historical", "landmarks", "museums", "religious", "architecture"], weight: 1 },
    { theme: "Arts & Culture", categories: ["arts", "museums", "landmarks", "architecture"], weight: 1 },
    { theme: "Nature Escape", categories: ["nature", "landmarks", "viewpoints"], weight: 1 },
    { theme: "Religious & Spiritual Sites", categories: ["religious", "historical", "landmarks", "architecture"], weight: 0.8 }, // Slightly lower weight if less common
    { theme: "Family Fun", categories: ["entertainment", "nature", "landmarks", "museums"], weight: 0.9 },
    { theme: "Local Vibe & Exploration", categories: ["neighborhoods", "shopping", "other", "landmarks", "architecture"], weight: 1 }, // Broadened
    { theme: "Architectural Wonders", categories: ["architecture", "historical", "religious", "landmarks", "museums"], weight: 0.9 },
    { theme: "Scenic Views & Photo Spots", categories: ["viewpoints", "nature", "landmarks", "architecture"], weight: 1 },
     { theme: "Around Town Highlights", categories: ["landmarks", "point_of_interest", "other", "museums", "parks"], weight: 1.1 }, // More general broad set
     { theme: "Hidden Gems & Local Finds", categories: ["other", "neighborhoods", "point_of_interest"], weight: 0.8 } // Focus on less common types
  ];

  // Sort theme sets to prioritize based on likelihood or user preference if applicable
  themeSets.sort((a, b) => b.weight - a.weight);


  const locationSets = [];
  const usedPlaceIdsInSession = new Set(); // Track used places *across* sets in this batch

  for (let i = 0; i < numSets && locationSets.length < numSets; i++) {
    const themeConfig = themeSets[i % themeSets.length]; // Cycle through themes if numSets > themeSets.length
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

    // Remove duplicates from the potential pool for this theme
    availableForTheme = Array.from(new Map(availableForTheme.map(item => [item.placeId, item])).values());

    if (availableForTheme.length < locationsPerSet) {
        console.log(`Not enough unique places (${availableForTheme.length}) for theme "${theme}" to form a set of ${locationsPerSet}. Skipping or reducing set size.`);
        // Option: Reduce required set size for this theme if there are at least 2 locations
        if (availableForTheme.length >= 2) {
             const weights = availableForTheme.map(place => place.weightedScore);
             const selectedLocations = getWeightedRandomSelection(availableForTheme, availableForTheme.length, weights); // Take all available
             if (selectedLocations.length >= 2) {
                  locationSets.push({ theme, locations: selectedLocations });
                  selectedLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
                   console.log(`Generated smaller set (${selectedLocations.length}) for theme "${theme}".`);
             }
        }
        continue; // Move to the next theme/attempt
    }

    const weights = availableForTheme.map(place => place.weightedScore);
    const selectedLocations = getWeightedRandomSelection(availableForTheme, locationsPerSet, weights);

    if (selectedLocations.length >= locationsPerSet) { // Only add if we got the desired number
      locationSets.push({ theme, locations: selectedLocations });
      selectedLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
      console.log(`Generated set for theme: ${theme}`);
    }
  }

    // Final Fallback: If we still don't have enough sets, create generic sets from remaining unused places
    const remainingUnused = attractions.filter(p => !usedPlaceIdsInSession.has(p.placeId));
     while (locationSets.length < numSets && remainingUnused.length >= locationsPerSet) {
         console.log(`Generating additional generic 'More Highlights' set. Sets generated so far: ${locationSets.length}`);
         const weights = remainingUnused.map(place => place.weightedScore);
         const selectedLocations = getWeightedRandomSelection(remainingUnused, locationsPerSet, weights);

         if (selectedLocations.length >= locationsPerSet) {
              locationSets.push({ theme: `More Highlights of ${attractions[0]?.vicinity || 'The Area'}`, locations: selectedLocations }); // Use first vicinity as fallback
              selectedLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
              // Remove selected places from remainingUnused for the next iteration
              selectedLocations.forEach(selectedLoc => {
                  const index = remainingUnused.findIndex(p => p.placeId === selectedLoc.placeId);
                   if (index > -1) {
                       remainingUnused.splice(index, 1);
                   }
              });
         } else {
             break; // Cannot form another set
         }
     }


  console.log(`Finished generating diverse location sets. Total sets: ${locationSets.length}. Target: ${numSets}`);
  return locationSets;
};


const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
  if (!nearbyPlaces || nearbyPlaces.length < 2) { // Need at least 2 places to form a set
    console.error("fetchGeminiExperiences called with less than 2 nearby places.");
    return [];
  }
  try {
    const locationName = await getLocationNameFromCoordinates(latitude, longitude);
     const areaDescription = locationName || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`; // Fallback if name not found
    console.log(`Attempting to generate experiences for: ${areaDescription}`);

     // Try to generate up to 10 sets of 4 places each
    const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude, 10, 4);

    if (diverseLocationSets.length === 0) {
      console.error("Failed to generate any diverse location sets from nearby places.");
       // Even if no sets generated, try a basic "Top Rated" fallback if enough places exist
       if (nearbyPlaces.length >= 2) {
            console.log("Using fallback selection of top rated/closest popular places.");
            const sortedPlaces = nearbyPlaces.sort((a, b) => {
                // Sort by weighted score (rating * inverse distance)
                return (b.weightedScore || 0) - (a.weightedScore || 0);
            });
             const fallbackPlaces = sortedPlaces.slice(0, Math.min(nearbyPlaces.length, 5)); // Take up to 5 best

            if (fallbackPlaces.length >= 2) {
                diverseLocationSets.push({ theme: `Top Highlights of ${areaDescription}`, locations: fallbackPlaces });
                 console.log("Added a single fallback set based on sorting.");
            }
       } else {
            return []; // Still not enough places for even a fallback set
       }
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: "application/json"
      }
    });

    const generatedExperiences = [];
    const generationPromises = [];
    const MAX_CONCURRENT_GENERATIONS = 5; // Limit concurrent Gemini calls

    const processSet = async (locationSet) => {
         if (!locationSet.locations || locationSet.locations.length < 2) {
              console.warn(`Skipping set with insufficient locations for theme: ${locationSet.theme}`);
              return;
         }
         const locationListString = locationSet.locations
            .map(loc => `- ${loc.locationName} (Place ID: ${loc.placeId || "N/A"})`)
            .join("\n");

         const themePrompt = `
You are an expert local tour guide for ${areaDescription}. Create a single, compelling, themed tour experience titled "${locationSet.theme}".

Your tour focuses *exclusively* on the following real locations in ${areaDescription}:
${locationListString}

Ensure the narration for each location:
- Is a first-person perspective from a guide.
- Is detailed (150-300 words).
- Includes a welcome mention of the specific location.
- Provides sensory details, history, significance, or interesting facts relevant to the theme.
- Connects the location to the overall theme "${locationSet.theme}".
- Hints at moving to the next stop without explicitly naming it (e.g., "From here, we'll explore another facet of this theme...").

Generate a JSON object for this tour. The JSON object MUST follow this exact structure:
{
  "title": "An engaging title for the '${locationSet.theme}' tour in ${areaDescription}",
  "description": "A brief (2-3 sentences) overall tour description connecting these specific locations under the theme '${locationSet.theme}'. Mention the general area (${areaDescription}).",
  "locations": [
    {
      "locationName": "Full Name of Location 1",
      "lat": ${locationSet.locations[0].lat},
      "lon": ${locationSet.locations[0].lon},
      "placeId": "${locationSet.locations[0].placeId || ''}",
      "narration": "Detailed 150-300 word first-person narration for this specific location following the instructions.",
      "photos": [] // Leave this empty in the JSON, handled separately
    }
    // Repeat for each location provided in the list above.
  ]
}
Constraints:
- Output ONLY the JSON object.
- The 'locations' array must contain an object for EACH of the provided locations, IN THE SAME ORDER if possible.
- Ensure 'lat', 'lon', and 'placeId' are correctly copied from the provided list.
- Narration length must be 150-300 words per location.
- The title and description must incorporate the theme and area name.
`;
         try {
            console.log(`Sending prompt to Gemini for theme: ${locationSet.theme}`);
            const result = await model.generateContent({
              contents: [{ role: "user", parts: [{ text: themePrompt }] }]
            });

            if (
              !result.response ||
              !result.response.candidates ||
              !result.response.candidates[0].content ||
              !result.response.candidates[0].content.parts ||
              !result.response.candidates[0].content.parts[0].text
            ) {
              throw new Error(`Invalid response structure from Gemini for theme: ${locationSet.theme}`);
            }
            const responseText = result.response.candidates[0].content.parts[0].text;
            let experience;
            try {
              // Attempt to parse the JSON, cleaning potentially problematic characters
               const cleanedResponseText = responseText.replace(/```json\n|\n```/g, '').trim();
              experience = JSON.parse(cleanedResponseText);
            } catch(parseError) {
              console.error(`JSON parsing failed for theme ${locationSet.theme}. Raw response:`, responseText);
              throw new Error(`Failed to parse JSON response for theme ${locationSet.theme}: ${parseError.message}`);
            }

            if (!experience || !experience.title || !experience.description || !Array.isArray(experience.locations)) {
              console.error("Parsed JSON is missing required fields for theme:", locationSet.theme, experience);
               // If parsing failed but we got some structure, maybe salvage? Or just fail this one.
              throw new Error(`Invalid JSON structure for theme: ${locationSet.theme}`);
            }

            // Map Gemini's generated locations back to our original place data to get photos, types etc.
            const enhancedLocations = await Promise.all(
                experience.locations.map(async (genLocation) => {
                    // Find the original place object using placeId first, then name/coords
                    const inputLocation = locationSet.locations.find(
                        inputLoc =>
                          (genLocation.placeId && inputLoc.placeId === genLocation.placeId) ||
                          (inputLoc.locationName.toLowerCase() === genLocation.locationName.toLowerCase() &&
                            Math.abs(inputLoc.lat - genLocation.lat) < 0.001 &&
                            Math.abs(inputLoc.lon - genLocation.lon) < 0.001)
                    );

                    if (!inputLocation) {
                      console.warn(`Could not strictly match generated location "${genLocation.locationName}" for theme ${locationSet.theme}. Using generated data.`);
                       // Fallback: Use the data provided by Gemini if original match fails, but photos need a placeId
                      const photos = genLocation.placeId ? await getLocationPhotos(genLocation.placeId) : [];
                      return { ...genLocation, photos: photos || [], types: [], rating: null, vicinity: null }; // Add default empty values
                    }

                    const photos = await getLocationPhotos(inputLocation.placeId);
                    return {
                      locationName: inputLocation.locationName,
                      lat: inputLocation.lat,
                      lon: inputLocation.lon,
                      placeId: inputLocation.placeId,
                      types: inputLocation.types || [],
                      rating: inputLocation.rating || null,
                      vicinity: inputLocation.vicinity || null,
                      narration: genLocation.narration || `Welcome to ${inputLocation.locationName}.`, // Use generated narration, fallback if missing
                      photos: photos || []
                    };
                })
            );

            // Ensure the final experience has the same number of locations as the input set,
            // using the enhanced data. This handles cases where Gemini might add/remove locations (ideally shouldn't, but for robustness)
            // Or, enforce using ONLY the enhanced locations derived from the input set.
             // Let's enforce using only the locations from the input set, mapped to generated narration.
            const finalLocations = await Promise.all(locationSet.locations.map(async (inputLocation) => {
                 // Find the generated narration for this input location
                 const genLocMatch = experience.locations.find(
                      genLocation =>
                          (genLocation.placeId && inputLocation.placeId === genLocation.placeId) ||
                          (inputLocation.locationName.toLowerCase() === genLocation.locationName.toLowerCase() &&
                            Math.abs(inputLocation.lat - genLocation.lat) < 0.001 &&
                            Math.abs(inputLocation.lon - genLocation.lon) < 0.001)
                  );
                 const photos = await getLocationPhotos(inputLocation.placeId);
                 return {
                      locationName: inputLocation.locationName,
                      lat: inputLocation.lat,
                      lon: inputLocation.lon,
                      placeId: inputLocation.placeId,
                      types: inputLocation.types || [],
                      rating: inputLocation.rating || null,
                      vicinity: inputLocation.vicinity || null,
                      narration: genLocMatch?.narration || `Explore ${inputLocation.locationName}.`, // Use generated narration if found, else fallback
                      photos: photos || []
                 };
            }));


            generatedExperiences.push({ ...experience, locations: finalLocations });
            console.log(`Successfully generated experience for theme: ${locationSet.theme}`);

         } catch (error) {
            console.error(`Error processing generation for theme ${locationSet.theme}:`, error.message);
         }
    };

     // Use a queue or promise pool to limit concurrent API calls to Gemini
     const results = [];
     const queue = [...diverseLocationSets];

     const worker = async () => {
          while (queue.length > 0) {
               const locationSet = queue.shift();
               await processSet(locationSet);
          }
     }

     const workers = Array(MAX_CONCURRENT_GENERATIONS).fill(null).map(() => worker());
     await Promise.all(workers);

    console.log(`Finished processing all location sets. ${generatedExperiences.length} successful generations.`);
    return generatedExperiences;
  } catch (error) {
    console.error("Gemini API or processing error:", error);
    return [];
  }
};

/* ---------------------------------------------------------------------------
   Simple In-Memory Rate Limiter Middleware (Remains the same)
   --------------------------------------------------------------------------- */
const rateLimiter = {
  requests: new Map(),
  limit: 60, // per minute
  windowMs: 60 * 1000,
  resetTimeouts: new Map(),
  check: function(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
     // Basic cleanup (check 1% of the time)
    if (Math.random() < 0.01) {
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
      requestData = { count: 1, firstRequestTimestamp: now };
      this.requests.set(ip, requestData);
      const existingTimeout = this.resetTimeouts.get(ip);
      if (existingTimeout) clearTimeout(existingTimeout);
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
    return false;
  }
};

const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
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
    const { lat, lon, user_id } = req.body; // user_id can be supplied from the client if available
    if (lat === undefined || lon === undefined) { // Check explicitly for undefined
      return res.status(400).json({ error: "Latitude and longitude are required." });
    }

    // Reverse geocode to obtain a stable location name key.
    const rawLocationName = await getLocationNameFromCoordinates(lat, lon);
     // Use a fallback name if reverse geocoding fails
     const safeLocationName = rawLocationName || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

    // Generate locationKey including geohash
    const locationKey = normalizeLocationName(safeLocationName, lat, lon);
    console.log("Generated locationKey:", locationKey);

    // Query for ANY experiences with this locationKey
    const existingExperiences = await Experience.find({ locationKey });
    console.log(`Found ${existingExperiences.length} cached experiences for ${locationKey}`);

    if (existingExperiences && existingExperiences.length > 0) {
      console.log(`Returning ${existingExperiences.length} cached experiences.`);
      return res.json({ experiences: existingExperiences });
    }

    console.log("No cached experiences found. Getting nearby places and generating new ones.");
    // No cached experiences for this location: get nearby places and generate new experiences.
    const nearbyPlaces = await getNearbyPlaces(lat, lon, 15000); // Use 15km radius

    if (!nearbyPlaces || nearbyPlaces.length < 2) {
         console.warn(`Found only ${nearbyPlaces.length || 0} relevant places within radius. Cannot generate experiences.`);
         return res.status(404).json({ error: "Not enough relevant places found nearby to generate experiences." });
    }

    const generatedExperiences = await fetchGeminiExperiences(nearbyPlaces, lat, lon);
    if (generatedExperiences.length === 0) {
      return res.status(500).json({ error: "Failed to generate experiences from the found places." });
    }

    // Use the provided user_id or a fallback value ("system") if not provided.
    const effectiveUserId = user_id || "system";

    const enrichedExperiences = generatedExperiences.map(exp => ({
      ...exp,
      user_id: effectiveUserId,
      locationKey,
      times_shown: 0,
      created_at: new Date()
    }));

     // Only insert if we have experiences to save
     let savedExperiences = [];
     if(enrichedExperiences.length > 0) {
        savedExperiences = await Experience.insertMany(enrichedExperiences);
        console.log(`Saved ${savedExperiences.length} experiences for ${locationKey} by user ${effectiveUserId}`);
     }


    return res.json({ experiences: savedExperiences }); // Return the saved ones
  } catch (error) {
    console.error("Error in /api/experiences:", error);
     // Be careful not to expose sensitive error details to the client in production
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

export default router;