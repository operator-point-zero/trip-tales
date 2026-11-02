import express from "express";
import User from "../models/payments/User.js";

const router = express.Router();

// ✅ Route to check if user has purchased a specific tour
router.get("/:userId/has-access/:tourId", async (req, res) => {
  try {
    const { userId, tourId } = req.params;
    const user = await User.findOne({ googleId: userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user has an active subscription
    const isSubscribed =
      user.subscription.status !== "free" &&
      (!user.subscription.expiryDate || new Date(user.subscription.expiryDate) > new Date());

    // Check if the user has purchased this tour
    const hasPurchased = user.purchasedTours.includes(tourId);

    if (isSubscribed || hasPurchased) {
      return res.json({ access: true });
    } else {
      return res.json({ access: false });
    }
  } catch (error) {
    console.error("❌ Error checking tour access:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Route to check user’s subscription status
router.get("/:userId/subscription-status", async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ googleId: userId });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      status: user.subscription.status,
      expiryDate: user.subscription.expiryDate,
      isActive:
        user.subscription.status !== "free" &&
        (!user.subscription.expiryDate || new Date(user.subscription.expiryDate) > new Date()),
    });
  } catch (error) {
    console.error("❌ Error checking subscription status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
