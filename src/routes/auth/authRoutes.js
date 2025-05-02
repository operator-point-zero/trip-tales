// import express from "express";
// import User from "../../models/userModel/User.js";
// import jwt from "jsonwebtoken";
// import { verifyToken } from "../../middleware/authMiddleware.js";
// import { sendEmail } from "../../services/emailService.js";

// const router = express.Router();

// // ✅ User Login / Signup
// router.post("/login", async (req, res) => {
//   try {
//     const { googleId, appleId, email, name, profPicUrl, authProvider, fcmToken } = req.body;

//     if (!email) return res.status(400).json({ error: "Email is required" });
//     if (!authProvider || !["google", "apple"].includes(authProvider)) {
//       return res.status(400).json({ error: "Valid authProvider (google or apple) is required" });
//     }
//     if ((authProvider === "google" && !googleId) || (authProvider === "apple" && !appleId)) {
//       return res.status(400).json({ error: `${authProvider}Id is required when using ${authProvider} authentication` });
//     }

//     const providerId = authProvider === "google" ? { googleId } : { appleId };
//     let user = await User.findOne(providerId);

//     if (!user) {
//       const existingUserWithEmail = await User.findOne({ email });

//       if (existingUserWithEmail) {
//         if (authProvider === "google" && !existingUserWithEmail.googleId) {
//           existingUserWithEmail.googleId = googleId;
//         } else if (authProvider === "apple" && !existingUserWithEmail.appleId) {
//           existingUserWithEmail.appleId = appleId;
//         }
//         existingUserWithEmail.authProvider = authProvider;
//         if (name) existingUserWithEmail.name = name;
//         if (profPicUrl) existingUserWithEmail.profPicUrl = profPicUrl;
//         if (fcmToken) existingUserWithEmail.fcmToken = fcmToken;

//         await existingUserWithEmail.save();
//         user = existingUserWithEmail;
//       } else {
//         user = new User({
//           email,
//           name: name || "",
//           profPicUrl: profPicUrl || "",
//           authProvider,
//           fcmToken: fcmToken || null,
//           ...(authProvider === "google" ? { googleId } : { appleId })
//         });
//         await user.save();

//         // ✅ Send Welcome Email
//         const welcomeHtml = `
//           <h2>Welcome to Our App, ${name || "User"}! 🎉</h2>
//           <p>We’re excited to have you onboard. Start exploring today!</p>
//           <p>Happy touring!</p>
//           <p>🚀 The Tour Guide Team</p>
//         `;
//         await sendEmail(email, "🎉 Welcome to Our App!", welcomeHtml);
//       }
//     } else {
//       // ✅ Update FCM token if user already exists
//       if (fcmToken && user.fcmToken !== fcmToken) {
//         user.fcmToken = fcmToken;
//         await user.save();
//       }
//     }

//     const token = jwt.sign(
//       { id: user._id, subscriptionStatus: user.subscriptionStatus },
//       process.env.JWT_SECRET,
//       { expiresIn: "7d" }
//     );

//     res.json({
//       token,
//       id: user._id,
//       email: user.email,
//       name: user.name,
//       profPicUrl: user.profPicUrl,
//       authProvider: user.authProvider,
//       subscriptionStatus: user.subscriptionStatus,
//       hasGoogleAuth: !!user.googleId,
//       hasAppleAuth: !!user.appleId
//     });

//   } catch (error) {
//     console.error("🚨 Login Error:", error);
//     res.status(500).json({ error: "Server error. Please try again later.", details: error.message });
//   }
// });

// // ✅ Delete User Account
// router.post("/delete-account", async (req, res) => {
//   try {
//     const { userId } = req.body;
//     if (!userId) return res.status(400).json({ error: "User ID is required" });

//     const user = await User.findByIdAndDelete(userId);
//     if (!user) return res.status(404).json({ error: "User not found" });

//     const deleteHtml = `
//       <h2>Goodbye, ${user.name || "User"} 😢</h2>
//       <p>We're sad to see you go. If you ever change your mind, you’re always welcome back!</p>
//       <p>Take care! 💙</p>
//       <p>🚀 The Tour Guide Team</p>
//     `;

