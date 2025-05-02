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
    const addressComponents = results[0].address_components;
    // Prefer locality; fallback to administrative_area_level_1
    const locality = addressComponents.find(comp => comp.types.includes("locality"));
    const adminArea = addressComponents.find(comp => comp.types.includes("administrative_area_level_1"));
    const locationName = locality?.long_name || adminArea?.long_name || null;
    return locationName;
  } catch (error) {
    console.error("Error in reverse geocoding:", error.message);
    return null;
  }
};

// Normalize the location name to be used as a key in the DB, including a geohash.
const normalizeLocationName = (name, lat, lon) => {
  const baseKey = name.toLowerCase().replace(/\s+/g, "_").trim();
  // Geohash precision of 6 gives a cell size of approximately 1.2km x 0.6km
  const geoHash = geohash.encode(lat, lon, 6);
  return `${baseKey}_${geoHash}`;
};

/* ---------------------------------------------------------------------------
   Places Caching & API Functions
   --------------------------------------------------------------------------- */
const placesCache = {
  attractions: new Map(),
  additional_attractions: new Map(),
  getKey: (lat, lon, radius) => `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`,
  get: function (type, lat, lon, radius) {
    const key = this.getKey(lat, lon, radius);
    return this[type].get(key);
  },
  set: function (type, lat, lon, radius, data) {
    const key = this.getKey(lat, lon, radius);
    this[type].set(key, data);
    // Cache expires in 1 hour
    setTimeout(() => {
      console.log(`Cache expired and removed for key: ${key}`);
      this[type].delete(key);
    }, 60 * 60 * 1000);
    console.log(`Cache set for key: ${key}`);
  },
};

const getNearbyPlaces = async (lat, lon, radius = 15000) => {
  const type = "attractions";
  try {
    const cachedData = placesCache.get(type, lat, lon, radius);
    if (cachedData) {
      console.log(`Cache hit for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}`);
      return cachedData;
    }
    console.log(`Cache miss for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}. Fetching from API...`);
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=tourist_attraction&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    const places = response.data.results.map((place) => ({
      locationName: place.name,
      lat: place.geometry.location.lat,
      lon: place.geometry.location.lng,
      placeId: place.place_id,
      types: place.types,
      rating: place.rating || "N/A",
      vicinity: place.vicinity || null,
    }));
    placesCache.set(type, lat, lon, radius, places);
    return places;
  } catch (error) {
    console.error("Failed to fetch nearby places:", error.message);
    return [];
  }
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
    return [];
  }
};

/* ---------------------------------------------------------------------------
   Experience Generation Helpers (Categorization, Selection, Generation)
   --------------------------------------------------------------------------- */
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
    let categorized = false;
    if (types.includes("museum")) { categories.museums.push(place); categorized = true; }
    if (types.includes("park") || types.includes("natural_feature")) { categories.nature.push(place); categorized = true; }
    if (types.includes("church") || types.includes("mosque") || types.includes("temple") ||
        types.includes("hindu_temple") || types.includes("synagogue") || types.includes("place_of_worship")) { categories.religious.push(place); categorized = true; }
    if (types.includes("art_gallery") || types.includes("performing_arts_theater")) { categories.arts.push(place); categorized = true; }
    if (types.includes("amusement_park") || types.includes("zoo") || types.includes("aquarium")) { categories.entertainment.push(place); categorized = true; }
    if (types.includes("department_store") || types.includes("shopping_mall")) { categories.shopping.push(place); categorized = true; }
    if (types.some(type => type.includes("historic") || type.includes("monument") || type.includes("castle"))) { categories.historical.push(place); categorized = true; }
    if (types.includes("neighborhood") || types.includes("sublocality")) { categories.neighborhoods.push(place); categorized = true; }
    if (types.includes("landmark") || types.includes("point_of_interest")) { categories.landmarks.push(place); categorized = true; }
    if (!categorized) { categories.other.push(place); }
  });

  // De-duplicate across categories
  const seenPlaceIds = new Set();
  for (const category in categories) {
    categories[category] = categories[category].filter(place => {
      if (seenPlaceIds.has(place.placeId)) return false;
      seenPlaceIds.add(place.placeId);
      return true;
    });
  }
  return categories;
};

const getWeightedRandomSelection = (items, count, weights = null) => {
  if (!items || items.length === 0) return [];
  const numToSelect = Math.min(count, items.length);
  if (items.length <= count) return [...items];

  const selected = [];
  const availableItems = [...items];
  let currentWeights = weights ? [...weights] : null;

  for (let i = 0; i < numToSelect; i++) {
    let index;
    if (currentWeights && currentWeights.length === availableItems.length && currentWeights.length > 0) {
      const totalWeight = currentWeights.reduce((sum, w) => sum + w, 0);
      if (totalWeight <= 0) {
        index = Math.floor(Math.random() * availableItems.length);
      } else {
        let random = Math.random() * totalWeight;
        for (index = 0; index < currentWeights.length; index++) {
          random -= currentWeights[index];
          if (random <= 0) break;
        }
        index = Math.min(index, availableItems.length - 1);
      }
    } else {
      index = Math.floor(Math.random() * availableItems.length);
    }
    selected.push(availableItems[index]);
    availableItems.splice(index, 1);
    if (currentWeights) {
      currentWeights.splice(index, 1);
    }
  }
  return selected;
};

