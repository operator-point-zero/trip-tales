import express from 'express';
import crypto from 'crypto';
import User from '../../models/userModel/User.js';
import Transaction from '../../models/payments/transactions.js';

const router = express.Router();



router.post('/webhook', async (req, res) => {
  console.log('=== FULL WEBHOOK PAYLOAD START ===');
  console.log(JSON.stringify(req.body, null, 2));
  console.log('=== FULL WEBHOOK PAYLOAD END ===');

  try {
    const { 
      app_user_id: userId, 
      event_type, 
      product_id: productId,
      original_transaction_id: transactionId,
      price,
      purchased_at
    } = req.body;

    // Generate a unique transaction ID if not provided
    const uniqueTransactionId = transactionId || crypto.randomBytes(16).toString('hex');

    // Detailed logging of extracted data
    console.log('Extracted Data:', {
      userId,
      eventType: event_type,
      productId,
      transactionId: uniqueTransactionId,
      price: typeof price,
      purchasedAt: purchased_at,
      purchasedAtType: typeof purchased_at
    });

    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      console.error(`User not found with ID: ${userId}`);
      return res.status(404).send('User not found');
    }

    // Handle initial purchase
    if (event_type === 'INITIAL_PURCHASE' && productId.startsWith('tour_')) {
      const tourId = productId.split('_')[1];
      
      if (!user.purchasedTours.includes(tourId)) {
        user.purchasedTours.push(tourId);
        await user.save();

        // Prepare transaction data with type conversion and generated transaction ID
        const transactionData = {
          transactionId: uniqueTransactionId,
          userId: user._id,
          productId: productId,
          type: 'one-time',
          amount: Number(price), // Explicit number conversion
          transactionDate: new Date(purchased_at)
        };

        console.log('Prepared Transaction Data:', JSON.stringify(transactionData, null, 2));

        try {
          // Create and save transaction
          const transaction = new Transaction(transactionData);
          await transaction.save();
          
          console.log('Transaction Saved Successfully:', transaction);
        } catch (saveError) {
          console.error('Save Error:', {
            message: saveError.message,
            name: saveError.name,
            errors: saveError.errors
          });
          return res.status(500).send('Failed to save transaction');
        }
      }
    }

    res.status(200).send('Webhook processed successfully');
  } catch (error) {
    console.error('Final Catch - Webhook Processing Error:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Handle initial purchase
async function handleInitialPurchase(user, productId, payload) {
  const { 
    original_transaction_id: transactionId, 
    price,
    purchased_at,
    expires_date
  } = payload;

  // Check if the product is a tour
  if (productId.startsWith('tour_')) {
    await handleTourPurchase(user, productId, transactionId, price, purchased_at);
  } else {
    // Handle subscription purchase
    await handleSubscriptionPurchase(user, productId, transactionId, price, purchased_at, expires_date);
  }
}

// Handle tour purchase
async function handleTourPurchase(user, productId, transactionId, price, purchasedAt) {
  try {
    // Extract tour ID from product ID (e.g., 'tour_123')
    const tourId = productId.split('_')[1];
    
    // Check if user has already purchased this tour
    if (!user.purchasedTours.includes(tourId)) {
      // Add tour to user's purchased tours
      user.purchasedTours.push(tourId);
      await user.save();

      // Log the transaction
      await Transaction.create({
        transactionId,
        userId: user._id,
        productId,
        type: 'one-time',
        amount: price,
        transactionDate: new Date(purchasedAt)
      });

      console.log(`User ${user._id} purchased tour ${tourId}`);
    }
  } catch (error) {
    console.error('Error processing tour purchase:', error);
    throw error;
  }
}

// Handle subscription purchase
async function handleSubscriptionPurchase(user, productId, transactionId, price, purchasedAt, expiresAt) {
  try {
    // Determine subscription type
    let subscriptionType = 'monthly';
    if (productId.includes('annual')) {
      subscriptionType = 'annual';
    }

    // Update user subscription
    user.subscription = {
      status: subscriptionType,
      expiryDate: new Date(expiresAt)
    };
    await user.save();

    // Log the transaction
    await Transaction.create({
      transactionId,
      userId: user._id,
      productId,
      type: 'subscription',
      amount: price,
      transactionDate: new Date(purchasedAt),
      expirationDate: new Date(expiresAt)
    });

    console.log(`User ${user._id} purchased ${subscriptionType} subscription`);
  } catch (error) {
    console.error('Error processing subscription purchase:', error);
    throw error;
  }
}

// Subscription renewal handler
async function handleSubscriptionRenewal(user, payload) {
  const { 
    original_transaction_id: transactionId,
    product_id: productId,
    price,
    purchased_at,
    expires_date
  } = payload;

  try {
    // Determine subscription type
    let subscriptionType = 'monthly';
    if (productId.includes('annual')) {
      subscriptionType = 'annual';
    }

    // Update user subscription
    user.subscription = {
      status: subscriptionType,
      expiryDate: new Date(expires_date)
    };
    await user.save();

    // Log the renewal transaction
    await Transaction.create({
      transactionId,
      userId: user._id,
      productId,
      type: 'subscription',
      amount: price,
      transactionDate: new Date(purchased_at),
      expirationDate: new Date(expires_date)
    });

    console.log(`Renewed ${subscriptionType} subscription for user ${user._id}`);
  } catch (error) {
    console.error('Subscription renewal error:', error);
    throw error;
  }
}

// Subscription cancellation handler
async function handleSubscriptionCancellation(user, payload) {
  try {
    user.subscription.status = 'free';
    await user.save();
    
    console.log(`Subscription cancelled for user ${user._id}`);
  } catch (error) {
    console.error('Subscription cancellation error:', error);
    throw error;
  }
}

// Subscription expiration handler
async function handleSubscriptionExpiration(user, payload) {
  try {
    user.subscription = {
      status: 'free',
      expiryDate: null
    };
    await user.save();
    
    console.log(`Subscription expired for user ${user._id}`);
  } catch (error) {
    console.error('Subscription expiration error:', error);
    throw error;
  }
}

export default router;