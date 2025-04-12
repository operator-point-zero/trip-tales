import express from "express";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Experience from "../../models/experiences/Experience.js"; // Adjust path as needed

// --- Initialization ---
const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Caching ---
// Enhanced cache with categorization of attractions
const placesCache = {
  attractions: new Map(),
  additional_attractions: new Map(), // Added cache for the second type search
  getKey: (lat, lon, radius) => `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`,
  get: function(type, lat, lon, radius) {
    const key = this.getKey(lat, lon, radius);
    const data = this[type].get(key);
    // Optional: Could add timestamp check here if needed, but setTimeout handles expiration
    return data;
  },
  set: function(type, lat, lon, radius, data) {
    if (!this[type]) { // Ensure the map exists for the type
        console.warn(`Cache type "${type}" does not exist. Creating.`);
        this[type] = new Map();
    }
    const key = this.getKey(lat, lon, radius);
    this[type].set(key, data);
    // Set expiration (e.g., 1 hour)
    setTimeout(() => {
        console.log(`Cache expired and removed for key: ${key} (type: ${type})`);
        if (this[type]) { // Check if map still exists before deleting
            this[type].delete(key);
        }
    }, 60 * 60 * 1000); // 1 hour
    console.log(`Cache set for key: ${key} (type: ${type})`);
  }
};


// --- Geocoding and Place Details ---

// Get location name from coordinates using reverse geocoding
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

      // Return city, state/province, or country in that order of preference
      return (locality?.long_name || adminArea?.long_name || country?.long_name || 'this area');
    }

    return 'this area'; // Default if we can't determine location
  } catch (error) {
    console.error("Failed to get location name:", error.message);
    return 'this area';
  }
};

// Enhanced to fetch and categorize places (primarily tourist attractions)
const getNearbyPlaces = async (lat, lon, radius = 15000) => { // Default radius 15km
  const type = 'attractions'; // Using a generic type for cache
  try {
    // Check cache first
    const cachedData = placesCache.get(type, lat, lon, radius);
    if (cachedData) {
        console.log(`Cache hit for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}`);
        return cachedData;
    }
    console.log(`Cache miss for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}. Fetching from API...`);

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
    placesCache.set(type, lat, lon, radius, places);
    return places;
  } catch (error) {
    console.error("Failed to fetch nearby places:", error.message);
    return [];
  }
};

