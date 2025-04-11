///////////////////////////////////////////////////////////////////////////////
// Filename: ./routes/api/experiences.js (Example Path)
///////////////////////////////////////////////////////////////////////////////

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
  getKey: (lat, lon, radius, types = 'default') => `${lat.toFixed(4)},${lon.toFixed(4)},${radius},${types}`, // Include types in key
  get: function(type, lat, lon, radius, types = 'default') {
    const key = this.getKey(lat, lon, radius, types);
    const cached = this[type].get(key);
    if (cached) {
        console.log(`Cache HIT for key: ${key}`);
        return cached;
    }
    console.log(`Cache MISS for key: ${key}`);
    return null; // Explicitly return null on miss
  },
  set: function(type, lat, lon, radius, data, types = 'default') {
    const key = this.getKey(lat, lon, radius, types);
    this[type].set(key, { data: data, timestamp: Date.now() }); // Store data and timestamp
    // Set expiration (e.g., 1 hour)
    const expirationTime = 60 * 60 * 1000;
    setTimeout(() => {
        console.log(`Cache expired and removed for key: ${key}`);
        this[type].delete(key);
    }, expirationTime);
    console.log(`Cache SET for key: ${key} with ${data?.length || 0} items. Expires in ${expirationTime / 60000} minutes.`);
  }
};

// --- Helper for Places API Pagination ---
const MAX_PLACES_RESULTS = 60; // Max results Google allows (20 per page * 3 pages)
const PLACES_API_DELAY = 2000; // Delay in ms before requesting next page token (Google requires a short delay)

const fetchPlacesWithPagination = async (baseUrl, params) => {
    let allPlacesRaw = [];
    let nextPageToken = null;
    let pagesFetched = 0;
    const MAX_PAGES = 3; // Fetch max 3 pages (20 * 3 = 60 results)

    console.log(`Workspaceing places. Initial URL: ${baseUrl}, Initial Params:`, params);

    do {
        pagesFetched++;
        const currentParams = { ...params };
        let urlToFetch = baseUrl; // Use base URL for the first request

        if (nextPageToken) {
            // IMPORTANT: When using pagetoken, ONLY include pagetoken and key parameters.
            // Other parameters like location, radius, type must be omitted.
            const pageTokenParams = {
                pagetoken: nextPageToken,
                key: params.key // Key is always required
            };
            console.log(`Workspaceing page ${pagesFetched} with next_page_token... Using params:`, pageTokenParams);
            // Google requires a short delay before using the next page token
            await new Promise(resolve => setTimeout(resolve, PLACES_API_DELAY));
            // Use the same baseUrl, but with different params
            try {
                 const response = await axios.get(baseUrl, { params: pageTokenParams });
                 const results = response.data.results || [];
                 allPlacesRaw = allPlacesRaw.concat(results);
                 nextPageToken = response.data.next_page_token || null;
                 console.log(`Page ${pagesFetched} fetched ${results.length} places. Total: ${allPlacesRaw.length}. Next token: ${!!nextPageToken}`);
            } catch (error) {
                 console.error(`Error fetching page ${pagesFetched} (with pagetoken) from Places API:`, error.response?.data?.error_message || error.response?.data?.status || error.message);
                 nextPageToken = null; // Stop pagination on error
            }

        } else {
            // First page request
            try {
                const response = await axios.get(urlToFetch, { params: currentParams });
                const results = response.data.results || [];
                allPlacesRaw = allPlacesRaw.concat(results);
                nextPageToken = response.data.next_page_token || null;
                console.log(`Page ${pagesFetched} fetched ${results.length} places. Total: ${allPlacesRaw.length}. Next token: ${!!nextPageToken}`);
            } catch (error) {
                 console.error(`Error fetching page ${pagesFetched} (initial) from Places API:`, error.response?.data?.error_message || error.response?.data?.status || error.message);
                 nextPageToken = null; // Stop on error
            }
        }

    } while (nextPageToken && allPlacesRaw.length < MAX_PLACES_RESULTS && pagesFetched < MAX_PAGES);

    console.log(`Finished fetching places. Total collected: ${allPlacesRaw.length}`);
    return allPlacesRaw;
};


