// import mongoose from 'mongoose';

// const TourDescriptionSchema = new mongoose.Schema({
//   locationId: { type: String, unique: true, required: true },
//   locationName: { type: String, required: true },
//   lat: { type: Number, required: true },
//   lng: { type: Number, required: true },
//   narration: { type: String, required: true },
//   audioUrl: { type: String }, // Added audioUrl field
// });

// export default mongoose.model('TourDescription', TourDescriptionSchema);

// import mongoose from 'mongoose';

// const TourDescriptionSchema = new mongoose.Schema({
//   locationId: { type: String, unique: true, required: true },
//   locationName: { type: String, required: true },
//   lat: { type: Number, required: true },
//   lng: { type: Number, required: true },
//   narration: { type: String, required: true },
//   audioUrls: { type: Object, default: {} }, // Changed to audioUrls object
// });

// export default mongoose.model('TourDescription', TourDescriptionSchema);

import mongoose from 'mongoose';

// Define a schema for individual feedback entries
const FeedbackSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String },
  timestamp: { type: Date, default: Date.now }
});

const TourDescriptionSchema = new mongoose.Schema({
  locationId: { type: String, unique: true, required: true },
  locationName: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  narration: { type: String, required: true },
  audioUrls: { type: Object, default: {} }, // Object to store audio URLs
  // Add average rating field that will be updated when new ratings come in
  averageRating: { type: Number, default: 0 },
  // Total number of ratings received
  ratingCount: { type: Number, default: 0 },
  // Array of feedback objects
  feedback: [FeedbackSchema]
});

// Method to calculate and update average rating
TourDescriptionSchema.methods.updateAverageRating = function() {
  if (this.feedback.length === 0) {
    this.averageRating = 0;
    this.ratingCount = 0;
  } else {
    const totalRating = this.feedback.reduce((sum, item) => sum + item.rating, 0);
    this.averageRating = totalRating / this.feedback.length;
    this.ratingCount = this.feedback.length;
  }
};

export default mongoose.model('TourDescription', TourDescriptionSchema);