// Function to search for additional specific types of attractions
const searchForAdditionalAttractions = async (lat, lon, radius = 15000) => { // Radius 15km
  const type = 'additional_attractions'; // Specific cache type
  try {
     // Check cache first
    const cachedData = placesCache.get(type, lat, lon, radius);
    if (cachedData) {
        console.log(`Cache hit for additional attractions: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}`);
        return cachedData;
    }
    console.log(`Cache miss for additional attractions: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}. Fetching from API...`);

    // Perform a single search with multiple types to reduce API calls
    const searchTypes = "museum|park|church|mosque|temple|zoo|aquarium|art_gallery|landmark|historical_site"; // Consider adding more types if needed
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&keyword=${searchTypes}&key=${process.env.GOOGLE_PLACES_API_KEY}` // Using keyword might yield broader results than type= for multiple types
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
    placesCache.set(type, lat, lon, radius, attractions);
    return attractions;
  } catch (error) {
    console.error("Failed to fetch additional attractions:", error.message);
    return [];
  }
};


// Helper to get photos for a location using Place Details API
const getLocationPhotos = async (placeId) => {
  if (!placeId) return [];

  try {
    const detailsResponse = await axios.get(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );

    if (detailsResponse.data.result && detailsResponse.data.result.photos) {
        // Limit to max 3 photos
      return detailsResponse.data.result.photos.slice(0, 3).map(photo => {
        // Construct photo URL
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

// [Helper functions: categorizeAttractions, getWeightedRandomSelection, generateDiverseLocationSets, fetchGeminiExperiences remain largely the same as your provided version]
// Helper to categorize attractions by type
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
    // Use broader terms for historical/landmarks
    if (types.some(type => type.includes('historic') || type.includes('monument') || type.includes('castle'))) { categories.historical.push(place); categorized = true; }
    if (types.includes('neighborhood') || types.includes('sublocality')) { categories.neighborhoods.push(place); categorized = true; }
    if (types.includes('landmark') || types.includes('point_of_interest')) { categories.landmarks.push(place); categorized = true; }

    if (!categorized && !types.includes('tourist_attraction')) { // Avoid adding generic tourist spots to 'other' if already covered elsewhere
         categories.other.push(place);
    }
  });

  // De-duplicate across categories (keep first categorization) - simple approach
  const seenPlaceIds = new Set();
  for (const category in categories) {
      categories[category] = categories[category].filter(place => {
          if (seenPlaceIds.has(place.placeId)) {
              return false;
          }
           if (place.placeId) { // Only add if placeId exists for reliable deduplication
              seenPlaceIds.add(place.placeId);
           }
          return true;
      });
  }

  return categories;
};

// Function to get weighted random items from an array
const getWeightedRandomSelection = (items, count, weights = null) => {
  if (!items || items.length === 0) return [];
  const numToSelect = Math.min(count, items.length); // Select at most the number of available items
  if (items.length <= count) return [...items]; // Return all if count >= length

  const selected = [];
  const availableItems = [...items]; // Create a mutable copy
  let currentWeights = weights ? [...weights] : null; // Create a mutable copy of weights if provided

  for (let i = 0; i < numToSelect; i++) {
    let index;
    if (currentWeights && currentWeights.length === availableItems.length && currentWeights.length > 0) {
      const totalWeight = currentWeights.reduce((sum, w) => sum + w, 0);
       if (totalWeight <= 0) { // Handle case where all weights are zero or negative
           index = Math.floor(Math.random() * availableItems.length);
       } else {
            let random = Math.random() * totalWeight;
            for (index = 0; index < currentWeights.length; index++) {
                random -= currentWeights[index];
                if (random <= 0) break;
            }
            // Ensure index is within bounds in case of floating point issues
            index = Math.min(index, availableItems.length - 1);
       }
    } else {
      // Uniform random selection if weights are invalid or not provided
      index = Math.floor(Math.random() * availableItems.length);
    }

    selected.push(availableItems[index]);
    availableItems.splice(index, 1); // Remove selected item
    if (currentWeights) {
        currentWeights.splice(index, 1); // Remove corresponding weight
    }
  }

  return selected;
};

// Function to generate diverse location sets based on themes and proximity
const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 10, locationsPerSet = 4) => {
  if (!attractions || attractions.length === 0) return [];

  // Categorize all attractions
  const categorized = categorizeAttractions(attractions);

  // Calculate distance from user to each attraction (using simple squared Euclidean distance for weighting)
  attractions.forEach(place => {
    // Use a small epsilon to avoid division by zero if distance is exactly 0
    const epsilon = 0.0001;
    place.distanceSq = Math.pow(place.lat - userLat, 2) + Math.pow(place.lon - userLon, 2) + epsilon;
  });

  // Prepare diverse theme sets
  const themeSets = [
    ["Historical Highlights", ["historical", "landmarks", "museums"], 2],
    ["Arts & Culture", ["arts", "museums", "historical", "landmarks"], 2],
    ["Nature Escape", ["nature", "landmarks", "park"], 2], // Use 'park' singular
    ["Religious & Spiritual Sites", ["religious", "historical", "landmarks"], 2],
    ["Family Fun", ["entertainment", "nature", "landmarks", "zoo", "aquarium"], 2],
    ["Local Vibe & Shopping", ["neighborhoods", "shopping", "landmarks", "cafe"], 2], // Use singular 'cafe'
    ["Hidden Gems & Local Spots", ["other", "landmarks", "neighborhoods", "restaurant"], 2], // Use singular 'restaurant'
    ["Architectural Wonders", ["historical", "religious", "landmarks", "point_of_interest"], 2], // Use point_of_interest
    ["Scenic Views & Photo Ops", ["nature", "landmarks", "historical", "point_of_interest"], 2],
    ["Cultural Immersion", ["museums", "arts", "neighborhoods", "market"], 2] // Use singular 'market'
  ];

  const locationSets = [];
  const usedPlaceIdsInSession = new Set(); // Track places used across generated sets for more diversity

  for (let i = 0; i < numSets && i < themeSets.length; i++) {
    const [theme, categoriesToUse] = themeSets[i]; // minPerCategory not used currently

    // Gather available attractions for this theme
    let availableForTheme = [];
    categoriesToUse.forEach(category => {
        // Check if category exists and has places
        if (categorized[category] && categorized[category].length > 0) {
            // Filter out places already used in this generation session AND without a placeId
            const uniquePlacesInCategory = categorized[category].filter(p => p.placeId && !usedPlaceIdsInSession.has(p.placeId));
            availableForTheme = [...availableForTheme, ...uniquePlacesInCategory];
        } else if (categorized[category + 's'] && categorized[category + 's'].length > 0) { // Simple plural check
            const uniquePlacesInCategory = categorized[category + 's'].filter(p => p.placeId && !usedPlaceIdsInSession.has(p.placeId));
            availableForTheme = [...availableForTheme, ...uniquePlacesInCategory];
        }
    });


    // Remove duplicates within this theme's potential pool (if a place fits multiple categories)
    availableForTheme = Array.from(
      new Map(availableForTheme.map(item => [item.placeId, item])).values()
    );

    // Need at least 2 locations to make a tour
    if (availableForTheme.length < 2) continue;

    // Apply proximity weighting (closer places get higher weight)
    const weights = availableForTheme.map(place => 1 / place.distanceSq);

    // Get unique locations for this set using weighted random selection
    const selectedLocations = getWeightedRandomSelection(
      availableForTheme,
      locationsPerSet,
      weights
    );

    // If we got enough valid locations, add this set
    if (selectedLocations.length >= 2) { // Ensure at least 2 locations selected
      locationSets.push({
        theme,
        locations: selectedLocations
      });
      // Add selected place IDs to the set to avoid reusing them in the next theme set
      selectedLocations.forEach(loc => { if(loc.placeId) usedPlaceIdsInSession.add(loc.placeId) });
    }
  }

  // If still not enough sets, try a general "Best Of" category with less strict filtering
   if (locationSets.length < Math.min(numSets, 5) && attractions.length >= Math.max(2, locationsPerSet)) {
      console.log("Generating additional 'Best Of' sets due to low theme-specific results.");
      // Ensure places have placeIds for reliable tracking
      const allAvailable = attractions.filter(p => p.placeId && !usedPlaceIdsInSession.has(p.placeId));
       if(allAvailable.length >= 2) {
            const weights = allAvailable.map(place => 1 / place.distanceSq);
            const bestOfLocations = getWeightedRandomSelection(allAvailable, locationsPerSet, weights);
            if(bestOfLocations.length >= 2) {
                locationSets.push({ theme: "Best Of The Area", locations: bestOfLocations });
                bestOfLocations.forEach(loc => { if(loc.placeId) usedPlaceIdsInSession.add(loc.placeId) });
            }
       }
  }


  console.log(`Generated ${locationSets.length} diverse location sets.`);
  return locationSets;
};


// Modified to generate diverse experiences and fetch location photos
const fetchGeminiExperiences = async (nearbyPlaces, latitude, longitude) => {
  if (!nearbyPlaces || nearbyPlaces.length === 0) {
      console.error("fetchGeminiExperiences called with no nearby places.");
      return [];
  }
  try {
    const locationName = await getLocationNameFromCoordinates(latitude, longitude);
    console.log(`Generating experiences for: ${locationName} (lat: ${latitude}, lon: ${longitude})`);

    // Generate diverse location sets (aim for ~10 sets, 4 locations each)
    const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude, 10, 4);

    if (diverseLocationSets.length === 0) {
      console.error("Failed to generate any diverse location sets from nearby places.");
      // Fallback: Try generating one experience with the top N places?
      // Simple fallback: select top 4 rated/closest places if possible
      const fallbackPlaces = nearbyPlaces
        .filter(p => p.placeId) // Ensure fallback places have IDs
        .sort((a, b) => (b.rating || 0) - (a.rating || 0)) // Sort by rating
        .slice(0, 4);
      if (fallbackPlaces.length >= 2) {
          console.log("Using fallback selection of top places.");
          diverseLocationSets.push({ theme: `Highlights of ${locationName}`, locations: fallbackPlaces });
      } else {
          console.error("Fallback failed: Not enough places with placeIds found.");
          return []; // Cannot proceed if no sets and fallback fails
      }
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", // Ensure this model is available and suitable
       safetySettings: [ // Standard safety settings
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
      ],
      generationConfig: {
        temperature: 0.7, // Balances creativity and coherence
        topP: 0.9, // Consider adjusting topP as well
        topK: 40,
        maxOutputTokens: 8192, // Max output size
        responseMimeType: "application/json", // Request JSON output directly
      }
    });

    const generatedExperiences = [];
    const generationPromises = []; // Run generations in parallel

    console.log(`Attempting to generate experiences for ${diverseLocationSets.length} themes...`);

    for (let i = 0; i < diverseLocationSets.length; i++) {
      const locationSet = diverseLocationSets[i];

      if (!locationSet.locations || locationSet.locations.length < 2) {
          console.warn(`Skipping theme "${locationSet.theme}" due to insufficient locations (${locationSet.locations?.length || 0}).`);
          continue; // Skip sets with too few locations
      }

       // Ensure all locations in the set have necessary data (esp. placeId for matching/photos)
       const validLocationsForPrompt = locationSet.locations.filter(loc => loc && loc.locationName && loc.lat && loc.lon && loc.placeId);
       if (validLocationsForPrompt.length < 2) {
           console.warn(`Skipping theme "${locationSet.theme}" after filtering for valid location data.`);
           continue;
       }

      const locationListString = validLocationsForPrompt.map(loc => `- ${loc.locationName} (Place ID: ${loc.placeId})`).join('\n');

      // Construct the prompt carefully
      const themePrompt = `
You are an expert local tour guide creating a themed experience for ${locationName}.
The theme for this specific tour is: "${locationSet.theme}".

Focus *exclusively* on the following real locations provided:
${locationListString}

Generate a JSON object representing this single tour. The JSON object MUST strictly adhere to this structure:
{
  "title": "A captivating and theme-appropriate title for the '${locationSet.theme}' tour in ${locationName}",
  "description": "A concise (2-4 sentences) overall tour description. It should connect these specific locations under the theme '${locationSet.theme}' and mention the general area (${locationName}).",
  "locations": [
    // Create a JSON object like this for EACH location listed above. Maintain the order.
    {
      "locationName": "Full Name of Location 1", // EXACTLY as provided in the list above
      "lat": ${validLocationsForPrompt[0].lat}, // Copy EXACT latitude provided
      "lon": ${validLocationsForPrompt[0].lon}, // Copy EXACT longitude provided
      "placeId": "${validLocationsForPrompt[0].placeId}", // Copy EXACT placeId provided
      "narration": "Generate engaging, first-person narration (150-300 words) for this specific location. Include: A welcoming sentence, vivid sensory details (sights, sounds, smells if applicable), 1-2 key points about its history or significance, an interesting fact or hidden detail, a clear connection to the tour's theme ('${locationSet.theme}'), and optionally, a brief hint about transitioning to the next stop. Make it informative and immersive.",
      "photos": [] // Leave as an empty array. Photos will be added later.
    }
    // Repeat this structure accurately for ALL locations provided in the list above.
    // Ensure 'locationName', 'lat', 'lon', and 'placeId' fields are copied precisely from the input for each corresponding location.
  ]
}

IMPORTANT CONSTRAINTS:
- Output ONLY the raw JSON object. No introductory text, concluding remarks, markdown formatting (like \`\`\`json), or explanations.
- The 'locations' array MUST contain exactly one object for each location provided in the input list, in the same order.
- All fields ('title', 'description', 'locations', and fields within each location object) are required.
- 'lat', 'lon', and 'placeId' MUST be copied verbatim from the input for each location. Do not guess or omit them.
- Narration length should be respected (150-300 words per location).
`;

      // Add generation promise to the array
      generationPromises.push(
          model.generateContent({ contents: [{ role: "user", parts: [{ text: themePrompt }] }] })
            .then(async result => {
                // Robust check for response structure
                 if (!result?.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    // Log the problematic response if available
                    console.error(`Invalid response structure from Gemini for theme: ${locationSet.theme}. Response:`, JSON.stringify(result, null, 2));
                    throw new Error(`Invalid response structure from Gemini for theme: ${locationSet.theme}`);
                }
                const responseText = result.response.candidates[0].content.parts[0].text;

                // Attempt to parse the JSON response
                let experience;
                try {
                     // Basic cleanup: remove potential markdown backticks
                     const cleanedResponseText = responseText.trim().replace(/^```json\s*|\s*```$/g, '');
                     experience = JSON.parse(cleanedResponseText);
                } catch(parseError) {
                     console.error(`JSON parsing failed for theme ${locationSet.theme}. Raw response:`, responseText);
                     console.error(`Parse error: ${parseError.message}`);
                     throw new Error(`Failed to parse JSON response for theme ${locationSet.theme}: ${parseError.message}`);
                }


                // Validate basic structure
                 if (!experience || !experience.title || !experience.description || !Array.isArray(experience.locations) || experience.locations.length === 0) {
                    console.error("Parsed JSON is missing required fields or has empty locations array for theme:", locationSet.theme, experience);
                    throw new Error(`Parsed JSON structure is invalid for theme: ${locationSet.theme}`);
                }


                 // Enhance locations with data from nearbyPlaces and fetch photos
                 // Use the filtered 'validLocationsForPrompt' as the source of truth for matching
                const enhancedLocations = await Promise.all(experience.locations.map(async (genLocation, index) => {
                    // Match based on placeId primarily, falling back to index if placeId missing/mismatched (less ideal)
                    const inputLocation = validLocationsForPrompt.find(inputLoc => inputLoc.placeId === genLocation.placeId) || validLocationsForPrompt[index]; // Fallback to index

                    if (!inputLocation || inputLocation.placeId !== genLocation.placeId) {
                        console.warn(`Mismatch or failed lookup for generated location "${genLocation.locationName}" (PlaceID: ${genLocation.placeId}) in theme ${locationSet.theme}. Using original input data at index ${index} for safety.`);
                         // Use the input location data directly if matching failed
                         const photos = await getLocationPhotos(validLocationsForPrompt[index]?.placeId);
                         return {
                             locationName: validLocationsForPrompt[index]?.locationName || genLocation.locationName, // Prefer input name
                             lat: validLocationsForPrompt[index]?.lat || genLocation.lat,
                             lon: validLocationsForPrompt[index]?.lon || genLocation.lon,
                             placeId: validLocationsForPrompt[index]?.placeId || genLocation.placeId, // Prefer input placeId
                             types: validLocationsForPrompt[index]?.types || [],
                             rating: validLocationsForPrompt[index]?.rating || null,
                             vicinity: validLocationsForPrompt[index]?.vicinity || null,
                             narration: genLocation.narration || `Welcome to ${validLocationsForPrompt[index]?.locationName || genLocation.locationName}.`,
                             photos: photos || []
                         };
                    }

                    // Fetch photos using the reliable placeId from the matched input
                    const photos = await getLocationPhotos(inputLocation.placeId);

                    // Return merged data, prioritizing input data for accuracy but using generated narration
                    return {
                        locationName: inputLocation.locationName, // Use original name
                        lat: inputLocation.lat,                 // Use original lat
                        lon: inputLocation.lon,                 // Use original lon
                        placeId: inputLocation.placeId,         // Use original placeId
                        types: inputLocation.types || [],       // Add types from input
                        rating: inputLocation.rating || "N/A",   // Add rating from input
                        vicinity: inputLocation.vicinity || null, // Add vicinity from input
                        narration: genLocation.narration || `Welcome to ${inputLocation.locationName}.`, // Use generated narration
                        photos: photos || []                     // Add fetched photos
                    };
                }));

                // Add the fully processed experience IF it has locations
                if (enhancedLocations.length > 0) {
                    generatedExperiences.push({
                        ...experience,
                        locations: enhancedLocations
                    });
                    console.log(`Successfully generated and processed experience for theme: ${locationSet.theme}`);
                } else {
                     console.warn(`Skipping experience for theme ${locationSet.theme} as no valid locations remained after processing.`);
                }


            })
            .catch(error => {
                 // Log specific errors related to generation/processing for this theme
                console.error(`Error processing generation promise for theme "${locationSet?.theme || 'Unknown'}":`, error.message);
                 if (error.message.includes("response structure from Gemini")) {
                     // Potentially log more details or handle differently if it's a known Gemini issue
                 }
                 // Don't push anything if an error occurred for this theme
            })
      );
    }

    // Wait for all generation promises to settle (resolve or reject)
    await Promise.allSettled(generationPromises);

    console.log(`Finished Gemini generation process. Got ${generatedExperiences.length} successful results.`);
    return generatedExperiences; // Return array of successfully generated experiences

  } catch (error) {
    // Catch errors in the overall setup/preparation (e.g., getting location name, model init)
    console.error("Gemini API request preparation or overall processing failed:", error);
    // Check for specific error types if needed (e.g., API key issues, quota limits)
     if (error.response) {
        // Log API error details if available
        console.error('API Error Data:', error.response.data);
        console.error('API Error Status:', error.response.status);
    }
    return []; // Return empty array on failure
  }
};


