import express from "express";
import mongoose from "mongoose";
import User from "../../models/userModel/User.js";
import Experience from "../../models/experiences/Experience.js";

const router = express.Router();

// GET purchased tours for a user
router.get("/:userId/purchased-tours", async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Find the user and get their purchased tour IDs
    const user = await User.findById(userId).select("purchasedTours");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Count total purchased tours directly from the User model
    const totalPurchasedTours = user.purchasedTours.length;

    // Fetch only valid experiences
    const experiences = await Experience.find({ _id: { $in: user.purchasedTours } });

    res.json({ 
      totalPurchasedTours, // Number of tours stored in the user's data
      validPurchasedExperiences: experiences.length, // Number of actual experiences found
      purchasedExperiences: experiences
    });
  } catch (error) {
    console.error("Error fetching purchased tours:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
