import express from 'express';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const storage = new Storage({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
const bucketName = process.env.GCS_BUCKET_NAME;

const TourDescriptionSchema = new mongoose.Schema({
  locationId: { type: String, unique: true, required: true },
  locationName: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  narrations: { type: Map, of: String, default: {} },
  audioUrls: { type: Map, of: String, default: {} },
});

const TourDescription = mongoose.model('TourDescription', TourDescriptionSchema);
const router = express.Router();

async function generateNarration(locationName, lat, lng, language) {
  try {
    console.log(`Generating narration in language: ${language}`);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a knowledgeable, engaging local tour guide. Create an immersive, detailed narration (300-400 words) about ${locationName} (located at latitude ${lat}, longitude ${lng}). 
    
    Include:
    - Historical background and significance
    - Interesting cultural aspects
    - Local stories or legends
    - Notable features or landmarks
    - Small details that only locals would know
    - Sensory details (sights, sounds, smells)
    
    Make the narration personal and conversational, as if you're guiding a traveler through the location in person. Use vivid language and create a sense of place that makes the listener feel they're experiencing the location firsthand. 
    
    Respond in ${language}.`;

    const result = await model.generateContent(prompt);
    console.log('Gemini response:', result.response.text());
    return result.response.text();
  } catch (error) {
    console.error('Error generating narration with Gemini:', error);
    throw new Error('Failed to generate narration');
  }
}

async function generateAndSaveAudio(narration, locationId, language) {
  try {
    console.log(`Generating audio in language: ${language}`);

    const languageVoiceMap = {
      en: 'alloy',
      es: 'nova',
      fr: 'onyx',
      de: 'echo',
      it: 'shimmer',
      ja: 'echo',
      zh: 'onyx',
    };

    const voice = languageVoiceMap[language] || 'alloy';

    console.log(`Voice selected: ${voice}`);

    try {
      const speech = await openai.audio.speech.create({
        model: 'tts-1',
        voice: voice,
        input: narration,
      });

      const audioBuffer = Buffer.from(await speech.arrayBuffer());
      const fileName = `narration-${locationId}-${language}-${uuidv4()}.mp3`;
      const file = storage.bucket(bucketName).file(fileName);

      await file.save(audioBuffer, {
        metadata: { contentType: 'audio/mpeg' },
      });

      const audioUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
      console.log(`Audio URL: ${audioUrl}`);
      return audioUrl;
    } catch (openaiError) {
      console.error('OpenAI Error:', openaiError);
      throw openaiError;
    }
  } catch (error) {
    console.error('Error generating or saving audio:', error);
    throw new Error('Failed to generate or save audio');
  }
}

router.post('/', async (req, res) => {
  const { locationId, locationName, lat, lng, language = 'en' } = req.body;

  if (!locationId || !locationName || !lat || !lng) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    let tour = await TourDescription.findOne({ locationId });
    let narrationToUse;

    if (tour && tour.audioUrls && tour.audioUrls.get(language)) {
      return res.json({
        message: 'Audio already exists for this language',
        narration: tour.narrations.get(language),
        audioUrl: tour.audioUrls.get(language),
      });
    }

    if (tour && tour.narrations.get(language)) {
      narrationToUse = tour.narrations.get(language);
    } else {
      narrationToUse = await generateNarration(locationName, lat, lng, language);
    }

    const audioUrl = await generateAndSaveAudio(narrationToUse, locationId, language);

    if (tour) {
      tour.audioUrls.set(language, audioUrl);
      tour.narrations.set(language, narrationToUse);
      await tour.save();

      return res.json({
        message: 'Audio and narration updated successfully for this language',
        narration: narrationToUse,
        audioUrl,
      });
    } else {
      const newTour = new TourDescription({
        locationId,
        locationName,
        lat,
        lng,
        narrations: { [language]: narrationToUse },
        audioUrls: { [language]: audioUrl },
      });
      await newTour.save();

      res.json({
        message: 'Narration and audio generated and saved successfully for this language',
        narration: narrationToUse,
        audioUrl,
      });
    }
  } catch (error) {
    console.error('Operation failed:', error);
    res.status(500).json({ error: error.message || 'Operation failed' });
  }
});

router.get('/narration/:locationId/:language', async (req, res) => {
  try {
    const tour = await TourDescription.findOne({ locationId: req.params.locationId });
    if (!tour || !tour.audioUrls || !tour.audioUrls.get(req.params.language) || !tour.narrations.get(req.params.language)) {
      return res.status(404).json({ error: 'Narration not found for this language' });
    }
    res.json({
      narration: tour.narrations.get(req.params.language),
      locationName: tour.locationName,
      coordinates: { lat: tour.lat, lng: tour.lng },
      audioUrl: tour.audioUrls.get(req.params.language),
    });
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: 'Database operation failed' });
  }
});

router.post('/regenerate/:locationId/:language', async (req, res) => {
  try {
    const tour = await TourDescription.findOne({ locationId: req.params.locationId });
    if (!tour) {
      return res.status(404).json({ error: 'Location not found' });
    }

    const newNarration = await generateNarration(tour.locationName, tour.lat, tour.lng, req.params.language);
    const newAudioUrl = await generateAndSaveAudio(newNarration, tour.locationId, req.params.language);

    tour.audioUrls.set(req.params.language, newAudioUrl);
    tour.narrations.set(req.params.language, newNarration);
    await tour.save();

    res.json({
      message: 'Narration and audio regenerated successfully for this language',
      narration: newNarration,
      audioUrl: newAudioUrl,
    });
  } catch (error) {
    console.error('Operation failed:', error);
    res.status(500).json({ error: error.message || 'Operation failed' });
  }
});

export default router;