import Experience from "../models/experiences/Experience.js";
import Feedback from "../models/userModel/Feedback.js";
import Rating from "../models/audioTour/rating.js";
import Transaction from "../models/payments/transactions.js";
import User from "../models/userModel/User.js";

export async function deleteUserAccountData(user) {
  const userId = user._id;
  const userIdString = userId.toString();
  const linkedUserIds = [userIdString, user.googleId, user.appleId].filter(Boolean);

  await Promise.all([
    Experience.deleteMany({ user_id: userId }),
    Experience.updateMany({ favoritedBy: userId }, { $pull: { favoritedBy: userId } }),
    Feedback.deleteMany({ userId: { $in: linkedUserIds } }),
    Rating.deleteMany({ userId: { $in: linkedUserIds } }),
    Transaction.updateMany({ userId }, { $set: { userId: null } }),
  ]);

  const deletion = await User.deleteOne({
    _id: userId,
    scheduledDeletion: { $lte: new Date() },
    deletionInProgress: true,
  });
  if (deletion.deletedCount !== 1) {
    throw new Error(`Account deletion finalization failed for user ${userIdString}`);
  }
}