// --- Rate Limiting ---
// [Rate Limiting code remains the same]
const rateLimiter = {
  requests: new Map(),
  limit: 60, // Max requests per window
  windowMs: 60 * 1000, // 1 minute window
  resetTimeouts: new Map(), // Track timeouts for resetting counts

  check: function(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Clean up old entries occasionally (optional, helps manage memory)
    if (Math.random() < 0.01) { // ~1% chance per request
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

    // If expired or first request
    if (!requestData || requestData.firstRequestTimestamp < windowStart) {
      requestData = { count: 1, firstRequestTimestamp: now };
      this.requests.set(ip, requestData);

      // Clear the timeout if one exists, and set a new one
      const existingTimeout = this.resetTimeouts.get(ip);
      if (existingTimeout) clearTimeout(existingTimeout);

      const timeoutId = setTimeout(() => {
          this.requests.delete(ip);
          this.resetTimeouts.delete(ip);
          // console.log(`Rate limit reset for IP: ${ip}`);
      }, this.windowMs);
      this.resetTimeouts.set(ip, timeoutId);

      return true;
    }

    // Within window, check count
    if (requestData.count < this.limit) {
      requestData.count++;
      return true;
    }

    // Limit exceeded
    return false;
  }
};
// Rate limiting middleware function
const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0].trim(); // Get client IP robustly
  if (!ip) {
      console.warn("Could not determine client IP for rate limiting.");
      return next(); // Allow request if IP cannot be determined
  }
  if (!rateLimiter.check(ip)) {
    console.warn(`Rate limit exceeded for IP: ${ip}`);
    // Optionally set Retry-After header: res.set('Retry-After', rateLimiter.windowMs / 1000);
    return res.status(429).json({ error: "Too many requests, please try again later." });
  }
  next();
};


