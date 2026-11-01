// utils/cron/deleteScheduledUsers.js
import cron from "node-cron";
import User from "../../models/userModel/User.js";
import { sendEmail } from "../../services/emailService.js";
import { deleteUserAccountData } from "../../services/accountDeletion.js";

// Run every five minutes so due accounts are deleted soon after the grace period.
cron.schedule("*/5 * * * *", async () => {
  console.log("🕒 Running scheduled user deletion...");

  try {
    while (true) {
      const now = new Date();
      const user = await User.findOneAndUpdate(
        {
          scheduledDeletion: { $lte: new Date() },
          $or: [
            { deletionInProgress: { $ne: true } },
            { deletionStartedAt: { $lte: new Date(now.getTime() - 10 * 60 * 1000) } },
          ],
        },
        {
          $set: {
            deletionInProgress: true,
            deletionStartedAt: now,
          },
        },
        { new: true }
      ).select("+deletionInProgress");
      if (!user) break;

      try {
        await deleteUserAccountData(user);
      } catch (deletionError) {
        await User.updateOne(
          { _id: user._id, deletionInProgress: true },
          { $set: { deletionInProgress: false, deletionStartedAt: null } }
        );
        throw deletionError;
      }

      const deleteHtml = `
        <h2>Account deleted</h2>
        <p>Your account and associated profile data have been deleted.</p>
        <p>Purchase transaction records are retained without their account association where required for record keeping.</p>
        <p>If you had an active Apple or Google subscription, deleting this account did not cancel that subscription. Manage it in the store where you subscribed.</p>
      `;
      try {
        await sendEmail(user.email, "Account deleted", deleteHtml);
      } catch (emailError) {
        console.error("Failed to send account deletion confirmation email:", emailError);
      }

      console.log(`✅ Deleted scheduled account ${user._id}`);
    }
  } catch (err) {
    console.error("❌ Scheduled account deletion failed:", err);
  }
});