// --- Geocoding and Place Details ---

const getLocationNameFromCoordinates = async (lat, lon) => {
  // No changes from previous version
  try {
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );
    if (response.data.results && response.data.results.length > 0) {
      const addressComponents = response.data.results[0].address_components;
      const locality = addressComponents.find(component => component.types.includes('locality'));
      const adminArea = addressComponents.find(component => component.types.includes('administrative_area_level_1'));
      const country = addressComponents.find(component => component.types.includes('country'));
      return (locality?.long_name || adminArea?.long_name || country?.long_name || 'this area');
    }
    return 'this area';
  } catch (error) {
    console.error("Failed to get location name:", error.message);
    return 'this area';
  }
};

// Updated to use pagination helper
const getNearbyPlaces = async (lat, lon, radius = 5000) => {
  // No changes from previous version incorporating pagination
  const cacheType = 'attractions';
  const searchTypeParam = 'tourist_attraction';
  const cacheKeyTypes = searchTypeParam;

  try {
    const cachedResult = placesCache.get(cacheType, lat, lon, radius, cacheKeyTypes);
    if (cachedResult) {
        console.log(`Cache hit for nearby places (${searchTypeParam}): ${lat.toFixed(4)},${lon.toFixed(4)},${radius}. Found ${cachedResult.data.length} places.`);
        return cachedResult.data; // Return data from cache object
    }
    console.log(`Cache miss for nearby places (${searchTypeParam}): ${lat.toFixed(4)},${lon.toFixed(4)},${radius}. Fetching from API...`);

    const baseUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
    const params = {
        location: `${lat},${lon}`,
        radius: radius,
        type: searchTypeParam,
        key: process.env.GOOGLE_PLACES_API_KEY
    };

    const fetchedPlacesRaw = await fetchPlacesWithPagination(baseUrl, params);

    const places = fetchedPlacesRaw.map(place => ({
      locationName: place.name,
      lat: place.geometry.location.lat,
      lon: place.geometry.location.lng,
      placeId: place.place_id,
      types: place.types,
      rating: place.rating || null, // Use null instead of "N/A" for consistency
      vicinity: place.vicinity || null
    }));

    placesCache.set(cacheType, lat, lon, radius, places, cacheKeyTypes);
    return places;
  } catch (error) {
    console.error(`Failed to fetch nearby places (${searchTypeParam}):`, error.message);
    return [];
  }
};

// Updated to use pagination helper and broader types
const searchForAdditionalAttractions = async (lat, lon, radius = 15000) => {
  // No changes from previous version incorporating pagination
  const cacheType = 'additional_attractions';
  const searchTypes = "museum|park|church|mosque|temple|zoo|aquarium|art_gallery|landmark|historical_site|natural_feature|point_of_interest|cafe|restaurant|market|tourist_attraction";
  const cacheKeyTypes = 'broad_mix';

  try {
    const cachedResult = placesCache.get(cacheType, lat, lon, radius, cacheKeyTypes);
    if (cachedResult) {
        console.log(`Cache hit for additional attractions (broad mix): ${lat.toFixed(4)},${lon.toFixed(4)},${radius}. Found ${cachedResult.data.length} places.`);
        return cachedResult.data; // Return data from cache object
    }
    console.log(`Cache miss for additional attractions (broad_mix): ${lat.toFixed(4)},${lon.toFixed(4)},${radius}. Fetching from API...`);

    const baseUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
    const params = {
        location: `${lat},${lon}`,
        radius: radius,
        type: searchTypes,
        key: process.env.GOOGLE_PLACES_API_KEY
    };

    const fetchedPlacesRaw = await fetchPlacesWithPagination(baseUrl, params);

    const attractions = fetchedPlacesRaw.map(place => ({
      locationName: place.name,
      lat: place.geometry.location.lat,
      lon: place.geometry.location.lng,
      placeId: place.place_id,
      types: place.types,
      rating: place.rating || null,
      vicinity: place.vicinity || null
    }));

    placesCache.set(cacheType, lat, lon, radius, attractions, cacheKeyTypes);
    return attractions;
  } catch (error) {
    console.error("Failed to fetch additional attractions (broad_mix):", error.message);
    return [];
  }
};

