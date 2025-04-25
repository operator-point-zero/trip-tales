const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config(); // Load environment variables from .env

// Import the Experience model
const Experience = require("../../models/experiences/Experience");
const purchases = require("./routes/auth/purchases.js"); // Use require here

// 1. Define your Mongoose schema (if you haven't already)
const UserSchema = new mongoose.Schema({
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
    purchasedExperiences: [{ type: mongoose.Schema.Types.ObjectId, ref: "Experience" }], // Changed field name
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "Experience" }],
}, { timestamps: true });

// 2. Define your Mongoose model
const User = mongoose.model("User", UserSchema);

// 3. Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// 4. Set up Express app
const app = express();
app.use(bodyParser.json()); // Use body-parser middleware to parse JSON requests

// 5. Define the route to handle purchase data (the endpoint you specified in Flutter)
app.post('/record-purchase', async (req, res) => {
    const { userId, productId, purchaseType, packageId } = req.body;

    try {
        // 5.1. Find the user
        const user = await User.findById(userId); // Use findById for ObjectId
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        if (purchaseType === 'one_time') {
            // 5.2. Handle one-time purchase (purchasedExperiences)
            const experience = await Experience.findById(productId); // Find by Experience ID
            if (!experience) {
                return res.status(400).json({ error: 'Experience not found' });
            }
             if (!user.purchasedExperiences.includes(experience._id)) {
                user.purchasedExperiences.push(experience._id);
             }
            await user.save();
            return res.json({ message: 'Experience purchase recorded' });
        } else if (purchaseType === 'subscription') {
            // 5.3. Handle subscription purchase
            let status = 'free';
            let expiryDate = null;

            if (packageId === 'monthly') {
                status = 'monthly';
                expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            } else if (packageId === 'annual') {
                status = 'annual';
                expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
            } else {
                status = 'unknown';
            }

            user.subscription.status = status;
            user.subscription.expiryDate = expiryDate;
            await user.save();
            return res.json({ message: 'Subscription recorded' });
        } else {
            return res.status(400).json({ error: 'Invalid purchase type' });
        }
    } catch (error) {
        console.error('Error recording purchase:', error);
        return res.status(500).json({ error: 'Purchase failed' });
    }
});

// 6. Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default router;