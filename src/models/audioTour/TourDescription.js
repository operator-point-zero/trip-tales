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
  audioUrls: { type: Object, default: {} },
  averageRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  feedback: {
    type: [FeedbackSchema],
    default: []
  }
});

// Method to calculate and update average rating
TourDescriptionSchema.methods.updateAverageRating = function () {
  if (this.feedback.length === 0) {
    this.averageRating = 0;
    this.ratingCount = 0;
  } else {
    const totalRating = this.feedback.reduce((sum, item) => sum + item.rating, 0);
    this.averageRating = totalRating / this.feedback.length;
    this.ratingCount = this.feedback.length;
  }
};

// Check if the model already exists before creating it
let TourDescription;
try {
  TourDescription = mongoose.model('TourDescription');
} catch (error) {
  TourDescription = mongoose.model('TourDescription', TourDescriptionSchema);
}

export default TourDescription;
