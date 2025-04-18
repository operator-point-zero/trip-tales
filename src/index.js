import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import connectDB from "./config/db.js";
import openai from "./config/openAI.js"; // Import OpenAI config
import authRoutes from "./routes/auth/authRoutes.js";
import experienceRoutes from "./routes/TourGeneration/experienceRoutes.js";
import feedbackRoutes from "./routes/auth/feedbackRoutes.js";
import narrationRoutes from "./routes/audioGeneration/generateAudio.js";
import successfulTransactionsRoutes from "./routes/payments/succesfull_transactions.js";
import purchasedToursRoutes from "./routes/auth/usersPurchasedTours.js"; 
import favoritesRoutes from "./routes/TourGeneration/likeExperience.js";
import reviewRoutes from "./routes/audioGeneration/rate&review.js";





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



// OpenAI Test Route (Optional)
app.get("/api/test-openai", async (req, res) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [{ role: "system", content: "Say hello!" }],
    });

    res.json({ message: response.choices[0].message.content });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to connect to OpenAI" });
  }
});

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