// --- User Preference Filtering & Scoring ---
// [filterExperiencesForUser function remains the same]
const filterExperiencesForUser = (experiences, userLat, userLon, params = {}) => {
   if (!experiences || experiences.length === 0) return [];

  // Calculate diversity score based on how many experiences share the *exact same locations* (using placeId)
  const locationUsageCount = new Map(); // Map<placeId, count>
  experiences.forEach(exp => {
    // Ensure locations array exists and is an array
     if (Array.isArray(exp.locations)) {
        exp.locations.forEach(loc => {
            if (loc && loc.placeId) { // Check if loc and loc.placeId exist
                locationUsageCount.set(loc.placeId, (locationUsageCount.get(loc.placeId) || 0) + 1);
            }
        });
     }
  });

  // Score experiences
  experiences.forEach(exp => {
    // Ensure experience object is valid and has locations array
    if (!exp || !Array.isArray(exp.locations)) {
        exp.relevanceScore = 0; // Assign low score if data is malformed
        return; // Skip scoring for invalid experience structure
    }

    let score = 50; // Base score

    // 1. Proximity Score (Average distance to user)
    let totalDistanceSq = 0;
    let validLocations = 0;
    exp.locations.forEach(loc => {
      if (loc && loc.lat != null && loc.lon != null) { // Check for non-null lat/lon
          // Simple Euclidean distance (squared, good enough for comparison)
         const distSq = Math.pow(loc.lat - userLat, 2) + Math.pow(loc.lon - userLon, 2);
         totalDistanceSq += distSq;
         validLocations++;
      }
    });
     if (validLocations > 0) {
         const avgDistSq = totalDistanceSq / validLocations;
         // Penalize distance - closer is better. Scale appropriately.
         // Example scaling: score decreases as distance increases. Max bonus ~25 for very close.
         // Using sqrt is more intuitive for distance relation. Adjust multiplier as needed.
         // Lower score multiplier makes distance less impactful.
         score += Math.max(0, 25 - (Math.sqrt(avgDistSq) * 1000)); // Adjusted multiplier
     } else {
         score -= 10; // Penalize if no valid locations for proximity check
     }


    // 2. Diversity Score (Penalize using overused locations)
    let locationOverlapPenalty = 0;
    exp.locations.forEach(loc => {
      if (loc && loc.placeId) {
        const usage = locationUsageCount.get(loc.placeId) || 1;
        // Penalize more if a location is used in many experiences being considered
        if (usage > 1) {
            locationOverlapPenalty += (usage - 1) * 3; // Adjusted penalty multiplier
        }
      }
    });
    score -= locationOverlapPenalty;

    // 3. Rating Score (Bonus for highly-rated locations) - Optional
    let avgRating = 0;
    let ratedLocations = 0;
     exp.locations.forEach(loc => {
         if (loc && loc.rating && typeof loc.rating === 'number' && loc.rating >= 0) {
             avgRating += loc.rating;
             ratedLocations++;
         }
     });
     if (ratedLocations > 0) {
         avgRating /= ratedLocations;
         score += (avgRating - 3) * 4; // Bonus for ratings > 3, penalty < 3. Adjusted scale.
     }


     // 4. Apply preference matching score (basic example)
     if(params.preferredCategories && Array.isArray(params.preferredCategories) && params.preferredCategories.length > 0) {
         let matchScore = 0;
         let maxPossibleMatchScore = 0;
         exp.locations.forEach(loc => {
             maxPossibleMatchScore += 5; // Increment max possible score for each location
             if(loc && loc.types && Array.isArray(loc.types)) {
                 if(loc.types.some(type => params.preferredCategories.includes(type))) {
                     matchScore += 5; // Add points for each location matching a preferred category
                 }
             }
         });
         // Normalize preference score slightly (e.g., max 20 points)
         if (maxPossibleMatchScore > 0) {
            score += Math.min(20, (matchScore / maxPossibleMatchScore) * 20);
         }
     }


    // Ensure score is within a reasonable range (e.g., 0-100)
    exp.relevanceScore = Math.max(0, Math.min(100, Math.round(score)));
  });

  // Sort by relevance score (descending)
  return experiences.sort((a, b) => b.relevanceScore - a.relevanceScore);
};


