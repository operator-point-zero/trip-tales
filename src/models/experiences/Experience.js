// import mongoose from "mongoose";

// const locationSchema = new mongoose.Schema({
//   lat: { type: Number, required: true },
//   lon: { type: Number, required: true },
//   locationName: { type: String, required: true }, // Human-readable name
//   placeId: { type: String, required: false }, // Google Places API ID (optional)
//   types: {type: [String], required: false}, // Types of the location from places API
//   rating: {type: String, required: false}, // Rating from places API
//   vicinity: {type: String, required: false}, // Address from places API
//   photos: {type: [String], required: false}, // Photos from places API
//   narration: {type: String, required: false} // Detailed narration from local guide perspective
// });

// const experienceSchema = new mongoose.Schema(
//   {
//     title: { type: String, required: true },
//     description: { type: String, required: true },
//     locations: { type: [locationSchema], required: true }, // Now supports multiple locations
//     user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false }, // Tracks who requested the experience
//     // New field to track users who have favorited this experience
//     favoritedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
//   },
//   { timestamps: true }
// );

// const Experience = mongoose.model("Experience", experienceSchema);

// export default Experience;

// import mongoose from "mongoose";

// const locationSchema = new mongoose.Schema({
//   lat: { type: Number, required: true },
//   lon: { type: Number, required: true },
//   locationName: { type: String, required: true }, // Human-readable name
//   placeId: { type: String, required: false }, // Google Places API ID (optional)
//   types: {type: [String], required: false}, // Types of the location from places API
//   rating: {type: String, required: false}, // Rating from places API
//   vicinity: {type: String, required: false}, // Address from places API
//   photos: {type: [String], required: false}, // Photos from places API
//   narration: {type: String, required: false} // Detailed narration from local guide perspective
// });

// const experienceSchema = new mongoose.Schema(
//   {
//     title: { type: String, required: true },
//     description: { type: String, required: true },
//     locations: { type: [locationSchema], required: true }, // Now supports multiple locations
//     user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false }, // Tracks who requested the experience
//     // New field to track users who have favorited this experience
//     favoritedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
//     locationKey: { type: String, required: false }, // ADDED THIS LINE
//   },
//   { timestamps: true }
// );

// const Experience = mongoose.model("Experience", experienceSchema);

// export default Experience;

// Your model file: /models/experiences/Experience.js

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
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false }, // Tracks who requested the experience
    // New field to track users who have favorited this experience
    favoritedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    locationKey: { type: String, required: false }, // ADDED THIS LINE
  },
  { timestamps: true }
);

const Experience = mongoose.model("Experience", experienceSchema);

export default Experience;
