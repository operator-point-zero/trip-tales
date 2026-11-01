import mongoose from "mongoose";

const locationSchema = new mongoose.Schema({
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  locationName: { type: String, required: true }, // Human-readable name
  placeId: { type: String, required: false }, // Provider-specific place identifier
  sourceUrl: { type: String, required: false }, // Link to the provider's source record
  sourceReferences: { type: [String], required: false }, // OSM-linked Wikipedia or Wikidata references
  types: {type: [String], required: false}, // Place categories from the selected provider
  rating: {type: String, required: false}, // Optional provider rating
  vicinity: {type: String, required: false}, // Provider-supplied address
  photos: {type: [String], required: false}, // Provider-supplied image URLs
  narration: {type: String, required: false}, // AI narration grounded in mapped fields
  narrationStyle: { type: String, required: false },
});

const experienceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    locations: { type: [locationSchema], required: true }, // Now supports multiple locations
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false }, // Tracks who requested the experience
    // New field to track users who have favorited this experience
    favoritedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    locationKey: { type: String, required: false }, // ADDED THIS LINE
  },
  { timestamps: true }
);

const Experience = mongoose.model("Experience", experienceSchema);

export default Experience;