// Helper to get photos for a location using Place Details API
const getLocationPhotos = async (placeId) => {
  // No changes from previous version
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


// --- Experience Generation Logic ---

// Categorize attractions
const categorizeAttractions = (attractions) => {
    // No changes from previous version
    const categories = {
        museums: [], historical: [], nature: [], entertainment: [],
        religious: [], arts: [], shopping: [], neighborhoods: [],
        landmarks: [], other: []
    };
    const categoryMap = {
        museum: 'museums', park: 'nature', natural_feature: 'nature',
        church: 'religious', mosque: 'religious', temple: 'religious', hindu_temple: 'religious', synagogue: 'religious', place_of_worship: 'religious',
        art_gallery: 'arts', performing_arts_theater: 'arts',
        amusement_park: 'entertainment', zoo: 'entertainment', aquarium: 'entertainment',
        department_store: 'shopping', shopping_mall: 'shopping', market: 'shopping', // Added market
        historic: 'historical', historical_site: 'historical', monument: 'historical', castle: 'historical', // Expanded historical
        neighborhood: 'neighborhoods', sublocality: 'neighborhoods',
        landmark: 'landmarks', point_of_interest: 'landmarks', tourist_attraction: 'landmarks', // Added tourist_attraction here too
        cafe: 'other', restaurant: 'other' // Group cafes/restaurants as other for now, or create new categories
    };

    attractions.forEach(place => {
        let assigned = false;
        for (const type of place.types || []) {
            if (categoryMap[type]) {
                categories[categoryMap[type]].push(place);
                assigned = true;
                break; // Assign to the first matching category found
            }
             // Handle compound types like historical_landmark -> historical
            if (type.includes('historic')) { categories.historical.push(place); assigned = true; break;}
            if (type.includes('landmark')) { categories.landmarks.push(place); assigned = true; break;}
        }
        if (!assigned) {
            categories.other.push(place);
        }
    });

    // De-duplicate across categories (keep first categorization)
    const seenPlaceIds = new Set();
    let totalCategorized = 0;
    for (const category in categories) {
        categories[category] = categories[category].filter(place => {
            if (!place.placeId) return false; // Skip places without ID for uniqueness check
            if (seenPlaceIds.has(place.placeId)) {
                return false;
            }
            seenPlaceIds.add(place.placeId);
            return true;
        });
        totalCategorized += categories[category].length;
    }
    console.log(`Categorized attractions into ${Object.keys(categories).length} categories. Total unique categorized places: ${totalCategorized}`);
    return categories;
};

// Weighted random selection
const getWeightedRandomSelection = (items, count, weights = null) => {
    // No changes from previous version
    if (!items || items.length === 0) return [];
    const numToSelect = Math.min(count, items.length);
    if (items.length <= count) return [...items];

    const selected = [];
    const availableItems = [...items];
    let currentWeights = weights ? [...weights] : null;

    for (let i = 0; i < numToSelect; i++) {
        let index;
        if (currentWeights && currentWeights.length === availableItems.length && currentWeights.length > 0) {
            const totalWeight = currentWeights.reduce((sum, w) => sum + (w > 0 ? w : 0), 0); // Sum only positive weights
            if (totalWeight <= 0) { index = Math.floor(Math.random() * availableItems.length); }
            else {
                let random = Math.random() * totalWeight;
                for (index = 0; index < currentWeights.length; index++) {
                    random -= (currentWeights[index] > 0 ? currentWeights[index] : 0); // Subtract positive weights
                    if (random <= 0) break;
                }
                index = Math.min(index, availableItems.length - 1);
            }
        } else { index = Math.floor(Math.random() * availableItems.length); }

        if (index >= 0 && index < availableItems.length) {
             selected.push(availableItems[index]);
             availableItems.splice(index, 1);
             if (currentWeights) { currentWeights.splice(index, 1); }
        } else {
             console.warn(`Weighted selection generated invalid index: ${index}. Available: ${availableItems.length}. Skipping selection.`);
             // Break or continue? Continuing might lead to fewer items than requested. Let's continue.
        }
    }
    return selected;
};

// Generate diverse location sets
const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
    // No changes from previous version
    if (!attractions || attractions.length === 0) return [];
    const categorized = categorizeAttractions(attractions);
    attractions.forEach(place => {
        const epsilon = 0.0001;
        place.distanceSq = place.lat && place.lon ? Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2) + epsilon : Infinity;
    });
    const themeSets = [ /* ... same themes ... */ ]; // Use the same theme definitions
    const locationSets = [];
    const usedPlaceIdsInSession = new Set();

    for (let i = 0; i < numSets && i < themeSets.length; i++) {
        const [theme, categoriesToUse] = themeSets[i];
        let availableForTheme = [];
        categoriesToUse.forEach(category => {
            if (categorized[category] && categorized[category].length > 0) {
                const uniquePlacesInCategory = categorized[category].filter(p => p.placeId && !usedPlaceIdsInSession.has(p.placeId));
                availableForTheme = [...availableForTheme, ...uniquePlacesInCategory];
            }
        });
        availableForTheme = Array.from(new Map(availableForTheme.map(item => [item.placeId, item])).values());
        if (availableForTheme.length < 2) continue;
        const weights = availableForTheme.map(place => 1 / place.distanceSq);
        const selectedLocations = getWeightedRandomSelection(availableForTheme, locationsPerSet, weights);
        if (selectedLocations.length >= 2) {
            locationSets.push({ theme, locations: selectedLocations });
            selectedLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
        }
    }
    // Fallback "Best Of"
    if(locationSets.length < Math.min(numSets, 5) && attractions.length >= locationsPerSet) {
      console.log("Generating additional 'Best Of' sets due to low theme-specific results.");
      const allAvailable = attractions.filter(p => p.placeId && !usedPlaceIdsInSession.has(p.placeId) && p.distanceSq !== Infinity);
       if(allAvailable.length >= 2) {
            const weights = allAvailable.map(place => 1 / place.distanceSq);
            // Sort by weight desc (closer first) as a fallback selection method
            allAvailable.sort((a, b) => (1/a.distanceSq) - (1/b.distanceSq));
            const bestOfLocations = allAvailable.slice(0, locationsPerSet);
            // const bestOfLocations = getWeightedRandomSelection(allAvailable, locationsPerSet, weights); // Or keep using random weighted
            if(bestOfLocations.length >= 2) {
                locationSets.push({ theme: "Best Of The Area", locations: bestOfLocations });
                bestOfLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
            }
       }
    }

    console.log(`Generated ${locationSets.length} diverse location sets for Gemini input.`);
    return locationSets;
};


