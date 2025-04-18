// import express from 'express';
// // import TourDescription from '../models/TourDescription.js';
// import TourDescription from "../../models/audioTour/TourDescription.js"
// const router = express.Router();

// /**
//  * POST /api/feedback/:locationId
//  * Add a rating and feedback for a specific location
//  */
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

// /**
//  * GET /api/feedback/:locationId
//  * Get all feedback for a specific location
//  */
// router.get('/:locationId', async (req, res) => {
//   try {
//     const { locationId } = req.params;
    
//     const tourLocation = await TourDescription.findOne({ locationId });
    
//     if (!tourLocation) {
//       return res.status(404).json({ error: 'Location not found' });
//     }
    
//     return res.status(200).json({
//       locationName: tourLocation.locationName,
//       averageRating: tourLocation.averageRating,
//       ratingCount: tourLocation.ratingCount,
//       feedback: tourLocation.feedback
//     });
    
//   } catch (error) {
//     console.error('Error retrieving feedback:', error);
//     return res.status(500).json({ error: 'Failed to retrieve feedback' });
//   }
// });

// export default router;

import express from 'express';
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

//     // Handle the case where the location is not found
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

    console.log('--- Before null check ---');
    console.log('locationId from params:', locationId);
    console.log('tourLocation after findOne:', tourLocation);

    // Handle the case where the location is not found
    if (!tourLocation) {
      console.log('tourLocation is null - returning 404');
      return res.status(404).json({ error: 'Location not found' });
    }

    console.log('--- After null check ---');
    console.log('tourLocation.feedback before push:', tourLocation.feedback);

    // Create new feedback entry
    const newFeedback = {
      userId,
      rating,
      comment: comment || '',
      timestamp: new Date()
    };

    // Add feedback to the location's feedback array
    tourLocation.feedback.push(newFeedback); // Line 188

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
      feedback: tourLocation.feedback
    });

  } catch (error) {
    console.error('Error retrieving feedback:', error);
    return res.status(500).json({ error: 'Failed to retrieve feedback' });
  }
});

export default router;