const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
  if (!attractions || attractions.length === 0) return [];
  const categorized = categorizeAttractions(attractions);

  // Compute squared distances from user for weighting
  attractions.forEach(place => {
    const epsilon = 0.0001;
    place.distanceSq = Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2) + epsilon;
  });

  const themeSets = [
    ["Historical Highlights", ["historical", "landmarks", "museums"], 2],
    ["Arts & Culture", ["arts", "museums", "historical", "landmarks"], 2],
    ["Nature Escape", ["nature", "landmarks", "parks"], 2],
    ["Religious & Spiritual Sites", ["religious", "historical", "landmarks"], 2],
    ["Family Fun", ["entertainment", "nature", "landmarks", "zoo", "aquarium"], 2],
    ["Local Vibe & Shopping", ["neighborhoods", "shopping", "landmarks", "cafes"], 2],
    ["Hidden Gems & Local Spots", ["other", "landmarks", "neighborhoods", "restaurants"], 2],
    ["Architectural Wonders", ["historical", "religious", "landmarks", "modern_architecture"], 2],
    ["Scenic Views & Photo Ops", ["nature", "landmarks", "historical", "viewpoints"], 2],
    ["Cultural Immersion", ["museums", "arts", "neighborhoods", "markets"], 2]
  ];

  const locationSets = [];
  const usedPlaceIdsInSession = new Set();
  for (let i = 0; i < numSets && i < themeSets.length; i++) {
    const [theme, categoriesToUse] = themeSets[i];
    let availableForTheme = [];
    categoriesToUse.forEach(category => {
      if (categorized[category] && categorized[category].length > 0) {
        const uniquePlacesInCategory = categorized[category].filter(p => !usedPlaceIdsInSession.has(p.placeId));
        availableForTheme = availableForTheme.concat(uniquePlacesInCategory);
      }
    });
    // Remove duplicates
    availableForTheme = Array.from(new Map(availableForTheme.map(item => [item.placeId, item])).values());
    if (availableForTheme.length < 2) continue;
    const weights = availableForTheme.map(place => 1 / place.distanceSq);
    const selectedLocations = getWeightedRandomSelection(availableForTheme, locationsPerSet, weights);
    if (selectedLocations.length >= 2) {
      locationSets.push({ theme, locations: selectedLocations });
      selectedLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
    }
  }
  // Fallback if not enough sets
  if(locationSets.length < Math.min(numSets, 5) && attractions.length >= locationsPerSet) {
    console.log("Generating additional 'Best Of' sets due to low theme-specific results.");
    const allAvailable = attractions.filter(p => !usedPlaceIdsInSession.has(p.placeId));
    if(allAvailable.length >= 2) {
      const weights = allAvailable.map(place => 1 / place.distanceSq);
      const bestOfLocations = getWeightedRandomSelection(allAvailable, locationsPerSet, weights);
      if(bestOfLocations.length >= 2) {
        locationSets.push({ theme: "Best Of The Area", locations: bestOfLocations });
        bestOfLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
      }
    }
  }
  console.log(`Generated ${locationSets.length} diverse location sets.`);
  return locationSets;
};

