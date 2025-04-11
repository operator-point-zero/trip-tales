import express from "express";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Experience from "../../models/experiences/Experience.js"; // Adjust path as needed

// --- Initialization ---
const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Caching ---
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
    setTimeout(() => {
      console.log(`Cache expired and removed for key: ${key}`);
      this[type].delete(key);
    }, 60 * 60 * 1000);
    console.log(`Cache set for key: ${key}`);
  }
};

// --- Geocoding and Place Details ---
const getLocationNameFromCoordinates = async (lat, lon) => {
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${process.env.GOOGLE_PLACES_API_KEY}`
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

const getNearbyPlaces = async (lat, lon, radius = 10000) => {
  const type = 'attractions';
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
    const places = response.data?.results?.map(place => ({ // Added optional chaining
      locationName: place.name,
      lat: place.geometry.location.lat,
      lon: place.geometry.location.lng,
      placeId: place.place_id,
      types: place.types,
      rating: place.rating || "N/A",
      vicinity: place.vicinity || null
    })) || []; // Ensure an empty array if no results
    placesCache.set(type, lat, lon, radius, places);
    return places;
  } catch (error) {
    console.error("Failed to fetch nearby places:", error.message);
    return [];
  }
};

const searchForAdditionalAttractions = async (lat, lon, radius = 20000) => {
  const type = 'additional_attractions';
  try {
    const cachedData = placesCache.get(type, lat, lon, radius);
    if (cachedData) {
      console.log(`Cache hit for additional attractions: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}`);
      return cachedData;
    }
    console.log(`Cache miss for additional attractions: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}. Fetching from API...`);
    const searchTypes = "museum|park|church|mosque|temple|zoo|aquarium|art_gallery|landmark|historical_site";
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=${searchTypes}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    const attractions = response.data?.results?.map(place => ({ // Added optional chaining
      locationName: place.name,
      lat: place.geometry.location.lat,
      lon: place.geometry.location.lng,
      placeId: place.place_id,
      types: place.types,
      rating: place.rating || "N/A",
      vicinity: place.vicinity || null
    })) || []; // Ensure an empty array if no results
    placesCache.set(type, lat, lon, radius, attractions);
    return attractions;
  } catch (error) {
    console.error("Failed to fetch additional attractions:", error.message);
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

const categorizeAttractions = (attractions) => {
  const categories = {
    museums: [], historical: [], nature: [], entertainment: [],
    religious: [], arts: [], shopping: [], neighborhoods: [],
    landmarks: [], other: []
  };
  attractions.forEach(place => {
    const types = place.types || [];
    let categorized = false;
    if (types.includes('museum')) { categories.museums.push(place); categorized = true; }
    if (types.includes('park') || types.includes('natural_feature')) { categories.nature.push(place); categorized = true; }
    if (types.includes('church') || types.includes('mosque') || types.includes('temple') || types.includes('hindu_temple') || types.includes('synagogue') || types.includes('place_of_worship')) { categories.religious.push(place); categorized = true; }
    if (types.includes('art_gallery') || types.includes('performing_arts_theater')) { categories.arts.push(place); categorized = true; }
    if (types.includes('amusement_park') || types.includes('zoo') || types.includes('aquarium')) { categories.entertainment.push(place); categorized = true; }
    if (types.includes('department_store') || types.includes('shopping_mall')) { categories.shopping.push(place); categorized = true; }
    if (types.some(type => type.includes('historic') || type.includes('monument') || type.includes('castle'))) { categories.historical.push(place); categorized = true; }
    if (types.includes('neighborhood') || types.includes('sublocality')) { categories.neighborhoods.push(place); categorized = true; }
    if (types.includes('landmark') || types.includes('point_of_interest')) { categories.landmarks.push(place); categorized = true; }
    if (!categorized) { categories.other.push(place); }
  });
  const seenPlaceIds = new Set();
  for (const category in categories) {
    categories[category] = categories[category].filter(place => {
      if (seenPlaceIds.has(place.placeId)) {
        return false;
      }
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

const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 15, minLocationsPerSet = 2, maxLocationsPerSet = 4) => {
  if (!attractions || attractions.length === 0) return [];
  const categorized = categorizeAttractions(attractions);
  attractions.forEach(place => {
    const epsilon = 0.0001;
    place.distanceSq = Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2) + epsilon;
  });
  const themeSets = [
    ["Historical Highlights", ["historical", "landmarks", "museums"], minLocationsPerSet],
    ["Arts & Culture", ["arts", "museums", "historical", "landmarks"], minLocationsPerSet],
    ["Nature Escape", ["nature", "landmarks", "parks"], minLocationsPerSet],
    ["Religious & Spiritual Sites", ["religious", "historical", "landmarks"], minLocationsPerSet],
    ["Family Fun", ["entertainment", "nature", "landmarks", "zoo", "aquarium"], minLocationsPerSet],
    ["Local Vibe & Shopping", ["neighborhoods", "shopping", "landmarks", "cafes"], minLocationsPerSet],
    ["Hidden Gems & Local Spots", ["other", "landmarks", "neighborhoods", "restaurants"], minLocationsPerSet],
    ["Architectural Wonders", ["historical", "religious", "landmarks", "modern_architecture"], minLocationsPerSet],
    ["Scenic Views & Photo Ops", ["nature", "landmarks", "historical", "viewpoints"], minLocationsPerSet],
    ["Cultural Immersion", ["museums", "arts", "neighborhoods", "markets"], minLocationsPerSet]
  ];
  const locationSets = [];
  const usedPlaceIdsInSession = new Set();
  for (let i = 0; i < numSets && i < themeSets.length; i++) {
    const [theme, categoriesToUse, minPerCategory] = themeSets[i];
    let availableForTheme = [];
    categoriesToUse.forEach(category => {
      if (categorized[category] && categorized[category].length > 0) {
        const uniquePlacesInCategory = categorized[category].filter(p => !usedPlaceIdsInSession.has(p.placeId));
        availableForTheme = [...availableForTheme, ...uniquePlacesInCategory];
      }
    });
    availableForTheme = Array.from(
      new Map(availableForTheme.map(item => [item.placeId, item])).values()
    );
    if (availableForTheme.length < minLocationsPerSet) continue;
    const weights = availableForTheme.map(place => 1 / place.distanceSq);
    const numToSelect = Math.min(maxLocationsPerSet, availableForTheme.length);
    const selectedLocations = getWeightedRandomSelection(
      availableForTheme,
      numToSelect,
      weights
    );
    if (selectedLocations.length >= minLocationsPerSet) {
      locationSets.push({
        theme,
        locations: selectedLocations
      });
      selectedLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
    }
  }
  if (locationSets.length < Math.min(numSets, 5) && attractions.length >= minLocationsPerSet) {
    console.log("Generating additional 'Best Of' sets due to low theme-specific results.");
    const allAvailable = attractions.filter(p => !usedPlaceIdsInSession.has(p.placeId));
    if (allAvailable.length >= minLocationsPerSet) {
      const weights = allAvailable.map(place => 1 / place.distanceSq);
      const numToSelect = Math.min(maxLocationsPerSet, allAvailable.length);
      const bestOfLocations = getWeightedRandomSelection(allAvailable, numToSelect, weights);
      if (bestOfLocations.length >= minLocationsPerSet) {
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

    const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude, 15, 2, 4);

    if (diverseLocationSets.length === 0) {
      console.error("Failed to generate any diverse location sets from nearby places.");
      const fallbackPlaces = nearbyPlaces.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);
      if (fallbackPlaces.length >= 2) {
        console.log("Using fallback selection of top places.");
        diverseLocationSets.push({ theme: `Highlights of ${locationName}`, locations: fallbackPlaces });
      } else if (fallbackPlaces.length === 1) {
        console.log("Using fallback selection of single top place.");
        diverseLocationSets.push({ theme: `Focus on ${fallbackPlaces[0].locationName}`, locations: fallbackPlaces });
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
        responseMimeType: "application/json",
      }
    });

    const generatedExperiences = [];
    const generationPromises = [];

    for (let i = 0; i < diverseLocationSets.length; i++) {
      const locationSet = diverseLocationSets[i];
      if (!locationSet.locations || locationSet.locations.length < 1) continue;

      const locationListString = locationSet.locations.map(loc => `- ${loc.locationName} (Place ID: ${loc.placeId || 'N/A'})`).join('\n');

      let themePrompt = `
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
      "narration": "Detailed 150-300 word first-person narration for this specific location. Include: Welcome, sensory details (sights/sounds), brief history/significance, 1-2 interesting facts or hidden details, a connection to the theme '${locationSet.theme}', and a transition hint towards the next stop (if applicable). Make it engaging and informative.",
      "photos": []
    }
  ]
}
Constraints:
- Output ONLY the JSON object. No introductory text, explanations, or markdown formatting.
- The 'locations' array must contain an object for each location listed in the prompt.
- Ensure 'lat', 'lon', and 'placeId' are correctly copied from the input for each location.
- Keep narration concise (150-300 words per location).
`;
      if (locationSet.locations.length === 1) {
        themePrompt = themePrompt.replace(/a transition hint towards the next stop \(if applicable\)/g, "some interesting details");
      }
      const locationObjects = locationSet.locations.map(loc => `{
      "locationName": "${loc.locationName?.replace(/"/g, '\\"') || ''}", // Added nullish coalescing and optional chaining
      "lat": ${loc.lat},
      "lon": ${loc.lon},
      "placeId": "${loc.placeId || ''}",
      "narration": "Detailed 150-300 word first-person narration for this specific location. Include: Welcome, sensory details (sights/sounds), brief history/significance, 1-2 interesting facts or hidden details, a connection to the theme '${locationSet.theme}', and a transition hint towards the next stop (if applicable). Make it engaging and informative.",
      "photos": []
    }`).join(',');

      const fullPrompt = themePrompt.replace(/{\s+"locationName": "Full Name of Location 1",[\s\S]*?\s+"photos": \[\]\s+}/g, `[${locationObjects}]`);


      generationPromises.push(
        model.generateContent({ contents: [{ role: "user", parts: [{ text: fullPrompt }] }] })
          .then(async result => {
            if (!result.response || !result.response.candidates || !result.response.candidates[0].content || !result.response.candidates[0].content.parts || !result.response.candidates[0].content.parts[0].text) {
              throw new Error(`Invalid response structure from Gemini for theme: ${locationSet.theme}`);
            }
            const responseText = result.response.candidates[0].content.parts[0].text;
            let experience;
            try {
              experience = JSON.parse(responseText);
              console.log(`Successfully parsed JSON for theme: ${locationSet.theme}`);
            } catch (parseError) {
              console.error(`JSON parsing failed for theme ${locationSet.theme}. Raw response:`, responseText);
              throw new Error(`Failed to parse JSON response for theme ${locationSet.theme}: ${parseError.message}`);
            }
            if (!experience || !experience.title || !experience.description || !Array.isArray(experience.locations)) {
              console.error("Parsed JSON is missing required fields for theme:", locationSet.theme, experience);
              throw new Error(`Parsed JSON structure is invalid for theme: ${locationSet.theme}`);
            }
            const enhancedLocations = await Promise.all(experience.locations.map(async (genLocation) => {
              const inputLocation = locationSet.locations.find(inputLoc =>
                (genLocation.placeId && inputLoc.placeId === genLocation.placeId) ||
                (inputLoc.locationName?.toLowerCase() === genLocation.locationName?.toLowerCase() && // Added optional chaining
                  Math.abs(inputLoc.lat - genLocation.lat) < 0.001 &&
                  Math.abs(inputLoc.lon - genLocation.lon) < 0.001)
              );
              if (!inputLocation) {
                console.warn(`Could not reliably match generated location "${genLocation.locationName}" back to input for theme ${locationSet.theme}. Using generated data.`);
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
            }));
            generatedExperiences.push({
              ...experience,
              locations: enhancedLocations
            });
            console.log(`Successfully generated and processed experience for theme: ${locationSet.theme}`);
          })
          .catch(error => {
            console.error(`Error processing generation for theme ${locationSet.theme}:`, error.message);
          })
      );
    }

    await Promise.allSettled(generationPromises);
    console.log(`Finished generating experiences. Got ${generatedExperiences.length} successful results.`);
    return generatedExperiences;

  } catch (error) {
    console.error("Gemini API request preparation or overall processing failed:", error);
    return [];
  }
};

const rateLimiter = {
  requests: new Map(),
  limit: 60,
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

const filterExperiencesForUser = (experiences, userLat, userLon, params = {}) => {
  if (!experiences || experiences.length === 0) return [];
  const locationUsageCount = new Map();
  experiences.forEach(exp => {
    exp.locations.forEach(loc => {
      if (loc.placeId) {
        locationUsageCount.set(loc.placeId, (locationUsageCount.get(loc.placeId) || 0) + 1);
      }
    });
  });
  experiences.forEach(exp => {
    let score = 50;
    let totalDistance = 0;
    let validLocations = 0;
    exp.locations.forEach(loc => {
      if (loc.lat && loc.lon) {
        const distSq = Math.pow(loc.lat - userLat, 2) + Math.pow(loc.lon - userLon, 2);
        score += Math.max(0, 25 - (Math.sqrt(distSq) * 500));
        validLocations++;
      }
    });
    let locationOverlapPenalty = 0;
    exp.locations.forEach(loc => {
      if (loc.placeId) {
        const usage = locationUsageCount.get(loc.placeId) || 1;
        if (usage > 1) {
          locationOverlapPenalty += (usage - 1) * 5;
        }
      }
    });
    score -= locationOverlapPenalty;
    let avgRating = 0;
    let ratedLocations = 0;
    exp.locations.forEach(loc => {
      if (loc.rating && typeof loc.rating === 'number' && loc.rating >= 0) {
        avgRating += loc.rating;
        ratedLocations++;
      }
    });
    if (ratedLocations > 0) {
      avgRating /= ratedLocations;
      score += (avgRating - 3) * 5;
    }
    if (params.preferredCategories && Array.isArray(params.preferredCategories)) {
      let matchScore = 0;
      exp.locations.forEach(loc => {
        if (loc.types && Array.isArray(loc.types)) {
          if (loc.types.some(type => params.preferredCategories.includes(type))) {
            matchScore += 5;
          }
        }
      });
      score += matchScore;
    }
    exp.relevanceScore = Math.max(0, Math.min(100, Math.round(score)));
  });
  return experiences.sort((a, b) => b.relevanceScore - a.relevanceScore);
};

const saveExperiencesToDatabase = async (experiencesData, isSeed = false, userId = null) => {
  if (!experiencesData || experiencesData.length === 0) return [];
  const experiencesToSave = experiencesData.map(exp => ({
    ...exp,
    user_id: isSeed ? null : userId,
    is_seed: isSeed,
    times_shown: 0,
    created_at: new Date(),
  }));
  try {
    const savedExperiences = await Experience.insertMany(experiencesToSave);
    console.log(`Saved ${savedExperiences.length} experiences to DB. isSeed: ${isSeed}`);
    return savedExperiences;
  } catch (error) {
    console.error(`Error saving experiences to DB (isSeed: ${isSeed}):`, error);
    throw error;
  }
};

async function isUrbanLocation(lat, lon) {
  try {
    const radius = 500;
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=establishment&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    const isUrban = response.data.results.length > 15;
    console.log(`Location ${lat},${lon} density check: ${response.data.results.length} establishments. isUrban: ${isUrban}`);
    return isUrban;
  } catch (error) {
    console.error("Error determining location type (urban/rural):", error.message);
    return false;
  }
}

// --- Main API Route ---
// POST /api/experiences - Main route to fetch or generate experiences
router.post("/", rateLimit, async (req, res) => {
  try {
    const { lat, lon, user_id, preferences } = req.body;
    if (lat === undefined || lon === undefined) {
      return res.status(400).json({ error: "Latitude and longitude are required." });
    }

    console.log(`Received request for experiences at lat: ${lat}, lon: ${lon}, user_id: ${user_id}`);

    const nearbyPlaces = await getNearbyPlaces(lat, lon);
    console.log(`Found ${nearbyPlaces.length} nearby tourist attractions.`);

    const additionalAttractions = await searchForAdditionalAttractions(lat, lon);
    console.log(`Found ${additionalAttractions.length} additional attractions.`);

    const allAttractions = [...nearbyPlaces, ...additionalAttractions];
    const uniqueAttractionsMap = new Map(allAttractions.map(item => [item.placeId, item]));
    const uniqueAttractions = [...uniqueAttractionsMap.values()];
    console.log(`Found ${uniqueAttractions.length} unique attractions in total.`);

    if (uniqueAttractions.length === 0) {
      return res.json({ message: "No attractions found in this area." });
    }

    const generatedExperiences = await fetchGeminiExperiences(uniqueAttractions, lat, lon);
    console.log(`Generated ${generatedExperiences.length} experiences.`);

    const filteredExperiences = filterExperiencesForUser(generatedExperiences, lat, lon, preferences);
    console.log(`Filtered and scored ${filteredExperiences.length} experiences.`);

    if (filteredExperiences.length > 0) {
      try {
        // Save the filtered experiences to the database
        const savedExperiences = await saveExperiencesToDatabase(filteredExperiences, false, user_id);
        console.log(`Successfully saved ${savedExperiences.length} experiences to the database.`);
        return res.json(filteredExperiences); // Or you could return the saved experiences if needed
      } catch (error) {
        console.error("Error saving experiences to the database:", error);
        return res.status(500).json({ error: "Failed to save experiences to the database." });
      }
    } else {
      return res.json({ message: "No relevant experiences found for this location." });
    }

  } catch (error) {
    console.error("Error processing request:", error);
    return res.status(500).json({ error: "Failed to generate experiences." });
  }
});

export default router;