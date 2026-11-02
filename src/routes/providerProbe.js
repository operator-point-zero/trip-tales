import dotenv from "dotenv";
import express from "express";
import { generateSpeech, generateText } from "../services/aiProvider.js";

dotenv.config();

const router = express.Router();
const timeoutMs = 8000;

const runProbe = async (probe) => {
  const startedAt = Date.now();
  try {
    await probe();
    return { status: "ok", durationMs: Date.now() - startedAt };
  } catch (error) {
    const errorCode = error?.status
      ? `HTTP_${error.status}`
      : /^[A-Z0-9_]+$/.test(error?.code || "")
        ? error.code
        : "PROBE_FAILED";
    return { status: "error", durationMs: Date.now() - startedAt, errorCode };
  }
};

router.post("/", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(503).json({ error: "Provider probe authentication is not configured" });
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const textProvider = (process.env.AI_PROVIDER || "google").trim().toLowerCase();
  const speechProvider = (process.env.TTS_PROVIDER || "openai").trim().toLowerCase();
  const isGeminiTextConfigured = ["google", "gemini"].includes(textProvider);
  const textModels = [
    ["textGeneration", process.env.AI_MODEL],
    ["experienceTextGeneration", process.env.EXPERIENCE_AI_MODEL],
    ["narrationTextGeneration", process.env.NARRATION_AI_MODEL],
  ];
  const testedModels = new Map();
  const textChecks = Object.fromEntries(
    await Promise.all(
      textModels.map(async ([name, model]) => {
        const effectiveModel = model || process.env.AI_MODEL || "gemini-3.8-flash";
        if (!isGeminiTextConfigured) {
          return [name, { status: "error", errorCode: "GEMINI_TEXT_NOT_CONFIGURED" }];
        }
        if (testedModels.has(effectiveModel)) {
          return [name, { status: "same_model_as_other_check", sameAs: testedModels.get(effectiveModel) }];
        }
        testedModels.set(effectiveModel, name);
        const result = await runProbe(async () => {
          const text = await generateText("Reply with OK.", {
            ...(model ? { model } : {}),
            maxOutputTokens: 5,
            timeoutMs,
          });
          if (!text.trim()) throw new Error("Empty text response");
        });
        return [name, result];
      }),
    ),
  );
  const speechCheck = ["google", "gemini"].includes(speechProvider)
    ? runProbe(async () => {
        const audio = await generateSpeech("Health check.", "en", { timeoutMs });
        if (!Buffer.isBuffer(audio) || audio.length === 0) {
          throw new Error("Empty speech response");
        }
      })
    : Promise.resolve({ status: "error", errorCode: "GEMINI_SPEECH_NOT_CONFIGURED" });
  const speech = await speechCheck;
  const healthy =
    Object.values(textChecks).every(
      ({ status }) => status === "ok" || status === "same_model_as_other_check",
    ) && speech.status === "ok";

  return res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    checkedAt: new Date().toISOString(),
    provider: "gemini",
    checks: { ...textChecks, speechSynthesis: speech },
  });
});

export default router;