//     try {
//       await sendEmail(user.email, "👋 Account Deletion Confirmation", deleteHtml);
//     } catch (emailErr) {
//       console.error("Failed to send deletion email:", emailErr);
//     }

//     res.json({ message: "Account deleted successfully" });
//   } catch (error) {
//     console.error("Error deleting account:", error);
//     res.status(500).json({ error: "Failed to delete account" });
//   }
// });


// export default router;

import express from "express";
import User from "../../models/userModel/User.js";
import jwt from "jsonwebtoken";
import { verifyToken } from "../../middleware/authMiddleware.js";
import { sendEmail } from "../../services/emailService.js";

const router = express.Router();

// ✅ User Login / Signup
router.post("/login", async (req, res) => {
  try {
    const { googleId, appleId, email, name, profPicUrl, authProvider, fcmToken } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!authProvider || !["google", "apple"].includes(authProvider)) {
      return res.status(400).json({ error: "Valid authProvider (google or apple) is required" });
    }
    if ((authProvider === "google" && !googleId) || (authProvider === "apple" && !appleId)) {
      return res.status(400).json({ error: `${authProvider}Id is required when using ${authProvider} authentication` });
    }

    const providerId = authProvider === "google" ? { googleId } : { appleId };
    let user = await User.findOne(providerId);

    if (!user) {
      const existingUserWithEmail = await User.findOne({ email });

      if (existingUserWithEmail) {
        if (authProvider === "google" && !existingUserWithEmail.googleId) {
          existingUserWithEmail.googleId = googleId;
        } else if (authProvider === "apple" && !existingUserWithEmail.appleId) {
          existingUserWithEmail.appleId = appleId;
        }
        existingUserWithEmail.authProvider = authProvider;
        if (name) existingUserWithEmail.name = name;
        if (profPicUrl) existingUserWithEmail.profPicUrl = profPicUrl;
        if (fcmToken) existingUserWithEmail.fcmToken = fcmToken;

        await existingUserWithEmail.save();
        user = existingUserWithEmail;
      } else {
        user = new User({
          email,
          name: name || "",
          profPicUrl: profPicUrl || "",
          authProvider,
          fcmToken: fcmToken || null,
          ...(authProvider === "google" ? { googleId } : { appleId })
        });
        await user.save();

        const welcomeHtml = `
          <h2>Welcome to Our App, ${name || "User"}! 🎉</h2>
          <p>We’re excited to have you onboard. Start exploring today!</p>
          <p>Happy touring!</p>
          <p>🚀 The Tour Guide Team</p>
        `;
        await sendEmail(email, "🎉 Welcome to Our App!", welcomeHtml);
      }
    } else {
      if (fcmToken && user.fcmToken !== fcmToken) {
        user.fcmToken = fcmToken;
        await user.save();
      }
    }

    const token = jwt.sign(
      { id: user._id, subscriptionStatus: user.subscription?.status },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      id: user._id,
      email: user.email,
      name: user.name,
      profPicUrl: user.profPicUrl,
      authProvider: user.authProvider,
      subscriptionStatus: user.subscription?.status,
      hasGoogleAuth: !!user.googleId,
      hasAppleAuth: !!user.appleId
    });

  } catch (error) {
    console.error("🚨 Login Error:", error);
    res.status(500).json({ error: "Server error. Please try again later.", details: error.message });
  }
});

// ✅ Schedule User Deletion (in 24 hours)
router.post("/delete-account", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const deletionDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    user.scheduledDeletion = deletionDate;
    await user.save();

    res.json({ message: "Account scheduled for deletion in 24 hours." });
  } catch (error) {
    console.error("Error scheduling account deletion:", error);
    res.status(500).json({ error: "Failed to schedule account deletion" });
  }
});

// ✅ Cancel Scheduled Deletion
router.post("/cancel-delete-account", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.scheduledDeletion) {
      return res.status(400).json({ message: "No scheduled deletion found." });
    }

    user.scheduledDeletion = null;
    await user.save();

    res.json({ message: "Account deletion has been canceled." });
  } catch (error) {
    console.error("Error canceling deletion:", error);
    res.status(500).json({ error: "Failed to cancel account deletion" });
  }
});

export default router;



