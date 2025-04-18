import express from 'express';
// import TourDescription from '../models/TourDescription.js';
import TourDescription from "../../models/audioTour/TourDescription.js"
const router = express.Router();

/**
 * POST /api/feedback/:locationId
 * Add a rating and feedback for a specific location
 */
// router.post('/:locationId', async (req, res) => {
//   try {
//     const { locationId } = req.params;
//     const { userId, rating, comment } = req.body;
    
//     // Input validation
//     if (!userId) {
//       return res.status(400).json({ error: 'User ID is required' });
//     }
    
//     if (!rating || rating < 1 || rating > 5) {
//       return res.status(400).json({ error: 'Rating must be a number between 1-5' });
//     }
    
//     // Find the tour location
//     const tourLocation = await TourDescription.findOne({ locationId });
    
//     if (!tourLocation) {
//       return res.status(404).json({ error: 'Location not found' });
//     }
    
//     // Create new feedback entry
//     const newFeedback = {
//       userId,
//       rating,
//       comment: comment || '',
//       timestamp: new Date()
//     };
    
//     // Add feedback to the location's feedback array
//     tourLocation.feedback.push(newFeedback);
    
//     // Update the average rating
//     tourLocation.updateAverageRating();
    
//     // Save the updated document
//     await tourLocation.save();
    
//     return res.status(201).json({
//       message: 'Feedback submitted successfully',
//       averageRating: tourLocation.averageRating,
//       ratingCount: tourLocation.ratingCount
//     });
    
//   } catch (error) {
//     console.error('Error saving feedback:', error);
//     return res.status(500).json({ error: 'Failed to save feedback' });
//   }
// });

// Example route for handling rating submission
app.post('/api/rating/:locationId', async (req, res) => {
  const { userId, rating, comment } = req.body;
  const locationId = req.params.locationId;

  try {
    // Fetch the location (or create a new one if it doesn't exist)
    let location = await Location.findOne({ _id: locationId });

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Make sure the ratings array is initialized
    if (!location.ratings) {
      location.ratings = [];
    }

    // Add the new rating to the ratings array
    location.ratings.push({
      userId,
      rating,
      comment,
      date: new Date(),
    });

    // Save the updated location with the new rating
    await location.save();

    return res.status(201).json({ message: 'Rating saved successfully' });
  } catch (error) {
    console.error('Error saving rating:', error);
    return res.status(500).json({ error: 'Error saving feedback' });
  }
});


/**
 * GET /api/feedback/:locationId
 * Get all feedback for a specific location
 */
router.get('/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    
    const tourLocation = await TourDescription.findOne({ locationId });
    
    if (!tourLocation) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    return res.status(200).json({
      locationName: tourLocation.locationName,
      averageRating: tourLocation.averageRating,
      ratingCount: tourLocation.ratingCount,
      feedback: tourLocation.feedback
    });
    
  } catch (error) {
    console.error('Error retrieving feedback:', error);
    return res.status(500).json({ error: 'Failed to retrieve feedback' });
  }
});

export default router;