// Generate experiences with Gemini (with retry logic)
const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
    // No changes from previous version incorporating retries
    if (!nearbyPlaces || nearbyPlaces.length === 0) {
        console.error("fetchGeminiExperiences called with no nearby places.");
        return [];
    }
    const MAX_RETRIES = 2;
    const RETRY_DELAY = 1500;

    try {
        const locationName = await getLocationNameFromCoordinates(latitude, longitude);
        console.log(`Generating experiences for: ${locationName} using ${nearbyPlaces.length} unique places.`);
        const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude, 10, 4);

        if (diverseLocationSets.length === 0) {
             console.warn("No diverse location sets generated. Attempting fallback with top places.");
              const fallbackPlaces = nearbyPlaces
                  .filter(p => p.lat && p.lon) // Ensure coords exist
                  .sort((a,b) => (b.rating || 0) - (a.rating || 0)) // Sort by rating desc
                  .slice(0, 4);
              if (fallbackPlaces.length >= 2) {
                  console.log("Using fallback selection of top places.");
                  diverseLocationSets.push({ theme: `Highlights of ${locationName}`, locations: fallbackPlaces });
              } else {
                   console.error("Fallback failed: Not enough places with coords/rating.");
                   return []; // Cannot proceed if no sets and fallback fails
              }
        }

        const model = genAI.getGenerativeModel({
             model: "gemini-1.5-flash",
             safetySettings: [ /* ... */ ], // Keep safety settings
             generationConfig: { /* ... */ responseMimeType: "application/json" } // Keep config
        });

        const generatedExperiences = [];
        const generationPromises = [];

        for (let i = 0; i < diverseLocationSets.length; i++) {
            const locationSet = diverseLocationSets[i];
            if (!locationSet.locations || locationSet.locations.length < 2) continue;

            const locationListString = locationSet.locations.map(loc => `- ${loc.locationName} (Place ID: ${loc.placeId || 'N/A'})`).join('\n');
            const themePrompt = `
You are an expert local tour guide for ${locationName}. Create a single, compelling, themed tour experience titled "${locationSet.theme}".

Your tour focuses *exclusively* on the following real locations:
${locationListString}

Generate a JSON object for this tour. The JSON object MUST follow this exact structure:
{
  "title": "An engaging title for the '${locationSet.theme}' tour in ${locationName}",
  "description": "A brief (2-3 sentences) overall tour description connecting these specific locations under the theme '${locationSet.theme}'. Mention the general area (${locationName}).",
  "locations": [
    // For EACH location listed above, create a JSON object like this:
    {
      "locationName": "Full Name of Location 1", // Match the name provided above EXACTLY
      "lat": ${locationSet.locations[0].lat}, // Use provided Lat
      "lon": ${locationSet.locations[0].lon}, // Use provided Lon
      "placeId": "${locationSet.locations[0].placeId || ''}", // Include Place ID if available
      "narration": "Detailed 150-300 word first-person narration for this specific location. Include: Welcome, sensory details (sights/sounds), brief history/significance, 1-2 interesting facts or hidden details, a connection to the theme '${locationSet.theme}', and a transition hint towards the next stop (if applicable). Make it engaging and informative.",
      "photos": [] // Placeholder for photos, will be populated later
    }
    // Repeat the location object structure for ALL locations provided in the list above.
    // Ensure the 'locationName', 'lat', 'lon', and 'placeId' fields accurately match the input for each location.
  ]
}

Constraints:
- Output ONLY the JSON object. No introductory text, explanations, or markdown formatting.
- The 'locations' array must contain an object for each location listed in the prompt, matching names, coords, and placeId.
- Keep narration concise (150-300 words per location).
`;

            generationPromises.push(
                (async (theme, locations, prompt) => { // IIFE for async/await within loop push
                    let retries = 0;
                    while (retries <= MAX_RETRIES) {
                        try {
                            console.log(`Attempt ${retries + 1} for theme: ${theme}`);
                            const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });

                            if (!result.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
                                throw new Error(`Invalid response structure from Gemini`);
                            }
                            const responseText = result.response.candidates[0].content.parts[0].text;
                            let experience = JSON.parse(responseText);

                            if (!experience?.title || !experience.description || !Array.isArray(experience.locations)) {
                                throw new Error(`Parsed JSON structure is invalid`);
                            }

                            // Enhance locations - IMPORTANT: Match generated back to input carefully
                            const enhancedLocations = await Promise.all(experience.locations.map(async (genLocation) => {
                                // Prioritize Place ID for matching, then name + proximity
                                const inputLocation = locations.find(inputLoc =>
                                    (genLocation.placeId && inputLoc.placeId && genLocation.placeId === inputLoc.placeId) ||
                                    (inputLoc.locationName.toLowerCase() === genLocation.locationName?.toLowerCase() && // Optional chaining for genLocation.locationName
                                    Math.abs(inputLoc.lat - genLocation.lat) < 0.001 &&
                                    Math.abs(inputLoc.lon - genLocation.lon) < 0.001)
                                );

                                if (!inputLocation) {
                                    console.warn(`Could not reliably match generated location "${genLocation.locationName}" back to input for theme ${theme}. Using generated data.`);
                                    const photos = genLocation.placeId ? await getLocationPhotos(genLocation.placeId) : [];
                                    return { ...genLocation, photos: photos || [] };
                                }

                                const photos = await getLocationPhotos(inputLocation.placeId);
                                return {
                                    locationName: inputLocation.locationName, // Use original name
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

                            console.log(`Successfully generated and processed experience for theme: ${theme}`);
                            return { ...experience, locations: enhancedLocations }; // Success

                        } catch (error) {
                            console.error(`Error processing generation for theme ${theme} (Attempt ${retries + 1}/${MAX_RETRIES + 1}):`, error.message);
                            retries++;
                            if (retries > MAX_RETRIES) {
                                console.error(`Max retries reached for theme ${theme}. Giving up.`);
                                return null; // Failure after retries
                            }
                            console.log(`Retrying theme ${theme} after ${RETRY_DELAY}ms...`);
                            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                        }
                    } // End retry loop
                })(locationSet.theme, locationSet.locations, themePrompt)
            ); // End push
        } // End loop through location sets

        const settledResults = await Promise.allSettled(generationPromises);
        settledResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                generatedExperiences.push(result.value);
            } // Failures/rejections already logged in the retry loop
        });

        console.log(`Finished generating experiences. Got ${generatedExperiences.length} successful results from ${diverseLocationSets.length} attempts.`);
        return generatedExperiences;

    } catch (error) {
        console.error("Overall experience generation process failed:", error);
        return [];
    }
};


