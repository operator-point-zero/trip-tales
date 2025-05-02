// utils/cron/deleteScheduledUsers.js
import cron from "node-cron";
import User from "../../models/userModel/User.js";
import { sendEmail } from "../../services/emailService.js";

// Run every hour
cron.schedule("0 * * * *", async () => {
  console.log("🕒 Running scheduled user deletion...");

  try {
    const now = new Date();
    const usersToDelete = await User.find({ scheduledDeletion: { $lte: now } });

    for (const user of usersToDelete) {
      await User.findByIdAndDelete(user._id);

      const deleteHtml = `
        <h2>Goodbye, ${user.name || "User"} 😢</h2>
        <p>Your account has now been permanently deleted. Wishing you all the best!</p>
        <p>🚀 The Tour Guide Team</p>
      `;

      try {
        await sendEmail(user.email, "👋 Account Deleted", deleteHtml);
      } catch (emailErr) {
        console.error(`❌ Email failed for ${user.email}:`, emailErr);
      }

      console.log(`✅ Deleted user: ${user.email}`);
    }
  } catch (err) {
    console.error("❌ Cron job failed:", err);
  }
});
