import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import connectDB from "./config/db.js";
import { processScheduledDeletions } from "./routes/auth/deletion_cron.js";
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






dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

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

app.get("/api/cron/delete-scheduled-users", async (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: "CRON_SECRET is not configured" });
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    await connectDB();
    const result = await processScheduledDeletions();
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

app.use((req, res, next) => {
  connectDB().then(() => next()).catch(next);
});

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

// Health Check Route
app.get("/", (req, res) => {
  res.send("✅ AI Tour Guide API is running...");
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
}

export default app;
