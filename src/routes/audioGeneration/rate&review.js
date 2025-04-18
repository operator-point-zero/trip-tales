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

i// routes/ratingRoutes.js
const express = require('express');
const router = express.Router();
const TourDescription = require('../models/TourDescription');

/**
 * Route to add a new rating for a specific location
 * POST /api/rating/:locationId
 */
router.post('/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    const { userId, rating, comment } = req.body;

    // Validate required fields
    if (!userId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false, 
        message: 'UserId and rating (1-5) are required' 
      });
    }

    // Find the tour description by locationId
    const tourDescription = await TourDescription.findOne({ locationId });
    
    if (!tourDescription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Location not found' 
      });
    }

    // Check if user has already submitted feedback for this location
    const existingFeedbackIndex = tourDescription.feedback.findIndex(
      item => item.userId === userId
    );

    if (existingFeedbackIndex !== -1) {
      // Update existing feedback
      tourDescription.feedback[existingFeedbackIndex] = {
        userId,
        rating,
        comment: comment || '',
        timestamp: new Date()
      };
    } else {
      // Add new feedback
      tourDescription.feedback.push({
        userId,
        rating,
        comment: comment || '',
        timestamp: new Date()
      });
    }

    // Update the average rating
    tourDescription.updateAverageRating();
    
    // Save the updated document
    await tourDescription.save();

    return res.status(201).json({
      success: true,
      message: 'Rating added successfully',
      averageRating: tourDescription.averageRating,
      ratingCount: tourDescription.ratingCount
    });
  } catch (error) {
    console.error('Error saving rating:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error while processing rating' 
    });
  }
});

/**
 * Route to get ratings for a specific location
 * GET /api/rating/:locationId
 */
router.get('/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params;
    
    const tourDescription = await TourDescription.findOne(
      { locationId },
      'averageRating ratingCount feedback'
    );
    
    if (!tourDescription) {
      return res.status(404).json({ 
        success: false, 
        message: 'Location not found' 
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        averageRating: tourDescription.averageRating,
        ratingCount: tourDescription.ratingCount,
        feedback: tourDescription.feedback
      }
    });
  } catch (error) {
    console.error('Error retrieving ratings:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error while retrieving ratings' 
    });
  }
});

/**
 * Route to check if a user has already rated a location
 * GET /api/rating/:locationId/check/:userId
 */
router.get('/:locationId/check/:userId', async (req, res) => {
  try {
    const { locationId, userId } = req.params;
    
    const tourDescription = await TourDescription.findOne(
      { 
        locationId,
        'feedback.userId': userId
      }
    );
    
    return res.status(200).json({
      success: true,
      hasRated: !!tourDescription
    });
  } catch (error) {
    console.error('Error checking user rating:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error while checking user rating' 
    });
  }
});

module.exports = router;