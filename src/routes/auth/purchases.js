// export default router;
import express from 'express';
import mongoose from 'mongoose';
import User from "../../models/userModel/User.js"; // Adjust path if needed

const router = express.Router();

/**
 * @route POST /api/purchases
 * @desc Process purchase data from RevenueCat and update user records
 * @access Private
 */
router.post('/', async (req, res) => {
  try {
    const { userId, productId, packageId, purchaseToken, purchaseType } = req.body;

    if (!userId || !productId || !packageId || !purchaseType) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    // Find the user by their ID
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Relax ObjectId validation for productId
    let validProductId = productId;  // Directly use as string if it's invalid length

    if (mongoose.Types.ObjectId.isValid(productId)) {
      validProductId = new mongoose.Types.ObjectId(productId);
    } else {
      // If it's not a valid ObjectId, we use it as a string
      console.log(`Invalid ObjectId length for productId: ${productId}`);
    }

    // Handle different purchase types
    if (purchaseType === 'subscription') {
      // Calculate expiry date based on package type
      const expiryDate = calculateExpiryDate(packageId);
      
      // Determine subscription status based on package
      let status = 'free';
      if (packageId.includes('monthly')) {
        status = 'monthly';
      } else if (packageId.includes('annual')) {
        status = 'annual';
      }

      // Update user's subscription details
      user.subscription = {
        status,
        expiryDate
      };
      
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'Subscription processed successfully',
        data: {
          subscriptionStatus: status,
          expiryDate
        }
      });
    } 
    else if (purchaseType === 'one_time') {
      // For one-time purchases, add the tour to purchasedTours if it's not already there
      const tourId = validProductId; // Use validProductId (string or ObjectId)

      if (!user.purchasedTours.some(id => id.equals(tourId))) {
        user.purchasedTours.push(tourId);
        await user.save();
      }

      return res.status(200).json({
        success: true,
        message: 'One-time purchase processed successfully',
        data: {
          purchasedTour: productId
        }
      });
    } 
    else {
      return res.status(400).json({
        success: false,
        message: 'Invalid purchase type'
      });
    }
  } catch (error) {
    console.error('Error processing purchase:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error processing purchase',
      error: error.message
    });
  }
});

/**
 * @route GET /api/purchases/verify/:userId
 * @desc Verify user's active subscriptions and purchases, auto-update if expired
 * @access Private
 */
router.get('/verify/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    let hasActiveSubscription = false;
    const now = new Date();
    let needsSave = false; // Track if we need to save

    if (user.subscription && user.subscription.status !== 'free') {
      if (user.subscription.expiryDate && new Date(user.subscription.expiryDate) > now) {
        hasActiveSubscription = true;
      } else {
        // Subscription expired
        if (user.subscription.status !== 'free' || user.subscription.expiryDate !== null) {
          user.subscription.status = 'free';
          user.subscription.expiryDate = null;
          needsSave = true;
          console.log(`User ${userId} subscription expired, downgraded to free.`);
        }
      }
    }

    if (needsSave) {
      await user.save();
    }

    return res.status(200).json({
      success: true,
      data: {
        subscription: {
          status: user.subscription.status,
          isActive: hasActiveSubscription,
          expiryDate: user.subscription.expiryDate
        },
        purchasedTours: user.purchasedTours
      }
    });
  } catch (error) {
    console.error('Error verifying purchases:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error verifying purchases',
      error: error.message
    });
  }
});

/**
 * Helper function to calculate expiry date based on package type
 */
function calculateExpiryDate(packageId) {
  const now = new Date();
  
  if (packageId.includes('annual')) {
    return new Date(now.setFullYear(now.getFullYear() + 1));
  } else if (packageId.includes('sixMonth')) {
    return new Date(now.setMonth(now.getMonth() + 6));
  } else if (packageId.includes('threeMonth')) {
    return new Date(now.setMonth(now.getMonth() + 3));
  } else if (packageId.includes('twoMonth')) {
    return new Date(now.setMonth(now.getMonth() + 2));
  } else {
    // Default to monthly
    return new Date(now.setMonth(now.getMonth() + 1));
  }
}

export default router;