const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
  if (!nearbyPlaces || nearbyPlaces.length === 0) {
    console.error("fetchGeminiExperiences called with no nearby places.");
    return [];
  }
  try {
    const locationName = await getLocationNameFromCoordinates(latitude, longitude);
    console.log(`Generating experiences for: ${locationName}`);
    const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude, 10, 4);
    if (diverseLocationSets.length === 0) {
      console.error("Failed to generate any diverse location sets from nearby places.");
      const fallbackPlaces = nearbyPlaces.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);
      if (fallbackPlaces.length >= 2) {
        console.log("Using fallback selection of top places.");
        diverseLocationSets.push({ theme: `Highlights of ${locationName}`, locations: fallbackPlaces });
      } else {
        return [];
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
    for (let i = 0; i < diverseLocationSets.length; i++) {
      const locationSet = diverseLocationSets[i];
      if (!locationSet.locations || locationSet.locations.length < 2) continue;
      const locationListString = locationSet.locations
        .map(loc => `- ${loc.locationName} (Place ID: ${loc.placeId || "N/A"})`)
        .join("\n");

      const themePrompt = `
You are an expert local tour guide for ${locationName}. Create a single, compelling, themed tour experience titled "${locationSet.theme}".

Your tour focuses *exclusively* on the following real locations:
${locationListString}

Generate a JSON object for this tour. The JSON object MUST follow this exact structure:
{
  "title": "An engaging title for the '${locationSet.theme}' tour in ${locationName}",
  "description": "A brief (2-3 sentences) overall tour description connecting these specific locations under the theme '${locationSet.theme}'. Mention the general area (${locationName}).",
  "locations": [
    {
      "locationName": "Full Name of Location 1",
      "lat": ${locationSet.locations[0].lat},
      "lon": ${locationSet.locations[0].lon},
      "placeId": "${locationSet.locations[0].placeId || ''}",
      "narration": "Detailed 150-300 word first-person narration for this specific location. Include: Welcome, sensory details, brief history/significance, interesting facts, connection to '${locationSet.theme}', and a transition hint.",
      "photos": []
    }
    // Repeat for each location provided.
  ]
}
Constraints:
- Output ONLY the JSON object.
- The 'locations' array must contain an object for each location.
- Ensure 'lat', 'lon', and 'placeId' are correctly copied.
- Keep narration concise (150-300 words per location).
`;

      generationPromises.push(
        model.generateContent({
          contents: [{ role: "user", parts: [{ text: themePrompt }] }]
        })
        .then(async result => {
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
            experience = JSON.parse(responseText);
          } catch(parseError) {
            console.error(`JSON parsing failed for theme ${locationSet.theme}. Raw response:`, responseText);
            throw new Error(`Failed to parse JSON response for theme ${locationSet.theme}: ${parseError.message}`);
          }
          if (!experience || !experience.title || !experience.description || !Array.isArray(experience.locations)) {
            console.error("Parsed JSON is missing required fields for theme:", locationSet.theme, experience);
            throw new Error(`Invalid JSON structure for theme: ${locationSet.theme}`);
          }
          const enhancedLocations = await Promise.all(
            experience.locations.map(async (genLocation) => {
              const inputLocation = locationSet.locations.find(
                inputLoc =>
                  (genLocation.placeId && inputLoc.placeId === genLocation.placeId) ||
                  (inputLoc.locationName.toLowerCase() === genLocation.locationName.toLowerCase() &&
                    Math.abs(inputLoc.lat - genLocation.lat) < 0.001 &&
                    Math.abs(inputLoc.lon - genLocation.lon) < 0.001)
              );
              if (!inputLocation) {
                console.warn(`Could not match generated location "${genLocation.locationName}" for theme ${locationSet.theme}.`);
                const photos = genLocation.placeId ? await getLocationPhotos(genLocation.placeId) : [];
                return { ...genLocation, photos: photos || [] };
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
                narration: genLocation.narration || `Welcome to ${inputLocation.locationName}.`,
                photos: photos || []
              };
            })
          );
          generatedExperiences.push({ ...experience, locations: enhancedLocations });
          console.log(`Successfully generated experience for theme: ${locationSet.theme}`);
        })
        .catch(error => {
          console.error(`Error processing generation for theme ${locationSet.theme}:`, error.message);
        })
      );
    }

    await Promise.allSettled(generationPromises);
    console.log(`Finished generating experiences. ${generatedExperiences.length} successful.`);
    return generatedExperiences;
  } catch (error) {
    console.error("Gemini API or processing error:", error);
    return [];
  }
};

/* ---------------------------------------------------------------------------
   Simple In-Memory Rate Limiter Middleware
   --------------------------------------------------------------------------- */
const rateLimiter = {
  requests: new Map(),
  limit: 60, // per minute
  windowMs: 60 * 1000,
  resetTimeouts: new Map(),
  check: function(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
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
   Main API Route: Using Location Name + Geohash as Key for Caching Experiences
   --------------------------------------------------------------------------- */
router.post("/", rateLimit, async (req, res) => {
  try {
    const { lat, lon, user_id } = req.body; // user_id can be supplied from the client if available
    if (!lat || !lon) {
      return res.status(400).json({ error: "Latitude and longitude are required." });
    }

    // Reverse geocode to obtain a stable location name key.
    const rawLocationName = await getLocationNameFromCoordinates(lat, lon);
    if (!rawLocationName) {
      return res.status(500).json({ error: "Failed to determine location name." });
    }
    // Generate locationKey including geohash
    const locationKey = normalizeLocationName(rawLocationName, lat, lon);
    console.log("Generated locationKey:", locationKey);

    // Query for ANY experiences with this locationKey
    const existingExperiences = await Experience.find({ locationKey });
    console.log("Found cached experiences:", existingExperiences);

    if (existingExperiences && existingExperiences.length > 0) {
      console.log(`Returning cached experiences for ${locationKey}`);
      return res.json({ experiences: existingExperiences });
    }

    // No cached experiences for this location: get nearby places and generate new experiences.
    const nearbyPlaces = await getNearbyPlaces(lat, lon, 30000);
    const generatedExperiences = await fetchGeminiExperiences(nearbyPlaces, lat, lon);
    if (generatedExperiences.length === 0) {
      return res.status(500).json({ error: "Failed to generate experiences." });
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
    const savedExperiences = await Experience.insertMany(enrichedExperiences);
    console.log(`Saved ${savedExperiences.length} experiences for ${locationKey} by user ${effectiveUserId}`);
    return res.json({ experiences: savedExperiences });
  } catch (error) {
    console.error("Error in /api/experiences:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;