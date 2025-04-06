import mongoose from "mongoose";

const locationSchema = new mongoose.Schema({
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  locationName: { type: String, required: true }, // Human-readable name
  placeId: { type: String, required: false }, // Google Places API ID (optional)
  types: {type: [String], required: false}, // Types of the location from places API
  rating: {type: String, required: false}, // Rating from places API
  vicinity: {type: String, required: false}, // Address from places API
  photos: {type: [String], required: false}, // Photos from places API
  narration: {type: String, required: false} // Detailed narration from local guide perspective
});

const experienceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    locations: { type: [locationSchema], required: true }, // Now supports multiple locations
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Tracks who requested the experience
  },
  { timestamps: true }
);

const Experience = mongoose.model("Experience", experienceSchema);

export default Experience;

// import mongoose from "mongoose";

// const locationSchema = new mongoose.Schema({
//   lat: { type: Number, required: true },
//   lon: { type: Number, required: true },
//   locationName: { type: String, required: true },
//   placeId: { type: String, required: false },
//   types: { type: [String], required: false },
//   rating: { type: String, required: false },
//   vicinity: { type: String, required: false },
//   photos: { type: [String], required: false }, // Array of photo URLs
//   narration: { type: String, required: false },
// });

// const experienceSchema = new mongoose.Schema(
//   {
//     title: { type: String, required: true },
//     description: { type: String, required: true },
//     locations: { type: [locationSchema], required: true },
//     user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
//     is_seed: { type: Boolean, default: false }, // Add is_seed field.
//     times_shown: { type: Number, default: 0 }, // Add times_shown field.
//     source_experience_id: { type: mongoose.Schema.Types.ObjectId, ref: "Experience", required: false }, // Add source_experience_id field.
//     location_center: {
//       lat: { type: Number, required: false },
//       lon: { type: Number, required: false },
//     },
//   },
//   { timestamps: true }
// );

// const Experience = mongoose.model("Experience", experienceSchema);

// export default Experience;