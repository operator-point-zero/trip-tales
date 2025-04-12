import express from 'express';
import User from "../../models/userModel/User.js";
import Experience from "../../models/experiences/Experience.js";

const router = express.Router();

// Add an experience to favorites
router.post('/favorites', async (req, res) => {
  try {
    const { experienceId, userId } = req.body;
    
    // Validate that both IDs are provided
    if (!experienceId || !userId) {
      return res.status(400).json({ message: 'Both experienceId and userId are required' });
    }
    
    // Check if experience exists
    const experience = await Experience.findById(experienceId);
    if (!experience) {
      return res.status(404).json({ message: 'Experience not found' });
    }
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Add to user's favorites if not already added
    if (user.favorites && user.favorites.includes(experienceId)) {
      return res.status(400).json({ message: 'Experience already in favorites' });
    }
    
    // Update both collections in parallel
    await Promise.all([
      // Add to user's favorites
      User.findByIdAndUpdate(
        userId,
        { $addToSet: { favorites: experienceId } },
        { new: true }
      ),
      
      // Add user to experience's favoritedBy
      Experience.findByIdAndUpdate(
        experienceId,
        { $addToSet: { favoritedBy: userId } },
        { new: true }
      )
    ]);
    
    return res.status(200).json({ message: 'Experience added to favorites' });
  } catch (error) {
    console.error('Error adding to favorites:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Remove an experience from favorites
router.delete('/favorites', async (req, res) => {
  try {
    const { experienceId, userId } = req.body;
    
    // Validate that both IDs are provided
    if (!experienceId || !userId) {
      return res.status(400).json({ message: 'Both experienceId and userId are required' });
    }
    
    // Update both collections in parallel
    await Promise.all([
      // Remove from user's favorites
      User.findByIdAndUpdate(
        userId,
        { $pull: { favorites: experienceId } },
        { new: true }
      ),
      
      // Remove user from experience's favoritedBy
      Experience.findByIdAndUpdate(
        experienceId,
        { $pull: { favoritedBy: userId } },
        { new: true }
      )
    ]);
    
    return res.status(200).json({ message: 'Experience removed from favorites' });
  } catch (error) {
    console.error('Error removing from favorites:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get all favorites for a user
router.post('/get-favorites', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Find user and populate favorites
    const userWithFavorites = await User.findById(userId).populate('favorites');
    
    return res.status(200).json({ favorites: userWithFavorites.favorites });
  } catch (error) {
    console.error('Error getting favorites:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Get all users who favorited an experience
router.post('/favorited-by', async (req, res) => {
  try {
    const { experienceId } = req.body;
    
    if (!experienceId) {
      return res.status(400).json({ message: 'experienceId is required' });
    }
    
    // Find experience and populate favoritedBy
    const experience = await Experience.findById(experienceId).populate('favoritedBy', 'name email profPicUrl');
    
    if (!experience) {
      return res.status(404).json({ message: 'Experience not found' });
    }
    
    return res.status(200).json({ 
      favoritedBy: experience.favoritedBy,
      count: experience.favoritedBy.length 
    });
  } catch (error) {
    console.error('Error getting users who favorited:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// Check if an experience is in favorites
router.post('/check-favorite', async (req, res) => {
  try {
    const { experienceId, userId } = req.body;
    
    if (!experienceId || !userId) {
      return res.status(400).json({ message: 'Both experienceId and userId are required' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const isFavorite = user.favorites && user.favorites.includes(experienceId);
    
    return res.status(200).json({ isFavorite });
  } catch (error) {
    console.error('Error checking favorite status:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;