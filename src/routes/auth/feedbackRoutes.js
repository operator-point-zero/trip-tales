import express from "express";
// import Feedback from "../models/userModel/Feedback.js"; // ✅ Correct import path
import Feedback from "../../models/userModel/Feedback.js";


const router = express.Router();

// @route   POST /api/feedback
// @desc    Submit feedback
// @access  Public
router.post("/", async (req, res) => {
    try {
        const { userId, name, profPicUrl, message, type } = req.body;

        if (!name || !message || !type) {
            return res.status(400).json({ error: "Name, message, and type are required" });
        }

        const feedback = new Feedback({ userId, name, profPicUrl, message, type });
        await feedback.save();

        res.status(201).json({ message: "Feedback submitted successfully" });
    } catch (error) {
        console.error("🚨 Error submitting feedback:", error);
        res.status(500).json({ error: "Server error", details: error.message });
    }
});

// ✅ Get All Feedback (Now includes `profPicUrl`)
router.get("/", async (req, res) => {
    try {
        const feedbackList = await Feedback.find();
        res.json(feedbackList);
    } catch (error) {
        console.error("🚨 Error fetching feedback:", error);
        res.status(500).json({ error: "Server error" });
    }
});

export default router;