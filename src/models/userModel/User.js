import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    googleId: { type: String, unique: true, sparse: true },
    appleId: { type: String, unique: true, sparse: true },
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    profPicUrl: { type: String },
    authProvider: { type: String, enum: ["google", "apple"], required: true },
    fcmToken: { type: String, default: null },

    subscription: {
      status: { type: String, enum: ["free", "monthly", "annual"], default: "free" },
      expiryDate: { type: Date, default: null },
    },

    purchasedTours: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tour" }],
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "Experience" }],
    scheduledDeletion: { type: Date, default: null },

  },
  { timestamps: true }
);

export default mongoose.model("User", UserSchema);