// --- Rate Limiting ---
const rateLimiter = {
    // No changes from previous version
    requests: new Map(),
    limit: 60, windowMs: 60 * 1000, resetTimeouts: new Map(),
    check: function(ip) { /* ... logic ... */ }
};
const rateLimit = (req, res, next) => {
    // No changes from previous version
    const ip = req.ip || req.connection.remoteAddress;
    if (!rateLimiter.check(ip)) {
        console.warn(`Rate limit exceeded for IP: ${ip}`);
        return res.status(429).json({ error: "Too many requests, please try again later." });
    }
    next();
};


// --- User Preference Filtering & Scoring ---
const filterExperiencesForUser = (experiences, userLat, userLon, params = {}) => {
    // No changes from previous version
     if (!experiences || experiences.length === 0) return [];
    const locationUsageCount = new Map();
    experiences.forEach(exp => { exp.locations.forEach(loc => { if (loc.placeId) { locationUsageCount.set(loc.placeId, (locationUsageCount.get(loc.placeId) || 0) + 1); } }); });
    experiences.forEach(exp => {
        let score = 50;
        let validLocations = 0;
        exp.locations.forEach(loc => {
            if (loc.lat && loc.lon) {
                const distSq = Math.pow(loc.lat - userLat, 2) + Math.pow(loc.lon - userLon, 2);
                score += Math.max(0, 25 - (Math.sqrt(distSq) * 500));
                validLocations++;
            }
        });
        let locationOverlapPenalty = 0;
        exp.locations.forEach(loc => { if (loc.placeId) { const usage = locationUsageCount.get(loc.placeId) || 1; if (usage > 1) { locationOverlapPenalty += (usage - 1) * 5; } } });
        score -= locationOverlapPenalty;
        let avgRating = 0; let ratedLocations = 0;
        exp.locations.forEach(loc => { if (loc.rating && typeof loc.rating === 'number' && loc.rating >= 0) { avgRating += loc.rating; ratedLocations++; } });
        if (ratedLocations > 0) { avgRating /= ratedLocations; score += (avgRating - 3) * 5; }
        if(params.preferredCategories && Array.isArray(params.preferredCategories)) { /* ... preference matching ... */ }
        exp.relevanceScore = Math.max(0, Math.min(100, Math.round(score)));
    });
    return experiences.sort((a, b) => b.relevanceScore - a.relevanceScore);
};

