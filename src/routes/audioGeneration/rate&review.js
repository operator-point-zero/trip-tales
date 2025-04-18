import express from 'express';
import TourDescription from "../../models/audioTour/TourDescription.js"
const router = express.Router();

/**
 * POST /api/feedback/:locationId
 * Add a rating and feedback for a specific location
 */
router.post('/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { userId, rating, comment } = req.body;

    // Input validation
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be a number between 1-5' });
    }

    // Find the tour location
    const tourLocation = await TourDescription.findOne({ locationId });

    // Handle the case where the location is not found
    if (!tourLocation) {
      return res.status(404).json({ error: 'Location not found' });
    }

    // Defensive Initialization
    if (!tourLocation.feedback) {
      tourLocation.feedback = [];
      console.warn('WARNING: tourLocation.feedback was undefined, initialized to an empty array.');
    }

    // Check if user has already submitted feedback for this location
    const existingFeedbackIndex = tourLocation.feedback.findIndex(
      item => item.userId === userId
    );

    if (existingFeedbackIndex !== -1) {
      // Update existing feedback
      tourLocation.feedback[existingFeedbackIndex] = {
        userId,
        rating,
        comment: comment || '',
        timestamp: new Date()
      };
    } else {
      // Create new feedback entry
      const newFeedback = {
        userId,
        rating,
        comment: comment || '',
        timestamp: new Date()
      };

      // Add feedback to the location's feedback array
      tourLocation.feedback.push(newFeedback);
    }

    // Update the average rating
    tourLocation.updateAverageRating();

    // Save the updated document
    await tourLocation.save();

    return res.status(201).json({
      message: 'Feedback submitted successfully',
      averageRating: tourLocation.averageRating,
      ratingCount: tourLocation.ratingCount
    });

  } catch (error) {
    console.error('Error saving feedback:', error);
    return res.status(500).json({ error: 'Failed to save feedback' });
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
      feedback: tourLocation.feedback || []
    });

  } catch (error) {
    console.error('Error retrieving feedback:', error);
    return res.status(500).json({ error: 'Failed to retrieve feedback' });
  }
});

/**
 * GET /api/feedback/:locationId/check/:userId
 * Check if a user has already rated a location
 */
router.get('/:locationId/check/:userId', async (req, res) => {
  try {
    const { locationId, userId } = req.params;
    
    const tourLocation = await TourDescription.findOne({ locationId });
    
    if (!tourLocation) {
      return res.status(404).json({ error: 'Location not found' });
    }
    
    // Check if feedback array exists and if user has already given feedback
    const hasRated = tourLocation.feedback && 
      tourLocation.feedback.some(item => item.userId === userId);
    
    return res.status(200).json({
      hasRated: !!hasRated
    });
  } catch (error) {
    console.error('Error checking user rating:', error);
    return res.status(500).json({ error: 'Failed to check rating status' });
  }
});

export default router;