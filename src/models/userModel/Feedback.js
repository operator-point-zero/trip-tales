// import mongoose from "mongoose";

// const feedbackSchema = new mongoose.Schema(
//     {
//         userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Optional
//         name: { type: String, required: true }, 
//         profPicUrl: { type: String }, // ✅ Added profile picture URL
//         message: { type: String, required: true },
//         type: { type: String, enum: ["bug", "feature", "general"], required: true },
//     },
//     { timestamps: true }
// );

// const Feedback = mongoose.model("Feedback", feedbackSchema);

// export default Feedback;

// models/userModel/Feedback.js
import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema({
  userId: { type: String },
  name: { type: String, required: true },
  profPicUrl: { type: String },
  message: { type: String, required: true },
  type: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const Feedback = mongoose.model("Feedback", feedbackSchema);

export default Feedback;