// --- Database Interaction (Helper - currently unused directly in route) ---
// [saveExperiencesToDatabase helper remains the same, can be used for seeding]
const saveExperiencesToDatabase = async (experiencesData, isSeed = false, userId = null) => {
  if (!experiencesData || experiencesData.length === 0) return [];

  const experiencesToSave = experiencesData.map(exp => {
      // Basic validation before attempting to save
      if (!exp || !exp.title || !Array.isArray(exp.locations)) {
          console.warn("Skipping invalid experience data during save:", exp);
          return null; // Mark for removal
      }
      // Ensure location_center is calculated if not present
      let location_center = exp.location_center;
      if (!location_center && exp.locations.length > 0) {
          let avgLat = 0, avgLon = 0;
          exp.locations.forEach(loc => { avgLat += loc.lat; avgLon += loc.lon; });
          avgLat /= exp.locations.length;
          avgLon /= exp.locations.length;
          location_center = { type: 'Point', coordinates: [avgLon, avgLat] };
      }

      return {
          title: exp.title,
          description: exp.description,
          locations: exp.locations, // Assume locations are already structured correctly
          location_center: location_center, // Use calculated or existing center
          user_id: isSeed ? null : userId, // User ID only for non-seeds
          is_seed: isSeed,
          times_shown: 0,
          created_at: new Date(),
          preferences_used: exp.preferences_used || null, // Include preferences if available
          relevanceScore: exp.relevanceScore || 50 // Default score if needed
      };
  }).filter(exp => exp !== null); // Remove null entries

  if (experiencesToSave.length === 0) {
      console.log("No valid experiences to save to DB.");
      return [];
  }

  try {
    const savedExperiences = await Experience.insertMany(experiencesToSave, { ordered: false });
    console.log(`Attempted to save ${experiencesToSave.length} experiences. Saved ${savedExperiences.length} to DB. isSeed: ${isSeed}`);
    return savedExperiences;
  } catch (error) {
    console.error(`Error saving experiences to DB (isSeed: ${isSeed}):`, error);
    // Log specifics if it's a bulk write error
    if (error.writeErrors) {
        error.writeErrors.forEach(err => console.error(`Write Error Detail: Index=${err.index}, Code=${err.code}, Msg=${err.errmsg}`));
    }
    // Depending on the error, you might get partial saves.
    // Returning an empty array indicates failure, but some might have been saved.
    return [];
  }
};


