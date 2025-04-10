import mongoose from "mongoose";

const locationSchema = new mongoose.Schema({
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  locationName: { type: String, required: true },
  placeId: { type: String, required: false }, // optional is correct
  types: { type: [String], required: false, default: [] }, // Added default
  // --- Corrected Type ---
  rating: { type: Number, required: false, default: null }, // Store as Number
  // --- End Correction ---
  vicinity: { type: String, required: false },
  photos: { type: [String], required: false, default: [] }, // Added default
  narration: { type: String, required: false }
});

const experienceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    locations: {
        type: [locationSchema],
        required: true,
        // Add validation to ensure at least one location exists if needed
        validate: [val => Array.isArray(val) && val.length > 0, 'Experience must have at least one location']
    },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // --- Added Fields ---
    is_seed: { type: Boolean, required: true, default: false }, // Default to false, set true for seeds
    times_shown: { type: Number, required: true, default: 0 }, // Default to 0
    source_experience_id: { // Only exists for non-seed clones
        type: mongoose.Schema.Types.ObjectId,
        ref: "Experience",
        required: false // Not required because seeds won't have it
    },
    location_center: { // For geospatial queries
      type: {
        type: String,
        enum: ['Point'], // GeoJSON type
        required: true
      },
      coordinates: {
        type: [Number], // Array: [longitude, latitude]
        required: true
      }
    }
    // --- End Added Fields ---
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt
);

// --- Added Index ---
// Add a 2dsphere index for efficient geospatial queries on location_center
experienceSchema.index({ location_center: '2dsphere' });
// Optional: Index user_id and is_seed for faster lookups
experienceSchema.index({ user_id: 1 });
experienceSchema.index({ is_seed: 1, times_shown: 1 }); // Compound for seed lookup/sorting
// --- End Added Index ---


const Experience = mongoose.model("Experience", experienceSchema);

export default Experience;