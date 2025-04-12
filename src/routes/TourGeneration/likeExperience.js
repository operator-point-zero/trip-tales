import express from 'express';
import mongoose from 'mongoose';
import Experience from '../models/experience.js';
import User from '../models/user.js';

const router = express.Router();

// POST /favorites — Add to favorites
router.post('/favorites', async (req, res) => {
  try {
    const { userId, experienceId } = req.body;

    if (!userId || !experienceId) {
      return res.status(400).json({ message: 'userId and experienceId are required' });
    }

    const user = await User.findById(userId);
    const experience = await Experience.findById(experienceId);

    if (!user || !experience) {
      return res.status(404).json({ message: 'User or experience not found' });
    }

    const objectUserId = new mongoose.Types.ObjectId(userId);

    await Promise.all([
      User.updateOne({ _id: userId }, { $addToSet: { favorites: experienceId } }),
      Experience.updateOne({ _id: experienceId }, { $addToSet: { favoritedBy: objectUserId } }),
    ]);

    return res.status(200).json({ message: 'Experience added to favorites' });
  } catch (error) {
    console.error('Error adding to favorites:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /favorites — Remove from favorites
router.delete('/favorites', async (req, res) => {
  try {
    const { userId, experienceId } = req.body;

    if (!userId || !experienceId) {
      return res.status(400).json({ message: 'userId and experienceId are required' });
    }

    const objectUserId = new mongoose.Types.ObjectId(userId);

    await Promise.all([
      User.updateOne({ _id: userId }, { $pull: { favorites: experienceId } }),
      Experience.updateOne({ _id: experienceId }, { $pull: { favoritedBy: objectUserId } }),
    ]);

    return res.status(200).json({ message: 'Experience removed from favorites' });
  } catch (error) {
    console.error('Error removing from favorites:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /check-favorite — Check if experience is a favorite
router.post('/check-favorite', async (req, res) => {
  try {
    const { userId, experienceId } = req.body;

    if (!userId || !experienceId) {
      return res.status(400).json({ message: 'userId and experienceId are required' });
    }

    const user = await User.findById(userId);
    const isFavorite = user?.favorites?.includes(experienceId);

    return res.status(200).json({ isFavorite: isFavorite ?? false });
  } catch (error) {
    console.error('Error checking favorite status:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
