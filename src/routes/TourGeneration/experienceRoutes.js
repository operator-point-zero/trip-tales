import express from "express";
import axios from "axios";
import mongoose from 'mongoose'; // Import mongoose for ObjectId validation
import { GoogleGenerativeAI } from "@google/generative-ai";
import Experience from "../../models/experiences/Experience.js"; // Ensure path is correct

const router = express.Router();

// --- Initialization & Validation ---
let genAI;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} else {
    console.error("FATAL ERROR: GEMINI_API_KEY environment variable is missing.");
    // Optionally exit or disable routes requiring Gemini
    // process.exit(1);
}
if (!process.env.GOOGLE_PLACES_API_KEY) {
    console.error("FATAL ERROR: GOOGLE_PLACES_API_KEY environment variable is missing.");
    // process.exit(1);
}


// --- Cache (Simple In-Memory - Consider Redis/Memcached for Production) ---
const placesCache = {
  data: new Map(),
  getKey: (lat, lon, radius, context = '') => `${lat.toFixed(4)},${lon.toFixed(4)},${radius},${context}`,
  get: function(key) {
    const entry = this.data.get(key);
    if (entry && (Date.now() - entry.timestamp < 60 * 60 * 1000)) { // 1 hour validity
        // console.log(`Cache hit for key: ${key}`);
        return entry.data;
    }
    if (entry) { // Expired entry
        // console.log(`Cache expired for key: ${key}`);
        this.data.delete(key);
    }
    // console.log(`Cache miss for key: ${key}`);
    return undefined;
  },
  set: function(key, data) {
    this.data.set(key, { data, timestamp: Date.now() });
  },
  // Periodic cleanup for very old entries
  cleanup: function() {
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;
      for (const [key, entry] of this.data.entries()) {
          // Delete entries older than, say, 2 hours
          if (now - entry.timestamp > 2 * oneHour) {
              this.data.delete(key);
          }
      }
       // console.log(`Cache cleanup finished. Size: ${this.data.size}`);
  }
};
// Run cleanup periodically (e.g., every 15 minutes)
setInterval(() => placesCache.cleanup(), 15 * 60 * 1000);


// --- Geocoding ---
const getLocationNameFromCoordinates = async (lat, lon) => {
  const cacheKey = placesCache.getKey(lat, lon, 0, 'geocode');
  const cachedData = placesCache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    let locationName = 'this area'; // Default
    if (response.data.results && response.data.results.length > 0) {
      const addressComponents = response.data.results[0].address_components;
      const locality = addressComponents.find(c => c.types.includes('locality'))?.long_name;
      const adminArea = addressComponents.find(c => c.types.includes('administrative_area_level_1'))?.long_name;
      const country = addressComponents.find(c => c.types.includes('country'))?.long_name;

      locationName = locality || adminArea || country || 'this area';
      if (locality && adminArea && locality !== adminArea) locationName = `${locality}, ${adminArea}`;
      if (locationName !== country && country && !locationName.includes(country)) locationName = `${locationName}, ${country}`;
    }
    placesCache.set(cacheKey, locationName);
    return locationName;
  } catch (error) {
    console.error("Failed to get location name:", error.message);
    return 'this area'; // Return default on error
  }
};


