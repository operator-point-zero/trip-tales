import "dotenv/config";
import axios from "axios";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const getTextProvider = (modelOverride) => {
  const provider = (process.env.AI_PROVIDER || "google").trim().toLowerCase();
  if (!["google", "gemini", "openai", "openai-compatible"].includes(provider)) {
    throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  }
  const model = (
    modelOverride ||
    process.env.AI_MODEL ||
    { google: "gemini-3.8-flash", gemini: "gemini-3.8-flash", openai: "gpt-4o-mini" }[provider] ||
    ""
  ).trim();

  if (!model) {
    throw new Error("AI_MODEL must be set when using an OpenAI-compatible AI provider");
  }

  if (provider === "google" || provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY or AI_API_KEY must be set when AI_PROVIDER is google");
    }
    return { provider: "google", client: new GoogleGenerativeAI(apiKey), model };
  }

  if (provider === "openai" || provider === "openai-compatible") {
    const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("AI_API_KEY or OPENAI_API_KEY must be set for the selected AI provider");
    }
    if (provider === "openai-compatible" && !process.env.AI_BASE_URL) {
      throw new Error("AI_BASE_URL must be set when AI_PROVIDER is openai-compatible");
    }
    const client = new OpenAI({
      apiKey,
      ...(process.env.AI_BASE_URL ? { baseURL: process.env.AI_BASE_URL } : {}),
    });
    return { provider: "openai", client, model };
  }

  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
};

export async function generateText(
  prompt,
  { model, responseFormat, temperature, topP, topK, maxOutputTokens, safetySettings } = {},
) {
  const selected = getTextProvider(model);

  if (selected.provider === "google") {
    const generativeModel = selected.client.getGenerativeModel({
      model: selected.model,
      ...(safetySettings ? { safetySettings } : {}),
      generationConfig: {
        ...(temperature !== undefined ? { temperature } : {}),
        ...(topP !== undefined ? { topP } : {}),
        ...(topK !== undefined ? { topK } : {}),
        ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
        ...(responseFormat === "json" ? { responseMimeType: "application/json" } : {}),
      },
    });
    const result = await generativeModel.generateContent(prompt);
    const text = result.response.text();
    if (!text) {
      throw new Error(`The ${selected.model} model returned an empty response`);
    }
    return text;
  }

  const response = await selected.client.chat.completions.create({
    model: selected.model,
    messages: [{ role: "user", content: prompt }],
    ...(responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(topP !== undefined ? { top_p: topP } : {}),
    ...(maxOutputTokens !== undefined ? { max_tokens: maxOutputTokens } : {}),
  });
  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error(`The ${selected.model} model returned an empty response`);
  }
  return text;
}

export async function generateSpeech(text, language) {
  const provider = (process.env.TTS_PROVIDER || "openai").trim().toLowerCase();
  const model = (
    process.env.TTS_MODEL ||
    (provider === "elevenlabs"
      ? "eleven_multilingual_v2"
      : provider === "google" || provider === "gemini"
        ? "gemini-3.8-flash-tts"
        : "tts-1")
  ).trim();
  const languageVoice =
    typeof language === "string" ? process.env[`TTS_VOICE_${language.toUpperCase()}`] : undefined;

  if (provider === "google" || provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY || process.env.TTS_API_KEY || process.env.AI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY, TTS_API_KEY, or AI_API_KEY must be set when TTS_PROVIDER is google");
    }

    const voice = languageVoice || process.env.TTS_VOICE || "Kore";
    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        model,
        input: [
          {
            type: "user_input",
            content: [
              {
                type: "text",
                text,
                annotations: [
                  {
                    type: "speech_metadata",
                    style: `Clear, natural audio-tour narration spoken in ${language}.`,
                  },
                ],
              },
            ],
          },
        ],
        response_format: { type: "audio" },
        generation_config: { speech_config: [{ voice }] },
        store: false,
      },
      {
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
      },
    );

    const audio = response.data?.steps
      ?.filter((step) => step.type === "model_output")
      .flatMap((step) => step.content || [])
      .findLast((part) => part.type === "audio" && part.data);
    if (!audio?.data) {
      throw new Error(`The ${model} model returned no audio data`);
    }
    return Buffer.from(audio.data, "base64");
  }

  if (provider === "elevenlabs") {
    const apiKey = process.env.ELEVENLABS_API_KEY || process.env.TTS_API_KEY;
    const voiceId = languageVoice || process.env.TTS_VOICE || process.env.ELEVENLABS_VOICE_ID;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY or TTS_API_KEY must be set when TTS_PROVIDER is elevenlabs");
    }
    if (!voiceId) {
      throw new Error("TTS_VOICE or ELEVENLABS_VOICE_ID must be set when TTS_PROVIDER is elevenlabs");
    }
    const baseUrl = (process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");
    const response = await axios.post(
      `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      { text, model_id: model },
      {
        headers: {
          "xi-api-key": apiKey,
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      },
    );
    return Buffer.from(response.data);
  }

  if (provider === "openai" || provider === "openai-compatible") {
    const apiKey = process.env.TTS_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("TTS_API_KEY or OPENAI_API_KEY must be set for the selected TTS provider");
    }
    if (provider === "openai-compatible" && !process.env.TTS_BASE_URL) {
      throw new Error("TTS_BASE_URL must be set when TTS_PROVIDER is openai-compatible");
    }
    const voice = languageVoice || process.env.TTS_VOICE || "alloy";
    const client = new OpenAI({
      apiKey,
      ...(process.env.TTS_BASE_URL ? { baseURL: process.env.TTS_BASE_URL } : {}),
    });
    const speech = await client.audio.speech.create({ model, voice, input: text });
    return Buffer.from(await speech.arrayBuffer());
  }

  throw new Error(`Unsupported TTS_PROVIDER: ${provider}`);
}
