import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    locationId: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: String,
      required: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

// Compound index to ensure one rating per user per location
ratingSchema.index({ locationId: 1, userId: 1 }, { unique: true });

// Static method to calculate average rating
ratingSchema.statics.getAverageRating = async function(locationId) {
  const result = await this.aggregate([
    { $match: { locationId: locationId } },
    { 
      $group: { 
        _id: "$locationId", 
        avgRating: { $avg: "$rating" },
        ratingCount: { $sum: 1 } 
      } 
    }
  ]);
  
  return result.length > 0 
    ? { avgRating: parseFloat(result[0].avgRating.toFixed(1)), ratingCount: result[0].ratingCount } 
    : { avgRating: 0, ratingCount: 0 };
};

export default mongoose.model("Rating", ratingSchema);