// --- Google Places API Calls ---
const getNearbyPlaces = async (lat, lon, radius = 20000) => {
  const cacheKey = placesCache.getKey(lat, lon, radius, 'nearby');
  const cachedData = placesCache.get(cacheKey);
  if (cachedData) return cachedData;

  console.log(`Workspaceing nearby places: ${lat}, ${lon}, Radius: ${radius}...`);
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json`, {
          params: {
              location: `${lat},${lon}`,
              radius: radius,
              // Using keyword broadens search slightly vs type=tourist_attraction
              keyword: 'tourist attraction|landmark|point of interest|park|museum|historical site',
              // type: 'tourist_attraction', // Can use type if keyword is too broad
              key: process.env.GOOGLE_PLACES_API_KEY
          }
      }
    );
    if (!response?.data?.results) {
        console.error("Invalid response structure from Google Places API (Nearby Search)");
        return [];
    }
    const places = response.data.results.map(place => ({
      locationName: place.name,
      lat: place.geometry?.location?.lat,
      lon: place.geometry?.location?.lng,
      placeId: place.place_id,
      types: place.types || [],
      rating: place.rating || null, // Keep as number or null
      vicinity: place.vicinity || null
    })).filter(p => p.lat != null && p.lon != null && p.placeId); // Ensure essential data exists

    console.log(`Workspaceed ${places.length} nearby places.`);
    placesCache.set(cacheKey, places);
    return places;
  } catch (error) {
    console.error("Failed to fetch nearby places:", error.response?.data || error.message);
    return [];
  }
};

// This function might be redundant if getNearbyPlaces uses broad keywords.
// Keep it if you specifically need types not covered well by keywords.
/*
const searchForAdditionalAttractions = async (lat, lon, radius = 15000) => {
   // Add cache logic if needed
  console.log(`Workspaceing additional attractions: ${lat}, ${lon}, Radius: ${radius}.`);
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json`, {
          params: {
            location: `${lat},${lon}`,
            radius: radius,
            type: 'museum|park|church|mosque|temple|zoo|aquarium|art_gallery|landmark|historical_landmark|natural_feature',
            key: process.env.GOOGLE_PLACES_API_KEY
          }
      }
    );
     if (!response?.data?.results) return [];
    const attractions = response.data.results.map(place => ({
      // ... map structure ...
    })).filter(p => p.lat != null && p.lon != null && p.placeId);
    console.log(`Workspaceed ${attractions.length} additional attractions.`);
    // Add to cache if desired
    return attractions;
  } catch (error) {
    console.error("Failed to fetch additional attractions:", error.response?.data || error.message);
    return [];
  }
};
*/

const getLocationPhotos = async (placeId) => {
    if (!placeId) return [];
    // Add cache check for photos if desired:
    // const cacheKey = `photos_${placeId}`;
    // const cachedPhotos = placesCache.get(cacheKey);
    // if (cachedPhotos) return cachedPhotos;
    try {
        const response = await axios.get(
            `https://maps.googleapis.com/maps/api/place/details/json`, {
                params: {
                    place_id: placeId,
                    fields: 'photos',
                    key: process.env.GOOGLE_PLACES_API_KEY
                }
            }
        );
        let photos = [];
        if (response.data.result?.photos) {
            photos = response.data.result.photos.slice(0, 3).map(photo =>
                `https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photoreference=${photo.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`
            );
        }
        // placesCache.set(cacheKey, photos); // Cache result
        return photos;
    } catch (error) {
        console.error(`Failed to fetch photos for placeId ${placeId}:`, error.response?.data || error.message);
        return [];
    }
};


// --- Experience Generation Helpers ---
// (categorizeAttractions, getWeightedRandomSelection, generateDiverseLocationSets - Keep the latest versions from previous examples)
const categorizeAttractions = (attractions) => {
    const categories = {
        museums: [], historical: [], nature: [], entertainment: [],
        religious: [], arts: [], shopping: [], neighborhoods: [],
        landmarks: [], other: []
    };
    const addedPlaceIds = new Set();

    attractions.forEach(place => {
        if (!place?.placeId || addedPlaceIds.has(place.placeId)) return;

        const types = place.types || [];
        let added = false;

        if (types.includes('museum')) { categories.museums.push(place); added = true; }
        else if (types.includes('park') || types.includes('natural_feature')) { categories.nature.push(place); added = true; }
        else if (types.includes('church') || types.includes('mosque') || types.includes('hindu_temple') || types.includes('synagogue') || types.includes('place_of_worship')) { categories.religious.push(place); added = true; }
        else if (types.includes('art_gallery') || types.includes('performing_arts_theater')) { categories.arts.push(place); added = true; }
        else if (types.includes('amusement_park') || types.includes('zoo') || types.includes('aquarium')) { categories.entertainment.push(place); added = true; }
        else if (types.includes('department_store') || types.includes('shopping_mall')) { categories.shopping.push(place); added = true; }
        // Broadened historical/landmark/tourist attraction
        else if (types.some(type => type.includes('historical') || type.includes('landmark') || type.includes('tourist_attraction'))) { categories.historical.push(place); added = true; }
        else if (types.includes('neighborhood') || types.includes('sublocality')) { categories.neighborhoods.push(place); added = true; }
        // Use 'point_of_interest' only if nothing else matched
        else if (!added && types.includes('point_of_interest') ) { categories.landmarks.push(place); added = true; }

        if (added) {
            addedPlaceIds.add(place.placeId);
        } else if (!categories.other.some(p => p.placeId === place.placeId)) {
            // Only add to other if not categorized and not already in other
             categories.other.push(place);
             addedPlaceIds.add(place.placeId);
        }
    });
    return categories;
};

