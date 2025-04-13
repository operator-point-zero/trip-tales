import express from 'express';
import mongoose from 'mongoose';
import Experience from '../../models/experiences/Experience.js';
import User from '../../models/userModel/User.js';

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

// GET /favorites/:userId — Get all favorited experiences for a user
// GET /favorites/:userId — Get all favorited experiences for a user
router.get('/favorites/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.favorites || user.favorites.length === 0) {
      return res.status(200).json({ favorites: [] });
    }

    const favoriteExperiences = await Experience.find({
      _id: { $in: user.favorites }
    }).populate({
      path: 'user_id',
      model: 'User',
      select: 'name profPicUrl'
    });

    const formattedFavorites = favoriteExperiences.map(exp => {
      const formattedLocations = (exp.locations || []).map(location => ({
        _id: location._id.toString(),
        lat: location.coordinates.lat,
        lon: location.coordinates.lon,
        locationName: location.locationName,
        placeId: location.placeId,
        types: location.types,
        vicinity: location.vicinity,
        rating: parseFloat(location.rating),
        photos: (location.photos || []).map(photo => ({
          photo_reference: photo.photo_reference,
          width: photo.width,
          height: photo.height
        })),
        narration: {
          text: location.narrationText,
          language: location.language || 'en',
          audioUrl: location.audioUrl
        }
      }));

      const photos = formattedLocations.flatMap(loc => loc.photos);
      const locationCount = formattedLocations.length;

      return {
        _id: exp._id.toString(),
        title: exp.title,
        description: exp.description,
        locations: formattedLocations,
        photos: photos,
        locationCount: locationCount,
        creator: exp.user_id ? {
          name: exp.user_id.name,
          profPic: exp.user_id.profPicUrl
        } : null,
        duration: '2h',
        distance: '2.5',
        price: 'Free',
        type: 'Tour',
        createdAt: exp.createdAt,
        updatedAt: exp.updatedAt
      };
    });

    return res.status(200).json({ favorites: formattedFavorites });
  } catch (error) {
    console.error('Error fetching favorite experiences:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});


export default router;