// --- Utility Functions ---
// [isUrbanLocation function remains the same]
async function isUrbanLocation(lat, lon) {
  try {
    // Use a small radius for density check
    const radius = 500; // 500 meters
    // Use a broader type query for density
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&rankby=prominence&key=${process.env.GOOGLE_PLACES_API_KEY}` // Rank by prominence might be better than type=establishment
    );

    // Adjust threshold based on typical results for your target areas
    const isUrban = response.data.results.length > 20; // Increased threshold slightly
    console.log(`Location ${lat},${lon} density check: ${response.data.results.length} prominent places nearby. isUrban: ${isUrban}`);
    return isUrban;
  } catch (error) {
    console.error("Error determining location type (urban/rural):", error.message);
    return false; // Default to non-urban on error
  }
}


// --- Main API Route ---

// POST /api/experiences - Main route to fetch or generate experiences
router.post("/", rateLimit, async (req, res) => {
  try {
    const { lat, lon, user_id, preferences = {} } = req.body; // Get lat, lon, user_id, and optional preferences

    // --- Input Validation ---
    if (lat === undefined || lon === undefined || isNaN(parseFloat(lat)) || isNaN(parseFloat(lon))) {
      return res.status(400).json({ error: "Valid Latitude (lat) and Longitude (lon) are required." });
    }
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lon);

    // Validate coordinate range
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: "Invalid latitude or longitude range." });
    }


    // Define search radius (e.g., 15km). Consistent radius is important for cache/DB checks.
    const searchRadius = 15000; // meters
    const radiusInRadians = searchRadius / 6378100; // Approx Earth radius in meters for MongoDB $centerSphere

    console.log(`Request received for lat: ${latitude}, lon: ${longitude}, radius: ${searchRadius}m`);

    // --- MODIFIED DATABASE CHECK (Approach 2) ---
    // 1. Check DB for ANY existing experiences nearby (seeded or generated)
    console.log("Checking database for existing experiences...");
    let nearbyExperiences = [];
    try {
        nearbyExperiences = await Experience.find({
          location_center: { // Assumes GeoJSON Point field 'location_center'
            $geoWithin: {
              // Use longitude first for MongoDB GeoJSON points [lng, lat]
              $centerSphere: [[longitude, latitude], radiusInRadians]
            }
          }
          // No 'is_seed' filter here - find all types
        })
          // Sort to prioritize: Seeds first, then less shown experiences
          .sort({ is_seed: -1, times_shown: 1 })
          .limit(30) // Fetch slightly more initially to allow for better filtering
          .lean(); // Use .lean() for faster read-only queries when full Mongoose docs aren't needed
    } catch (dbError) {
        console.error("Database error during initial experience fetch:", dbError);
        // Decide how to proceed. Maybe attempt generation? Or return error?
        // For now, log error and attempt generation as if none were found.
        nearbyExperiences = [];
    }
    // --- END OF MODIFICATION ---


    if (nearbyExperiences.length > 0) {
      // 2a. Found existing experiences - Filter, Score, and Return them
      console.log(`Found ${nearbyExperiences.length} existing experiences potentially matching the area.`);

      // Filter/score based on user location and potentially preferences
      // Pass latitude, longitude instead of lat, lon
      const filteredExperiences = filterExperiencesForUser(nearbyExperiences, latitude, longitude, preferences);

      // Limit the number of returned experiences (e.g., top 10 relevant)
      const experiencesToReturn = filteredExperiences.slice(0, 10);

      // Increment 'times_shown' for the returned experiences (async, don't wait)
      // Make sure experiencesToReturn contains valid _id fields
       if (experiencesToReturn.length > 0) {
           const experienceIds = experiencesToReturn.map(exp => exp._id).filter(id => id); // Filter out any potentially undefined IDs
           if (experienceIds.length > 0) {
               Experience.updateMany(
                 { _id: { $in: experienceIds } },
                 { $inc: { times_shown: 1 } }
               ).catch(err => console.error("Error updating times_shown:", err)); // Log error but don't block response
           }
       }


       console.log(`Returning ${experiencesToReturn.length} filtered existing experiences.`);
       return res.json(experiencesToReturn); // Use return here

    } else {
      // 2b. No suitable existing experiences found - Generate new ones
      console.log(`No existing experiences found for lat: ${latitude}, lon: ${longitude}. Proceeding to generate...`);

      // 3. Fetch nearby places using Google Places API (with caching)
      // Pass numerical latitude, longitude
      const nearbyTouristAttractions = await getNearbyPlaces(latitude, longitude, searchRadius);
      const additionalAttractions = await searchForAdditionalAttractions(latitude, longitude, searchRadius); // Fetch specific types

       // Combine and deduplicate places based on placeId
      const combinedPlaces = [...nearbyTouristAttractions, ...additionalAttractions];
      const uniqueNearbyPlaces = Array.from(
          new Map(combinedPlaces.filter(p => p.placeId).map(item => [item.placeId, item])).values() // Ensure placeId exists for deduplication
      );

      console.log(`Found ${uniqueNearbyPlaces.length} unique nearby places with Place IDs.`);


      if (uniqueNearbyPlaces.length < 2) { // Need at least 2 places for a tour
         console.log("Not enough unique nearby places found (minimum 2 required) to generate diverse experiences.");
        return res.json([]); // Return empty array if not enough data
      }

      // 4. Generate experiences using Gemini (using diverse sets)
      // Pass numerical latitude, longitude
      const generatedExperiences = await fetchGeminiExperiences(uniqueNearbyPlaces, latitude, longitude);

       if (!generatedExperiences || generatedExperiences.length === 0) {
           console.log("Gemini generation yielded no valid experiences.");
           return res.json([]);
       }
       console.log(`Successfully generated ${generatedExperiences.length} new experiences from Gemini.`);

      // 5. Prepare newly generated experiences for saving (marked as is_seed: false)
      const experiencesToSave = generatedExperiences.map(exp => {
        // Calculate center point for this specific experience
        let avgLat = latitude, avgLon = longitude; // Default to request lat/lon
         if (exp.locations && exp.locations.length > 0) {
             let totalLat = 0, totalLon = 0;
             exp.locations.forEach(loc => { totalLat += loc.lat; totalLon += loc.lon; });
             avgLat = totalLat / exp.locations.length;
             avgLon = totalLon / exp.locations.length;
         }

        return {
          ...exp, // Spread the generated content (title, desc, locations array)
          location_center: { type: 'Point', coordinates: [avgLon, avgLat] }, // GeoJSON Point [lng, lat]
          user_id: user_id || null, // Link to user if provided
          is_seed: false, // IMPORTANT: Mark generated experiences as non-seed
          times_shown: 0, // Initial value
          created_at: new Date(),
          preferences_used: preferences // Store preferences used for generation
        };
      }).filter(exp => exp && exp.title && Array.isArray(exp.locations) && exp.locations.length > 0); // Basic validation filter


       if (experiencesToSave.length === 0) {
           console.log("No valid generated experiences to save after mapping/filtering.");
           return res.json([]);
       }

       // 6. Save the valid generated experiences to DB
       let savedExperiences = [];
       try {
           savedExperiences = await Experience.insertMany(experiencesToSave, { ordered: false }); // ordered: false - attempts to insert all
           console.log(`Attempted to save ${experiencesToSave.length}. Successfully saved ${savedExperiences.length} new experiences to the database.`);
       } catch (dbError) {
            console.error("Error inserting generated experiences:", dbError);
            if (dbError.writeErrors) {
                dbError.writeErrors.forEach(err => console.error(`Write Error Detail: Index=${err.index}, Code=${err.code}, Msg=${err.errmsg}`));
            }
            // It's possible some documents were inserted even if others failed with ordered: false
            // We might proceed with whatever was potentially saved, or return error/empty
            // For simplicity, let's continue, but acknowledge potential partial save.
            // Re-fetch based on titles/centers could confirm, but adds complexity.
            console.warn("Proceeding after DB insert error, potentially with partially saved data.");
            // It might be safer to return empty or an error here:
            // return res.status(500).json({ error: "Failed to save generated experiences." });
       }


      // 7. Filter/Score the *newly generated* (and potentially saved) experiences for the current user
      // Use experiencesToSave which contains the objects intended for saving/filtering
      const filteredGeneratedExperiences = filterExperiencesForUser(experiencesToSave, latitude, longitude, preferences);

      // Limit the number returned
      const experiencesToReturn = filteredGeneratedExperiences.slice(0, 10);

      // Increment times_shown for the returned newly generated ones (already handled by filter/return logic)
      // They start at 0 and are being shown now.

       console.log(`Returning ${experiencesToReturn.length} newly generated and filtered experiences.`);
       return res.json(experiencesToReturn); // Use return here
    }

  } catch (error) {
    console.error("--- Unhandled Error in /api/experiences ---");
    console.error("Timestamp:", new Date().toISOString());
    console.error("Error Message:", error.message);
    console.error("Error Stack:", error.stack);
     if (error.response) { // Log axios error details if available
        console.error('Axios Error Data:', error.response.data);
        console.error('Axios Error Status:', error.response.status);
        console.error('Axios Error Headers:', error.response.headers);
    } else if (error.request) { // Log if request was made but no response received
        console.error('Axios Error Request:', error.request);
    }
    // Avoid sending detailed internal errors to the client in production
    res.status(500).json({ error: "An internal server error occurred. Please try again later." });
  }
});

export default router; // Make sure this is how you export in your setup