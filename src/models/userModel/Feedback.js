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
