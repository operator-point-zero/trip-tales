// import mongoose from "mongoose";

// const UserSchema = new mongoose.Schema({
//   googleId: { type: String, unique: true, sparse: true },
//   appleId: { type: String, unique: true, sparse: true },
//   email: { type: String, required: true, unique: true },
//   name: { type: String },
//   profPicUrl: { type: String },
//   authProvider: { type: String, enum: ["google", "apple"], required: true },

//   subscription: {
//     status: { type: String, enum: ["free", "monthly", "annual"], default: "free" },
//     expiryDate: { type: Date, default: null },
//   },

//   purchasedTours: [{ type: String }], // Stores tour IDs for one-time purchases

//   createdAt: { type: Date, default: Date.now },
// });

// export default mongoose.model("User", UserSchema);

import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    googleId: { type: String, unique: true, sparse: true },
    appleId: { type: String, unique: true, sparse: true },
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String },
    profPicUrl: { type: String },
    authProvider: { type: String, enum: ["google", "apple"], required: true },

    subscription: {
      status: { type: String, enum: ["free", "monthly", "annual"], default: "free" },
      expiryDate: { type: Date, default: null },
    },

    purchasedTours: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tour" }], // Stores references to Tour documents
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

export default mongoose.model("User", UserSchema);


