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

// Assuming 'router', 'User', 'Experience' are already defined and required/imported
// GET /favorites/:userId — Get all favorited experiences for a user
router.get('/favorites/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    // First, find the user and get the list of favorite experience IDs
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // If user has no favorites, return empty array early
    if (!user.favorites || user.favorites.length === 0) {
      return res.status(200).json({ favorites: [] });
    }

    // Now query the Experience collection for full details of favorited experiences
    const favoriteExperiences = await Experience.find({
      _id: { $in: user.favorites }
    }).populate({
      path: 'user_id',
      model: 'User',
      select: 'name profPicUrl' // Corrected based on usage below
    });

    // Filter out any null/undefined experiences just in case ( belt-and-suspenders check)
    const validExperiences = favoriteExperiences.filter(exp => exp != null);

    // Format the data for the client, adding checks for potentially bad data
    const formattedFavorites = validExperiences.map(exp => {
      let photos = [];
      let locationCount = 0;

      // --- Added Check [1]: Ensure exp.locations is an array ---
      if (Array.isArray(exp.locations)) {
        locationCount = exp.locations.length; // Calculate count only if it's an array

        exp.locations.forEach((location, index) => {
          // --- Added Check [2]: Ensure 'location' is a valid object ---
          // This prevents errors if the array contains null, undefined, or non-objects
          if (location && typeof location === 'object') {

            // Safe to access location.photos now
            if (location.photos && Array.isArray(location.photos) && location.photos.length > 0) {
              photos = photos.concat(location.photos);
            }

            // --- Hypothetical Check for 'lat' (where the original error likely occurred) ---
            // Although your formatting code didn't show explicit use of 'lat',
            // if some other logic *did* use it, a check like this would be needed:
            /*
            if (location.lat === undefined || location.lon === undefined) {
               console.warn(`Experience ${exp._id}, Location index ${index}: Missing lat/lon properties. Location data:`, JSON.stringify(location));
               // Handle appropriately, e.g., skip calculations needing lat/lon
            } else {
               // Proceed with logic using location.lat / location.lon
            }
            */
            // --- End Hypothetical Check ---

          } else {
            // Log a warning if an invalid item is found in the locations array
            console.warn(`Experience ${exp._id}: Invalid item found in locations array at index ${index}. Item:`, JSON.stringify(location));
          }
        });
      } else {
         // Log a warning if exp.locations is present but not an array
         if (exp.locations !== undefined && exp.locations !== null) {
             console.warn(`Experience ${exp._id}: 'locations' field is not an array. Value:`, JSON.stringify(exp.locations));
         }
         // locationCount remains 0
      }

      // Format the final object for this experience
      return {
        _id: exp._id,
        title: exp.title,
        description: exp.description,
        locations: exp.locations, // Still pass the original locations array (or null/undefined if it wasn't an array)
        photos: photos, // Flattened array of all valid photos found
        locationCount: locationCount, // Calculated count
        creator: exp.user_id ? { // Check if user_id (creator) was populated
          name: exp.user_id.name,
          profPic: exp.user_id.profPicUrl // Used profPicUrl from populate select
        } : null,
        // Using hardcoded values as before (replace if actual data becomes available)
        duration: '2h',
        distance: '2.5',
        price: 'Free',
        type: 'Tour',
        createdAt: exp.createdAt,
        updatedAt: exp.updatedAt
      };
    });

    // Return the potentially filtered and safely formatted favorites
    return res.status(200).json({
      favorites: formattedFavorites
    });

  } catch (error) {
    // Log the detailed error
    console.error(`Error fetching favorite experiences for user ${req.params.userId}:`, error);
    // Return a generic server error message
    return res.status(500).json({ message: 'Server error occurred while fetching favorites.' });
  }
});


export default router;
