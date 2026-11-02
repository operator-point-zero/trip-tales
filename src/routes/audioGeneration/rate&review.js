import express from "express";
import Rating from "../../models/audioTour/rating.js";


const router = express.Router();

// POST - Submit a new rating or update existing one
router.post("/:locationId", async (req, res) => {
  try {
    const { locationId } = req.params;
    const { userId, rating, comment } = req.body;

    // Validate request body
    if (!userId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid rating data. userId and rating (1-5) are required." 
      });
    }

    // Check if user already rated this location
    const existingRating = await Rating.findOne({ locationId, userId });
    
    if (existingRating) {
      // Update existing rating
      existingRating.rating = rating;
      existingRating.comment = comment || "";
      await existingRating.save();
    } else {
      // Create new rating
      const newRating = new Rating({
        locationId,
        userId,
        rating,
        comment: comment || ""
      });
      await newRating.save();
    }

    res.status(201).json({ 
      success: true, 
      message: "Rating submitted successfully" 
    });
  } catch (error) {
    console.error("Error saving rating:", error);
    
    // Handle duplicate key error (user already rated)
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false, 
        message: "You have already rated this location" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "Server error while saving rating" 
    });
  }
});

// GET - Get ratings for a location
router.get("/:locationId", async (req, res) => {
  try {
    const { locationId } = req.params;
    
    // Get all ratings for the location
    const ratings = await Rating.find({ locationId })
      .select("userId rating comment createdAt")
      .sort({ createdAt: -1 });
    
    // Calculate average rating on the fly
    const stats = await Rating.getAverageRating(locationId);
      
    res.status(200).json({
      success: true,
      location: {
        id: locationId,
        avgRating: stats.avgRating,
        ratingCount: stats.ratingCount
      },
      ratings
    });
  } catch (error) {
    console.error("Error fetching ratings:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while fetching ratings" 
    });
  }
});

// GET - Check if user has rated a location
router.get("/:locationId/user/:userId", async (req, res) => {
  try {
    const { locationId, userId } = req.params;
    
    const rating = await Rating.findOne({ locationId, userId });
    
    res.status(200).json({
      success: true,
      hasRated: !!rating,
      rating: rating ? rating.rating : 0,
      comment: rating ? rating.comment : ""
    });
  } catch (error) {
    console.error("Error checking user rating:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while checking user rating" 
    });
  }
});

export default router;