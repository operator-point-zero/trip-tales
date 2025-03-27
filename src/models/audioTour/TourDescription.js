// import mongoose from 'mongoose';

// const TourDescriptionSchema = new mongoose.Schema({
//   locationId: { type: String, unique: true, required: true },
//   locationName: { type: String, required: true },
//   lat: { type: Number, required: true },
//   lng: { type: Number, required: true },
//   narration: { type: String, required: true },
//   audioUrl: { type: String }, // Added audioUrl field
// });

// export default mongoose.model('TourDescription', TourDescriptionSchema);

import mongoose from 'mongoose';

const TourDescriptionSchema = new mongoose.Schema({
  locationId: { type: String, unique: true, required: true },
  locationName: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  narration: { type: String, required: true },
  audioUrls: { type: Object, default: {} }, // Changed to audioUrls object
});

export default mongoose.model('TourDescription', TourDescriptionSchema);