const getWeightedRandomSelection = (items, count, weights = null) => {
    if (!items || items.length === 0) return [];
    const numToSelect = Math.min(count, items.length);
    if (numToSelect === 0) return [];

    const selected = [];
    const availableItems = [...items];
    let availableWeights = weights ? [...weights] : null;

    for (let i = 0; i < numToSelect; i++) {
        let index = -1;
        if (availableWeights?.length === availableItems.length) {
            const totalWeight = availableWeights.reduce((sum, w) => sum + (w > 0 ? w : 0), 0); // Sum positive weights
            if (totalWeight <= 0) {
                index = Math.floor(Math.random() * availableItems.length);
            } else {
                let random = Math.random() * totalWeight;
                for (let j = 0; j < availableWeights.length; j++) {
                    if (availableWeights[j] > 0) random -= availableWeights[j]; // Only subtract positive weights
                    if (random <= 0) { index = j; break; }
                }
                if (index === -1) index = availableItems.length - 1; // Fallback if not set
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

const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
  if (!attractions || attractions.length === 0) return [];
  const categorized = categorizeAttractions(attractions);
  attractions.forEach(p => {
      p.distanceFromUser = Math.sqrt(Math.pow(p.lat - userLat, 2) + Math.pow(p.lon - userLon, 2));
  });

  const themeSets = [ /* Keep your theme definitions here */
      ["Historical Highlights", ["historical", "landmarks", "museums"], 2],
      ["Arts & Culture", ["museums", "arts", "historical", "neighborhoods"], 2],
      ["Nature Escape", ["nature", "landmarks"], 2],
      ["Religious & Spiritual", ["religious", "historical", "landmarks"], 2],
      ["Family Fun", ["entertainment", "nature", "parks", "museums"], 2],
      ["Local Vibe", ["neighborhoods", "shopping", "other"], 2],
      ["Hidden Gems & Views", ["other", "landmarks", "nature"], 2],
      ["Photography Hotspots", ["nature", "landmarks", "historical", "neighborhoods"], 2],
      ["Cultural Immersion", ["museums", "arts", "neighborhoods", "historical"], 2],
      ["Relax & Recharge", ["nature", "parks", "other"], 2]
  ];

  const locationSets = [];
  const usedLocationCombinations = new Set();
  const viableThemes = themeSets.filter(([theme, categoriesToUse]) => {
      const distinctPlaces = new Set();
      categoriesToUse.forEach(cat => categorized[cat]?.forEach(p => distinctPlaces.add(p.placeId)));
      return distinctPlaces.size >= locationsPerSet;
  });

  if (viableThemes.length === 0) {
      console.log("No themes have enough unique attractions.");
      return [];
  }

  let attempts = 0;
  const maxAttempts = numSets * 4; // Increase attempts further

  while (locationSets.length < numSets && attempts < maxAttempts) {
      attempts++;
      const [theme, categoriesToUse] = viableThemes[Math.floor(Math.random() * viableThemes.length)];
      const availableForThemeSet = new Map(); // Use Map for inherent uniqueness by placeId
      categoriesToUse.forEach(cat => categorized[cat]?.forEach(p => availableForThemeSet.set(p.placeId, p)));
      const availableForTheme = Array.from(availableForThemeSet.values());

      if (availableForTheme.length < locationsPerSet) continue;

      const weights = availableForTheme.map(p => 1 / (Math.pow(p.distanceFromUser, 2) + 0.0001));
      const selectedLocations = getWeightedRandomSelection(availableForTheme, locationsPerSet, weights);

      if (selectedLocations.length >= Math.min(locationsPerSet, 2)) {
          const combinationKey = selectedLocations.map(loc => loc.placeId).sort().join(',');
          if (combinationKey && !usedLocationCombinations.has(combinationKey)) {
              locationSets.push({ theme, locations: selectedLocations });
              usedLocationCombinations.add(combinationKey);
          }
      }
  }
  console.log(`Generated ${locationSets.length} unique location sets.`);
  return locationSets;
};


// --- Gemini API Call ---
const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
    if (!genAI) {
        console.error("Gemini AI client not initialized (Missing API Key?). Cannot fetch experiences.");
        return [];
    }
    try {
        const locationName = await getLocationNameFromCoordinates(latitude, longitude);
        const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude);

        if (!diverseLocationSets?.length) {
            console.error("Failed to generate diverse location sets.");
            return [];
        }
        console.log(`Generated ${diverseLocationSets.length} diverse location sets to attempt.`);

        const modelConfig = { /* Keep your model config */
            model: "gemini-1.5-flash",
            safetySettings: [ /* ... */ ],
            generationConfig: { /* ... */ }
        };
        console.log("Initializing model with config:", JSON.stringify(modelConfig.model)); // Log only model name
        const model = genAI.getGenerativeModel(modelConfig);

        const generatedExperiencesRaw = [];
        const generatedLocationKeys = new Set();
        const promises = [];

        for (const locationSet of diverseLocationSets) { // Use for...of
             if (!locationSet?.locations || locationSet.locations.length < 2) continue;

             const potentialKey = locationSet.locations.map(loc => loc.placeId).filter(Boolean).sort().join(',');
             if (!potentialKey || generatedLocationKeys.has(potentialKey)) continue;

             const themePrompt = `...`; // Keep your detailed prompt structure from before

             promises.push(
                 (async () => {
                     try {
                         // console.log(`Starting generation for theme: "${locationSet.theme}"`);
                         const result = await model.generateContent(/* ... */); // Pass prompt

                         const responseText = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
                         if (!responseText) throw new Error("Invalid response structure from Gemini.");

                         let cleanedResponse = responseText.trim().replace(/^```json\s*|\s*```$/g, "").trim();
                         const experience = JSON.parse(cleanedResponse);

                         // Enhancement and Photo Fetching Logic (Keep the parallel version from previous examples)
                         const photoPromises = [];
                         const enhancedLocations = experience.locations.map(locFromJson => {
                             const matchingPlace = locationSet.locations.find(p => p.locationName.toLowerCase() === locFromJson.locationName.toLowerCase());
                             if (matchingPlace?.placeId) {
                                 photoPromises.push(getLocationPhotos(matchingPlace.placeId).then(photos => ({ placeId: matchingPlace.placeId, photos })));
                                 return { /* ... return enhanced location structure ... */
                                    ...locFromJson,
                                    lat: matchingPlace.lat, lon: matchingPlace.lon, placeId: matchingPlace.placeId,
                                    types: matchingPlace.types || [], rating: matchingPlace.rating || null,
                                    vicinity: matchingPlace.vicinity || null, photos: []
                                 };
                             }
                             console.warn(`Could not find matching placeId for location: "${locFromJson.locationName}"`);
                             return { ...locFromJson, photos: [] };
                         });
                         const photoResults = await Promise.all(photoPromises);
                         const photoMap = new Map(photoResults.map(p => [p.placeId, p.photos]));
                         enhancedLocations.forEach(loc => { if (loc.placeId) loc.photos = photoMap.get(loc.placeId) || []; });

                         const finalKey = enhancedLocations.map(loc => loc.placeId).filter(Boolean).sort().join(',');
                         if (finalKey) {
                             return { key: finalKey, experienceData: { ...experience, locations: enhancedLocations }, theme: locationSet.theme };
                         }
                         return null;
                     } catch (error) {
                         console.error(`Error processing experience theme "${locationSet.theme}":`, error.message);
                         return null;
                     }
                 })()
             );
        } // End for...of loop

        const results = await Promise.allSettled(promises);
        results.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                const { key, experienceData, theme } = result.value;
                if (!generatedLocationKeys.has(key)) {
                    generatedExperiencesRaw.push(experienceData);
                    generatedLocationKeys.add(key);
                    // console.log(`Successfully processed theme: "${theme}", key: ${key}`);
                }
            } else if (result.status === 'rejected') {
                 console.error("A generation promise rejected:", result.reason);
             }
        });

        console.log(`Finished generation. Total unique experiences: ${generatedExperiencesRaw.length}`);
        return generatedExperiencesRaw;
    } catch (error) {
        console.error("Critical Error in fetchGeminiExperiences:", error);
        return [];
    }
};