// --- Database Interaction (Helper - unused) ---
const saveExperiencesToDatabase = async (experiencesData, isSeed = false, userId = null) => { /* ... */ };

// --- Utility Functions ---
async function isUrbanLocation(lat, lon) { /* ... */ }


// --- Main API Route (Updated Logic) ---

router.post("/", rateLimit, async (req, res) => {
  // No changes from previous version incorporating updates
  try {
    const { lat, lon, user_id, preferences } = req.body;
    if (lat === undefined || lon === undefined || !user_id) { return res.status(400).json({ error: "Latitude, longitude, and user_id are required." }); }
    const latitude = parseFloat(lat); const longitude = parseFloat(lon);
    if (isNaN(latitude) || isNaN(longitude)) { return res.status(400).json({ error: "Invalid latitude or longitude values." }); }
    let userPrefs = {}; if (preferences) { try { userPrefs = typeof preferences === 'string' ? JSON.parse(preferences) : preferences; } catch (e) { console.warn("Could not parse user preferences JSON:", preferences); } }
    const isUrban = await isUrbanLocation(latitude, longitude);
    const boxSizeLat = isUrban ? 0.07 : 0.15; const boxSizeLon = isUrban ? 0.1 : 0.2;
    const geoQueryBounds = { "location_center.lat": { $gte: latitude - boxSizeLat, $lte: latitude + boxSizeLat }, "location_center.lon": { $gte: longitude - boxSizeLon, $lte: longitude + boxSizeLon }, };

    // Step 1: Check user-specific
    const userSpecificExperiences = await Experience.find({ user_id: user_id, is_seed: false, ...geoQueryBounds }).limit(15).sort({ created_at: -1 });
    if (userSpecificExperiences.length > 0) { console.log(`[Step 1] Returning ${userSpecificExperiences.length} cached user-specific experiences for user ${user_id}`); return res.json({ experiences: userSpecificExperiences, source: "user_cache" }); }
    else { console.log(`[Step 1] No cached user-specific experiences found for user ${user_id}`); }

    // Step 2: Check seeds
    const existingUserSourceIds = []; // Empty as Step 1 returned nothing if here
    const seedExperiences = await Experience.find({ is_seed: true, ...geoQueryBounds, _id: { $nin: existingUserSourceIds } }).sort({ times_shown: 1 }).limit(40); // Increased limit
    console.log(`[Step 2] Found ${seedExperiences.length} potential seed experiences in the area.`);

    // Use seeds if >= 3 found
    if (seedExperiences.length >= 3) {
      console.log(`[Step 2] Sufficient seeds found (${seedExperiences.length}). Filtering and selecting...`);
      const filteredSeedExperiences = filterExperiencesForUser(seedExperiences, latitude, longitude, userPrefs);
      console.log(`[Step 2] Filtered seeds down to ${filteredSeedExperiences.length}.`);
      const selectedSeeds = filteredSeedExperiences.slice(0, 15); // Select up to 15

      if (selectedSeeds.length > 0) {
            console.log(`[Step 2] Selected ${selectedSeeds.length} seeds to clone for user ${user_id}.`);
            const seedIdsToUpdate = selectedSeeds.map(exp => exp._id);
            await Experience.updateMany({ _id: { $in: seedIdsToUpdate } }, { $inc: { times_shown: 1 } });
            const userClonesData = selectedSeeds.map(seed => ({
                 ...seed.toObject(), _id: undefined, user_id: user_id, is_seed: false,
                 source_experience_id: seed._id, created_at: new Date(), times_shown: 1, relevanceScore: undefined
            }));
            const savedUserClones = await Experience.insertMany(userClonesData);
            console.log(`[Step 2] Saved ${savedUserClones.length} user-specific clones.`);
            return res.json({ experiences: savedUserClones, source: "customized_from_seed" });
      } else { console.log("[Step 2] Filtering removed all seed candidates. Proceeding to generate new ones."); }
    } else { console.log(`[Step 2] Not enough suitable seeds found (${seedExperiences.length} < 3). Proceeding to generation.`); }

    // Step 3: Generate new
    console.log(`[Step 3] Generating new experiences for area near ${latitude}, ${longitude}`);
    console.log("[Step 3] Fetching nearby places...");
    const nearbyTouristAttractions = await getNearbyPlaces(latitude, longitude);
    const additionalAttractions = await searchForAdditionalAttractions(latitude, longitude);
    let allNearbyPlaces = [...nearbyTouristAttractions, ...additionalAttractions];
    const placeCountBeforeDedup = allNearbyPlaces.length;
    const uniqueNearbyPlaces = Array.from(new Map(allNearbyPlaces.map(item => [item.placeId || `${item.lat},${item.lon}`, item])).values());
    console.log(`[Step 3] Found ${placeCountBeforeDedup} places before deduplication, ${uniqueNearbyPlaces.length} unique nearby places after deduplication.`);
    if (uniqueNearbyPlaces.length < 2) { console.log("[Step 3] Not enough unique places found to generate tours."); return res.status(404).json({ message: "Not enough unique points of interest found nearby to generate tours." }); }

    const generatedExperiences = await fetchGeminiExperiences(uniqueNearbyPlaces, latitude, longitude);
    if (!Array.isArray(generatedExperiences) || generatedExperiences.length === 0) { console.error("[Step 3] Failed to generate any tour experiences from Gemini after retries."); return res.status(500).json({ error: "Failed to generate tour experiences. The AI might be unavailable or could not process the request." }); }
    console.log(`[Step 3] Successfully generated ${generatedExperiences.length} new experiences from Gemini.`);

    // Format and save as seeds
    const newSeedExperiencesData = generatedExperiences.map(exp => ({
      title: exp.title || "Generated Tour Experience", description: exp.description || "An exploration of local points of interest.",
      locations: exp.locations.map(loc => ({
        locationName: loc.locationName || "Unknown Location", lat: !isNaN(parseFloat(loc.lat)) ? parseFloat(loc.lat) : null, lon: !isNaN(parseFloat(loc.lon)) ? parseFloat(loc.lon) : null,
        placeId: loc.placeId || null, types: Array.isArray(loc.types) ? loc.types : [], rating: loc.rating || null, vicinity: loc.vicinity || null, photos: Array.isArray(loc.photos) ? loc.photos : [],
        narration: loc.narration || `Explore ${loc.locationName || 'this interesting place'}.`
      })).filter(loc => loc.lat !== null && loc.lon !== null),
      user_id: user_id, is_seed: true, times_shown: 0, created_at: new Date(),
      location_center: { lat: latitude, lon: longitude }, source_experience_id: null
    })).filter(exp => exp.locations.length >= 2);
    if (newSeedExperiencesData.length === 0) { console.error("[Step 3] Generated experiences were invalid or filtered out."); return res.status(500).json({ error: "Failed to generate valid tour experiences after processing." }); }

    const savedNewSeedExperiences = await Experience.insertMany(newSeedExperiencesData);
    console.log(`[Step 3] Saved ${savedNewSeedExperiences.length} new experiences as seeds.`);
    res.json({ experiences: savedNewSeedExperiences, source: "newly_generated" });

  } catch (error) {
    console.error("Unhandled error in POST /api/experiences:", error);
    if (error.name === 'ValidationError') { res.status(400).json({ error: "Data validation failed", details: error.message }); }
    else if (error.code === 11000) { res.status(409).json({ error: "Conflict creating resource", details: error.message }); }
    else { res.status(500).json({ error: "Internal server error while processing experiences", details: error.message }); }
  }
});

// --- Export Router ---
export default router;