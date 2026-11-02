import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import { generateSpeech, generateText } from "../services/aiProvider.js";

dotenv.config();

const router = express.Router();
const probeTimeoutMs = 10000;
const environmentKeys = [
  "PORT",
  "MONGO_URI",
  "JWT_SECRET",
  "CRON_SECRET",
  "BLOB_READ_WRITE_TOKEN",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "AI_API_KEY",
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_BASE_URL",
  "EXPERIENCE_AI_MODEL",
  "NARRATION_AI_MODEL",
  "TTS_PROVIDER",
  "TTS_MODEL",
  "TTS_API_KEY",
  "TTS_BASE_URL",
  "TTS_VOICE",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "ELEVENLABS_BASE_URL",
  "GCS_BUCKET_NAME",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "OSM_NOMINATIM_URL",
  "OSM_OVERPASS_URL",
  "OSM_CONTACT_EMAIL",
];

const makeCheck = async (callback) => {
  const startedAt = Date.now();
  try {
    await callback();
    return { status: "ok", durationMs: Date.now() - startedAt };
  } catch (error) {
    const errorCode = error?.response?.status
      ? `HTTP_${error.response.status}`
      : /^[A-Z0-9_]+$/.test(error?.code || "")
        ? error.code
        : "PROBE_FAILED";
    return { status: "error", durationMs: Date.now() - startedAt, errorCode };
  }
};

const checkTextGeneration = (model) =>
  generateText("Reply with OK.", { model, maxOutputTokens: 5, timeoutMs: probeTimeoutMs });

const checkSpeechSynthesis = () =>
  generateSpeech("Health check.", "en", { timeoutMs: probeTimeoutMs });

const checkNominatim = async () => {
  const response = await axios.get(
    process.env.OSM_NOMINATIM_URL || "https://nominatim.openstreetmap.org/reverse",
    {
      params: { lat: 51.5072, lon: -0.1276, format: "jsonv2" },
      headers: {
        "User-Agent": `TripTales/1.0${process.env.OSM_CONTACT_EMAIL ? ` (${process.env.OSM_CONTACT_EMAIL})` : ""}`,
      },
      timeout: probeTimeoutMs,
    },
  );
  if (!response.data || typeof response.data !== "object") {
    throw new Error("Nominatim returned an invalid response");
  }
};

const checkOverpass = async () => {
  const response = await axios.post(
    process.env.OSM_OVERPASS_URL || "https://overpass-api.de/api/interpreter",
    "data=" + encodeURIComponent("[out:json];node(1);out;"),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": `TripTales/1.0${process.env.OSM_CONTACT_EMAIL ? ` (${process.env.OSM_CONTACT_EMAIL})` : ""}`,
      },
      timeout: probeTimeoutMs,
    },
  );
  if (!response.data || !Array.isArray(response.data.elements)) {
    throw new Error("Overpass returned an invalid response");
  }
};

const checkResend = async () => {
  const response = await axios.get("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    timeout: probeTimeoutMs,
  });
  if (!response.data || !Array.isArray(response.data.data)) {
    throw new Error("Resend returned an invalid response");
  }
};

const getChecks = async () => {
  const checks = {};
  const missingRequired = ["MONGO_URI", "JWT_SECRET", "CRON_SECRET"].filter(
    (key) => !process.env[key],
  );

  checks.requiredConfiguration = missingRequired.length
    ? { status: "error", missing: missingRequired }
    : { status: "ok" };
  const extraTextModels = [
    ["experienceTextGeneration", process.env.EXPERIENCE_AI_MODEL],
    ["narrationTextGeneration", process.env.NARRATION_AI_MODEL],
  ].filter(([, model]) => model && model !== process.env.AI_MODEL);
  const emailCheck =
    process.env.RESEND_API_KEY && process.env.EMAIL_FROM
      ? makeCheck(checkResend)
      : Promise.resolve(null);
  const [database, textGeneration, speechSynthesis, nominatim, overpass, extraTextChecks, email] =
    await Promise.all([
      makeCheck(async () => {
        await connectDB();
        await mongoose.connection.db.admin().ping();
      }),
      makeCheck(() => checkTextGeneration(process.env.AI_MODEL)),
      makeCheck(checkSpeechSynthesis),
      makeCheck(checkNominatim),
      makeCheck(checkOverpass),
      Promise.all(extraTextModels.map(([, model]) => makeCheck(() => checkTextGeneration(model)))),
      emailCheck,
    ]);
  checks.database = database;
  checks.textGeneration = textGeneration;
  checks.speechSynthesis = speechSynthesis;
  extraTextModels.forEach(([checkName], index) => {
    checks[checkName] = extraTextChecks[index];
  });
  checks.blobStorage = process.env.BLOB_READ_WRITE_TOKEN
    ? { status: "ok", verification: "token_configured_only" }
    : { status: "error", errorCode: "BLOB_READ_WRITE_TOKEN_MISSING" };
  checks.nominatim = nominatim;
  checks.overpass = overpass;

  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    checks.email = email;
  } else if (process.env.RESEND_API_KEY || process.env.EMAIL_FROM) {
    checks.email = {
      status: "error",
      errorCode: "RESEND_CONFIGURATION_INCOMPLETE",
      missing: [
        ...(!process.env.RESEND_API_KEY ? ["RESEND_API_KEY"] : []),
        ...(!process.env.EMAIL_FROM ? ["EMAIL_FROM"] : []),
      ],
    };
  } else {
    checks.email = { status: "skipped", reason: "Email integration is not configured" };
  }

  checks.googleCloudStorage = {
    status: "not_used",
    reason: "This backend does not currently use Google Cloud Storage",
  };
  return checks;
};

router.get("/", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(503).json({ error: "Health check authentication is not configured" });
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const checks = await getChecks();
  const environment = Object.fromEntries(
    [...environmentKeys, ...Object.keys(process.env).filter((key) => key.startsWith("TTS_VOICE_"))]
      .filter((key, index, keys) => keys.indexOf(key) === index)
      .map((key) => [key, process.env[key] ? "configured" : "missing"]),
  );
  const healthy = Object.values(checks).every(
    ({ status }) => status === "ok" || status === "skipped" || status === "not_used",
  );

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    checks,
    environment,
  });
});

export default router;
