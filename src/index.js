import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import connectDB from "./config/db.js";
import { generateText } from "./services/aiProvider.js";
import authRoutes from "./routes/auth/authRoutes.js";
import experienceRoutes from "./routes/TourGeneration/experienceRoutes.js";
import feedbackRoutes from "./routes/auth/feedbackRoutes.js";
import narrationRoutes from "./routes/audioGeneration/generateAudio.js";
import successfulTransactionsRoutes from "./routes/payments/succesfull_transactions.js";
import purchasedToursRoutes from "./routes/auth/usersPurchasedTours.js"; 
import favoritesRoutes from "./routes/TourGeneration/likeExperience.js";
import reviewRoutes from "./routes/audioGeneration/rate&review.js";
import purchases from "./routes/auth/purchases.js";
import { processScheduledUserDeletions } from "./routes/auth/deletion_cron.js";






dotenv.config();
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/experiences", experienceRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/narration", narrationRoutes);
app.use("/api/payments", successfulTransactionsRoutes);
app.use("/api/user", purchasedToursRoutes);
app.use('/api', favoritesRoutes);
app.use('/api/rating', reviewRoutes);
app.use('/api/purchases', purchases);

app.post("/internal/process-scheduled-deletions", async (req, res) => {
  const expectedSecret = process.env.WORKER_CRON_SECRET;
  if (!expectedSecret || req.get("x-worker-cron-secret") !== expectedSecret) {
    return res.sendStatus(401);
  }

  try {
    const deletedCount = await processScheduledUserDeletions();
    return res.json({ deletedCount });
  } catch (error) {
    console.error("Scheduled account deletion failed:", error);
    return res.status(500).json({ error: "Scheduled account deletion failed" });
  }
});



// AI provider test route
const testAIProvider = async (req, res) => {
  try {
    const message = await generateText("Say hello!");
    res.json({ message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to connect to the configured AI provider" });
  }
};
app.get("/api/test-ai", testAIProvider);
app.get("/api/test-openai", testAIProvider);

// Health Check Route
app.get("/", (req, res) => {
  res.send("✅ AI Tour Guide API is running...");
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
