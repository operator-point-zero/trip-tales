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
  getKey: (lat, lon, radius) => `${lat.toFixed(4)},${lon.toFixed(4)},${radius}`,
  get: function(type, lat, lon, radius) {
    const key = this.getKey(lat, lon, radius);
    return this[type].get(key);
  },
  set: function(type, lat, lon, radius, data) {
    const key = this.getKey(lat, lon, radius);
    this[type].set(key, data);
    // Set expiration (e.g., 1 hour)
    setTimeout(() => {
      console.log(`Cache expired and removed for key: ${key}`);
      this[type].delete(key);
    }, 60 * 60 * 1000);
    console.log(`Cache set for key: ${key}`);
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
const getNearbyPlaces = async (lat, lon, radius = 7500) => { // Increased default radius to 7.5km
  const type = 'attractions'; // Using a generic type for cache
  try {
    // Check cache first
    const cachedData = placesCache.get(type, lat, lon, radius);
    if (cachedData) {
      console.log(`Cache hit for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}`);
      return cachedData;
    }
    console.log(`Cache miss for nearby places: ${lat.toFixed(4)},${lon.toFixed(4)},${radius}. Fetching from API...`);

    // Include more relevant types in the initial search
    const searchTypes = "tourist_attraction|museum|park|point_of_interest|landmark";
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=${searchTypes}&key=${process.env.GOOGLE_PLACES_API_KEY}`
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
    const searchTypes = "museum|park|church|mosque|temple|zoo|aquarium|art_gallery|landmark|historical_site|amusement_park|natural_feature"; // Added more types
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=${searchTypes}&key=${process.env.GOOGLE_PLACES_API_KEY}`
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

    if (!categorized) { categories.other.push(place); }
  });

  // De-duplicate across categories (keep first categorization) - simple approach
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
const generateDiverseLocationSets = (attractions, userLat, userLon, numSets = 12, locationsPerSet = 4) => { // Increased numSets
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
    ["Nature Escape", ["nature", "landmarks", "parks"], 2], // Added parks
    ["Religious & Spiritual Sites", ["religious", "historical", "landmarks"], 2],
    ["Family Fun", ["entertainment", "nature", "landmarks", "zoo", "aquarium"], 2],
    ["Local Vibe & Shopping", ["neighborhoods", "shopping", "landmarks", "cafe"], 2], // Added cafe
    ["Hidden Gems & Local Spots", ["other", "landmarks", "neighborhoods", "restaurant"], 2], // Added restaurant
    ["Architectural Wonders", ["historical", "religious", "landmarks", "modern_architecture"], 2], // Added example
    ["Scenic Views & Photo Ops", ["nature", "landmarks", "historical", "viewpoint"], 2], // Added viewpoint
    ["Cultural Immersion", ["museums", "arts", "neighborhoods", "market"], 2], // Added market
    ["Adventure Time", ["nature", "entertainment", "landmark"], 2], // Added new theme
    ["Relaxing Getaway", ["nature", "park", "landmark"], 2] // Added new theme
  ];

  const locationSets = [];
  const usedPlaceIdsInSession = new Set(); // Track places used across generated sets for more diversity

  for (let i = 0; i < numSets && i < themeSets.length; i++) {
    const [theme, categoriesToUse] = themeSets[i]; // minPerCategory not used currently, simplifying

    // Gather available attractions for this theme
    let availableForTheme = [];
    categoriesToUse.forEach(category => {
      if (categorized[category] && categorized[category].length > 0) {
        // Filter out places already used in this generation session
        const uniquePlacesInCategory = categorized[category].filter(p => !usedPlaceIdsInSession.has(p.placeId));
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
      selectedLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
    }
  }

  // If still not enough sets, try a general "Best Of" category with less strict filtering
  if (locationSets.length < Math.min(numSets, 5) && attractions.length >= locationsPerSet) {
    console.log("Generating additional 'Best Of' sets due to low theme-specific results.");
    const allAvailable = attractions.filter(p => !usedPlaceIdsInSession.has(p.placeId));
    if (allAvailable.length >= 2) {
      const weights = allAvailable.map(place => 1 / place.distanceSq);
      const bestOfLocations = getWeightedRandomSelection(allAvailable, locationsPerSet, weights);
      if (bestOfLocations.length >= 2) {
        locationSets.push({ theme: "Best Of The Area", locations: bestOfLocations });
        bestOfLocations.forEach(loc => usedPlaceIdsInSession.add(loc.placeId));
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
    console.log(`Generating experiences for: ${locationName}`);

    // Generate diverse location sets (aim for ~12 sets, 4 locations each) - Increased target
    const diverseLocationSets = generateDiverseLocationSets(nearbyPlaces, latitude, longitude, 12, 4);

    if (diverseLocationSets.length === 0) {
      console.error("Failed to generate any diverse location sets from nearby places.");
      // Fallback: Try generating one experience with the top N places?
      // Simple fallback: select top 4 rated/closest places if possible
      const fallbackPlaces = nearbyPlaces.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 4);
      if (fallbackPlaces.length >= 2) {
        console.log("Using fallback selection of top places.");
        diverseLocationSets.push({ theme: `Highlights of ${locationName}`, locations: fallbackPlaces });
      } else {
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

    for (let i = 0; i < diverseLocationSets.length; i++) {
      const locationSet = diverseLocationSets[i];

      if (!locationSet.locations || locationSet.locations.length < 2) continue; // Skip sets with too few locations

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
      "locationName": "Full Name of Location 1", // Match the name provided above
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
- The 'locations' array must contain an object for each location listed in the prompt.
- Ensure 'lat', 'lon', and 'placeId' are correctly copied from the input for each location.
- Keep narration concise (150-300 words per location).
`;

      // Add generation promise to the array
      generationPromises.push(
        model.generateContent({ contents: [{ role: "user", parts: [{ text: themePrompt }] }] })
          .then(async result => {
            if (!result.response || !result.response.candidates || !result.response.candidates[0].content || !result.response.candidates[0].content.parts || !result.response.candidates[0].content.parts[0].text) {
              throw new Error(`Invalid response structure from Gemini for theme: ${locationSet.theme}`);
            }
            const responseText = result.response.candidates[0].content.parts[0].text;

            // Attempt to parse the JSON response
            let experience;
            try {
              experience = JSON.parse(responseText);
            } catch (parseError) {
              console.error(`JSON parsing failed for theme ${locationSet.theme}. Raw response:`, responseText);
              throw new Error(`Failed to parse JSON response for theme ${locationSet.theme}: ${parseError.message}`);
            }


            // Validate basic structure
            if (!experience || !experience.title || !experience.description || !Array.isArray(experience.locations)) {
              console.error("Parsed JSON is missing required fields for theme:", locationSet.theme, experience);
              throw new Error(`Parsed JSON structure is invalid for theme: ${locationSet.theme}`);
            }


            // Enhance locations with data from nearbyPlaces and fetch photos
            const enhancedLocations = await Promise.all(experience.locations.map(async (genLocation) => {
              // Find the corresponding input location more reliably using placeId or name/coords
              const inputLocation = locationSet.locations.find(inputLoc =>
                (genLocation.placeId && inputLoc.placeId === genLocation.placeId) ||
                (inputLoc.locationName.toLowerCase() === genLocation.locationName.toLowerCase() &&
                  Math.abs(inputLoc.lat - genLocation.lat) < 0.001 && // Tolerance for float comparison
                  Math.abs(inputLoc.lon - genLocation.lon) < 0.001)
              );

              if (!inputLocation) {
                console.warn(`Could not reliably match generated location "${genLocation.locationName}" back to input for theme ${locationSet.theme}. Using generated data.`);
                // Attempt to fetch photos using the placeId from the generated data if available
                const photos = genLocation.placeId ? await getLocationPhotos(genLocation.placeId) : [];
                return { ...genLocation, photos: photos || [] };
              }

              // Fetch photos using the reliable placeId from the input
              const photos = await getLocationPhotos(inputLocation.placeId);

              // Return merged data, prioritizing input data for accuracy
              return {
                locationName: inputLocation.locationName, // Use original name
                lat: inputLocation.lat,                 // Use original lat
                lon: inputLocation.lon,                 // Use original lon
                placeId: inputLocation.placeId,         // Use original placeId
                types: inputLocation.types || [],       // Add types from input
                rating: inputLocation.rating || null,   // Add rating from input
                vicinity: inputLocation.vicinity || null, // Add vicinity from input
                narration: genLocation.narration || `Welcome to ${inputLocation.locationName}.`, // Use generated narration
                photos: photos || []                     // Add fetched photos
              };
            }));

            // Add the fully processed experience
            generatedExperiences.push({
              ...experience,
              locations: enhancedLocations
            });
            console.log(`Successfully generated and processed experience for theme: ${locationSet.theme}`);

          })
          .catch(error => {
            console.error(`Error processing generation for theme ${locationSet.theme}:`, error.message);
            // Don't push anything if an error occurred for this theme
          })
      );
    }

    // Wait for all generation promises to settle
    await Promise.allSettled(generationPromises);

    console.log(`Finished generating experiences. Got ${generatedExperiences.length} successful results.`);
    return generatedExperiences;

  } catch (error) {
    console.error("Gemini API request preparation or overall processing failed:", error);
    // Check for specific error types if needed (e.g., API key issues, quota limits)
    return []; // Return empty array on failure
  }
};


// --- Rate Limiting ---
// Implement rate limiting middleware (simple in-memory version)
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
  const ip = req.ip || req.connection.remoteAddress; // Get client IP
  if (!rateLimiter.check(ip)) {
    console.warn(`Rate limit exceeded for IP: ${ip}`);
    // Optionally set Retry-After header: res.set('Retry-After', rateLimiter.windowMs / 1000);
    return res.status(429).json({ error: "Too many requests, please try again later." });
  }
  next();
};


// --- User Preference Filtering & Scoring ---

// Helper to filter/score experiences based on user proximity and diversity
// (Note: User preferences 'params' are not fully utilized in this version)
const filterExperiencesForUser = (experiences, userLat, userLon, params = {}) => {
  if (!experiences || experiences.length === 0) return [];

  // Calculate diversity score based on how many experiences share the *exact same locations* (using placeId)
  const locationUsageCount = new Map(); // Map<placeId, count>
  experiences.forEach(exp => {
    exp.locations.forEach(loc => {
      if (loc.placeId) {
        locationUsageCount.set(loc.placeId, (locationUsageCount.get(loc.placeId) || 0) + 1);
      }
    });
  });

  // Score experiences
  experiences.forEach(exp => {
    let score = 50; // Base score

    // 1. Proximity Score (Average distance to user)
    let totalDistance = 0;
    let validLocations = 0;
    exp.locations.forEach(loc => {
      if (loc.lat && loc.lon) {
        // Simple Euclidean distance (squared, good enough for comparison)
        const distSq = Math.pow(loc.lat - userLat, 2) + Math.pow(loc.lon - userLon, 2);
        // Penalize distance - closer is better. Scale appropriately.
        // Example scaling: score decreases as distance increases. Max bonus ~25 for very close.
        score += Math.max(0, 25 - (Math.sqrt(distSq) * 500)); // Adjust multiplier as needed
        validLocations++;
      }
    });
    // Normalize proximity bonus by number of locations later if needed

    // 2. Diversity Score (Penalize using overused locations)
    let locationOverlapPenalty = 0;
    exp.locations.forEach(loc => {
      if (loc.placeId) {
        const usage = locationUsageCount.get(loc.placeId) || 1;
        // Penalize more if a location is used in many experiences being considered
        if (usage > 1) {
          locationOverlapPenalty += (usage - 1) * 5; // Adjust penalty multiplier
        }
      }
    });
    score -= locationOverlapPenalty;

    // 3. Rating Score (Bonus for highly-rated locations) - Optional
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
      score += (avgRating - 3) * 5; // Bonus for ratings > 3, penalty < 3. Adjust scale.
    }


    // Apply preference matching score (basic example)
    if (params.preferredCategories && Array.isArray(params.preferredCategories)) {
      let matchScore = 0;
      exp.locations.forEach(loc => {
        if (loc.types && Array.isArray(loc.types)) {
          if (loc.types.some(type => params.preferredCategories.includes(type))) {
            matchScore += 5; // Add points for each location matching a preferred category
          }
        }
      });
      score += matchScore;
    }


    // Ensure score is within a reasonable range (e.g., 0-100)
    exp.relevanceScore = Math.max(0, Math.min(100, Math.round(score)));
  });

  // Sort by relevance score (descending)
  return experiences.sort((a, b) => b.relevanceScore - a.relevanceScore);
};

// --- Database Interaction (Helper - currently unused directly in route) ---

// Function to save experiences with metadata (example, might not be used directly)
// The main route handles saving logic currently.
const saveExperiencesToDatabase = async (experiencesData, isSeed = false, userId = null) => {
  if (!experiencesData || experiencesData.length === 0) return [];

  const experiencesToSave = experiencesData.map(exp => ({
    ...exp, // Assumes exp has title, description, locations etc.
    user_id: isSeed ? null : userId, // User ID only for non-seeds
    is_seed: isSeed,
    times_shown: 0,
    created_at: new Date(),
    // location_center might be calculated or passed in experiencesData
  }));

  try {
    const savedExperiences = await Experience.insertMany(experiencesToSave);
    console.log(`Saved ${savedExperiences.length} experiences to DB. isSeed: ${isSeed}`);
    return savedExperiences;
  } catch (error) {
    console.error(`Error saving experiences to DB (isSeed: ${isSeed}):`, error);
    throw error; // Re-throw to be handled by caller
  }
};


// --- Utility Functions ---

// Helper to determine if a location is likely urban based on nearby establishment density
async function isUrbanLocation(lat, lon) {
  try {
    // Use a small radius for density check
    const radius = 500; // 500 meters
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=establishment&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );

    // If there are many establishments (> 15-20?) in a small radius, assume urban
    const isUrban = response.data.results.length > 15;
    console.log(`Location ${lat},${lon} density check: ${response.data.results.length} establishments. isUrban: ${isUrban}`);
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
    const { lat, lon, user_id, preferredCategories } = req.body; // Assuming preferredCategories is in the request body

    if (!lat || !lon) {
      return res.status(400).json({ error: "Latitude and longitude are required." });
    }

    // Fetch nearby places (increased radius and more types)
    const nearbyPlaces = await getNearbyPlaces(lat, lon);
    // Fetch additional attractions (broader search)
    const additionalAttractions = await searchForAdditionalAttractions(lat, lon);

    // Combine and deduplicate attractions
    const allAttractions = [...nearbyPlaces, ...additionalAttractions].filter((place, index, self) =>
      index === self.findIndex((p) => p.placeId === place.placeId)
    );

    if (allAttractions.length === 0) {
      return res.status(200).json({ message: "No significant attractions found in this area." });
    }

    // Generate diverse experiences using Gemini
    const generatedExperiences = await fetchGeminiExperiences(allAttractions, lat, lon);

    if (generatedExperiences.length === 0) {
      return res.status(200).json({ message: "Could not generate any experiences for this area." });
    }

    // Filter and score experiences based on user proximity and preferences
    const filteredExperiences = filterExperiencesForUser(generatedExperiences, lat, lon, { preferredCategories });

    // Respond with the generated and filtered experiences
    return res.status(200).json(filteredExperiences);

  } catch (error) {
    console.error("Error processing request:", error);
    return res.status(500).json({ error: "Failed to process your request." });
  }
});

export default router;