// --- Rate Limiting ---
// (Keep the rateLimiter object and rateLimit middleware function from the previous full example)
const rateLimiter = { /* ... */ };
const rateLimit = (req, res, next) => { /* ... */ };


// --- Filtering & Scoring ---
// (Keep the filterExperiencesForUser function from the previous full example)
const filterExperiencesForUser = (experiences, userLat, userLon, userPrefs = {}) => { /* ... */ };


// --- Urban Location Check ---
// (Keep the isUrbanLocation function from the previous full example)
async function isUrbanLocation(lat, lon) { /* ... */ }


// --- Main Route Handler ---
router.post("/", rateLimit, async (req, res) => {
  try {
    const { lat, lon, user_id, preferences } = req.body;

    // --- Input Validation ---
    if (lat == null || lon == null || !user_id) {
      return res.status(400).json({ error: "Latitude, longitude, and user_id are required." });
    }
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);
    if (isNaN(latitude) || isNaN(longitude)) {
         return res.status(400).json({ error: "Invalid latitude or longitude format." });
    }
    // Validate user_id format (crucial for ObjectId casting)
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
        console.error(`Invalid user_id format received: ${user_id}`);
        return res.status(400).json({ error: "Invalid user ID format." });
    }
    let userPrefs = {};
    if (preferences) {
        try { userPrefs = typeof preferences === 'string' ? JSON.parse(preferences) : preferences; }
        catch (e) { console.warn("Could not parse user preferences JSON:", preferences); }
    }
    console.log(`Request received for lat: ${latitude}, lon: ${longitude}, user: ${user_id}`);

    // --- Determine Search Area ---
    const isUrban = await isUrbanLocation(latitude, longitude);
    const boxSize = isUrban ? 0.10 : 0.30;
    const searchRadius = isUrban ? 10000 : 25000;
    console.log(`Location: ${isUrban ? 'Urban' : 'Rural'}. Box: ${boxSize}, Radius: ${searchRadius}`);

    // --- Step 1: Check User's Existing Experiences (using location_center) ---
    const userCheckStartTime = Date.now();
    // Ensure you have a 2dsphere index on location_center for this query
    const userExperiences = await Experience.find({
        user_id: user_id, // Match the specific user
        location_center: {
            $geoWithin: {
                // Use $centerSphere for distance-based query (meters)
                $centerSphere: [ [longitude, latitude], searchRadius / 6378100 ] // radius in radians (radius_meters / earth_radius_meters)
                // OR use $box for bounding box query (degrees)
                // $box: [ [longitude - boxSize, latitude - boxSize], [longitude + boxSize, latitude + boxSize] ]
            }
        }
    }).limit(20); // Check a reasonable number
    console.log(`User experience check took ${Date.now() - userCheckStartTime}ms. Found: ${userExperiences.length}`);

    if (userExperiences.length > 0) {
       const filteredUserExperiences = filterExperiencesForUser(userExperiences, latitude, longitude, userPrefs).slice(0, 10);
       if (filteredUserExperiences.length > 0) {
            console.log(`Returning ${filteredUserExperiences.length} existing experiences for user ${user_id}.`);
            return res.json({ experiences: filteredUserExperiences, source: "user_cache" });
       } else {
           console.log("Existing user experiences found but filtered out by preferences.");
       }
    } else {
        console.log(`No existing user experiences found for user ${user_id} in this area.`);
    }

    // --- Step 2: Check Seed Experiences ---
    const seedCheckStartTime = Date.now();
    const seedExperiences = await Experience.find({
        is_seed: true,
        location_center: { // Use the same geo query as user check
            $geoWithin: { $centerSphere: [ [longitude, latitude], searchRadius / 6378100 ] }
        }
    }).sort({ times_shown: 1 }).limit(30); // Get least shown seeds
    console.log(`Seed check took ${Date.now() - seedCheckStartTime}ms. Found: ${seedExperiences.length}`);


    if (seedExperiences.length >= 5) {
        console.log(`Found ${seedExperiences.length} seeds. Customizing...`);
        // Update usage count async
        Experience.updateMany({ _id: { $in: seedExperiences.map(e => e._id) } }, { $inc: { times_shown: 1 } })
                  .catch(err => console.error("Error updating seed times_shown:", err));

        const filteredSeedExperiences = filterExperiencesForUser(seedExperiences, latitude, longitude, userPrefs);
        const selectedExperiences = filteredSeedExperiences.slice(0, 7);

        const userClones = selectedExperiences.map(exp => {
             if (!exp?._id) return null;
             return {
                ...exp.toObject(),
                _id: undefined, user_id: user_id, is_seed: false,
                source_experience_id: exp._id, times_shown: 0,
                // No need for created_at, timestamps: true handles it
             };
        }).filter(Boolean);

        if (userClones.length > 0) {
            try {
                console.log(`Attempting to save ${userClones.length} customized clones...`);
                const savedClones = await Experience.insertMany(userClones, { ordered: false });
                console.log(`Successfully saved ${savedClones?.length ?? 0} customized clones.`);
                 if (savedClones?.length > 0) {
                    // Return the actual saved clones (they now have _id)
                    return res.json({ experiences: savedClones, source: "customized_from_seed" });
                 }
            } catch (dbError) { console.error("!!! DB Error saving customized clones:", dbError); }
        } else { console.log("No suitable seeds left after filtering."); }
    } else { console.log("Not enough seeds found."); }


    // --- Step 3: Generate New Experiences ---
    console.log("Generating new experiences...");
    const placesStartTime = Date.now();
    let nearbyPlaces = await getNearbyPlaces(latitude, longitude, searchRadius);
    // let additionalAttractions = await searchForAdditionalAttractions(latitude, longitude, searchRadius); // Optionally add back
    const placeMap = new Map();
    nearbyPlaces.forEach(p => { if(p.placeId) placeMap.set(p.placeId, p) });
    // [...additionalAttractions].forEach(p => { if(p.placeId) placeMap.set(p.placeId, p) }); // Add if using additional
    const uniqueNearbyPlaces = Array.from(placeMap.values());
    console.log(`Place fetching & deduplication took ${Date.now() - placesStartTime}ms. Unique places: ${uniqueNearbyPlaces.length}`);


    if (uniqueNearbyPlaces.length < 4) {
        return res.status(404).json({ error: "Could not find enough points of interest nearby." });
    }

    const generationStartTime = Date.now();
    const generatedExperiences = await fetchGeminiExperiences(uniqueNearbyPlaces, latitude, longitude);
    console.log(`Gemini generation took ${Date.now() - generationStartTime}ms.`);


    if (!generatedExperiences?.length) {
        return res.status(500).json({ error: "Failed to generate tour experiences." });
    }
    console.log(`Received ${generatedExperiences.length} raw experiences from generation.`);

    // --- Format and Save Newly Generated Experiences ---
    const newExperiencesToSave = generatedExperiences.map(exp => ({
        title: exp.title,
        description: exp.description,
        locations: exp.locations.map(loc => ({
            lat: loc.lat, lon: loc.lon, locationName: loc.locationName,
            placeId: loc.placeId || null, types: loc.types || [],
            rating: (typeof loc.rating === 'number') ? loc.rating : null, // Align with schema
            vicinity: loc.vicinity || null, photos: loc.photos || [],
            narration: loc.narration || `Welcome to ${loc.locationName}.`
        })).filter(loc => loc.lat != null && loc.lon != null),
        user_id: user_id, // Associate with triggering user initially
        is_seed: true,    // Mark as seed
        times_shown: 0,
        // REMOVED created_at (handled by timestamps: true)
        location_center: { // Use GeoJSON Point format
             type: 'Point',
             coordinates: [longitude, latitude] // LON, LAT order
        }
    })).filter(exp => exp.locations.length >= 2); // Filter experiences with too few locations

    if (newExperiencesToSave.length === 0) {
         console.log("WARNING: No valid experiences formatted for saving.");
         return res.status(500).json({ error: "Failed to format generated experiences for saving." });
     }

    // --- Save Seeds ---
    let savedSeeds = [];
    try {
        // Log first object structure before insert
        console.log("Structure of first new seed:", JSON.stringify(newExperiencesToSave[0], null, 2));
        console.log(`Attempting to save ${newExperiencesToSave.length} new seed experiences...`);
        savedSeeds = await Experience.insertMany(newExperiencesToSave, { ordered: false });
        console.log(`Saved ${savedSeeds?.length ?? 0} new seeds.`);
        if (savedSeeds?.length !== newExperiencesToSave.length) {
            console.warn(`Expected ${newExperiencesToSave.length} seeds saved, but got ${savedSeeds?.length ?? 0}.`);
        }
    } catch (dbError) {
        console.error("!!! DB Error saving NEW SEEDS:", dbError);
        return res.status(500).json({ error: "Database error saving new experiences", details: dbError.message });
    }

    // --- Create User Clones from Newly Saved Seeds ---
     let userVersions = [];
     if (savedSeeds?.length > 0) {
         userVersions = savedSeeds.map(exp => {
             if (!exp?._id) return null;
             return {
                 ...exp.toObject(), _id: undefined, is_seed: false,
                 source_experience_id: exp._id, user_id: user_id, times_shown: 0
             };
         }).filter(Boolean);

         if (userVersions.length > 0) {
             try {
                 console.log(`Attempting to save ${userVersions.length} user clones from new seeds...`);
                 const savedUserClones = await Experience.insertMany(userVersions, { ordered: false });
                 console.log(`Successfully saved ${savedUserClones?.length ?? 0} user clones.`);
                 // Important: Use the actual saved clones for the response, as they now have _ids
                 userVersions = savedUserClones;
             } catch (dbError) { console.error("!!! DB Error saving user clones from new seeds:", dbError); }
         } else { console.log("No valid user versions generated from new seeds."); }
     } else { console.log("Skipping clone creation, no new seeds saved."); }

    // --- Return Response ---
    const finalUserExperiences = filterExperiencesForUser(userVersions, latitude, longitude, userPrefs).slice(0, 7);
    console.log(`Returning ${finalUserExperiences.length} newly generated experiences to user.`);
    res.json({ experiences: finalUserExperiences, source: "newly_generated" });

  } catch (error) {
    console.error("!!! Unhandled Error in experiences route:", error);
    res.status(500).json({ error: "Server error processing request.", details: error.message });
  }
});


export default router;