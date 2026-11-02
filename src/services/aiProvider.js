function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

export async function generateText(prompt, options = {}, env = {}) {
  const provider = (env.AI_PROVIDER || "google").trim().toLowerCase();
  const model = (
    options.model ||
    env.AI_MODEL ||
    ({ google: "gemini-1.5-flash", gemini: "gemini-1.5-flash", openai: "gpt-4o-mini" }[provider] || "")
  ).trim();
  if (!model) throw new Error("AI_MODEL must be set for the selected AI provider");

  if (provider === "google" || provider === "gemini") {
    const apiKey = required(env.GEMINI_API_KEY || env.AI_API_KEY, "GEMINI_API_KEY or AI_API_KEY is required");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(options.topP !== undefined ? { topP: options.topP } : {}),
            ...(options.topK !== undefined ? { topK: options.topK } : {}),
            ...(options.maxOutputTokens !== undefined ? { maxOutputTokens: options.maxOutputTokens } : {}),
            ...(options.responseFormat === "json" ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
    );
    if (!response.ok) throw new Error(`Google AI request failed (${response.status}): ${await response.text()}`);
    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
    if (!text) throw new Error(`${model} returned an empty response`);
    return text;
  }

  if (provider !== "openai" && provider !== "openai-compatible") {
    throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  }
  const apiKey = required(env.AI_API_KEY || env.OPENAI_API_KEY, "AI_API_KEY or OPENAI_API_KEY is required");
  const baseUrl = provider === "openai-compatible"
    ? required(env.AI_BASE_URL, "AI_BASE_URL is required for openai-compatible")
    : "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      ...(options.responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.topP !== undefined ? { top_p: options.topP } : {}),
      ...(options.maxOutputTokens !== undefined ? { max_tokens: options.maxOutputTokens } : {}),
    }),
  });
  if (!response.ok) throw new Error(`AI request failed (${response.status}): ${await response.text()}`);
  const result = await response.json();
  const text = result.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) throw new Error(`${model} returned an empty response`);
  return text;
}

export async function generateSpeech(text, language, env = {}) {
  const provider = (env.TTS_PROVIDER || "openai").trim().toLowerCase();
  const model = (env.TTS_MODEL || (provider === "elevenlabs" ? "eleven_multilingual_v2" : "tts-1")).trim();
  const languageVoice = env[`TTS_VOICE_${language.toUpperCase()}`];

  if (provider === "elevenlabs") {
    const apiKey = required(env.ELEVENLABS_API_KEY || env.TTS_API_KEY, "ELEVENLABS_API_KEY or TTS_API_KEY is required");
    const voiceId = required(languageVoice || env.TTS_VOICE || env.ELEVENLABS_VOICE_ID, "TTS_VOICE or ELEVENLABS_VOICE_ID is required");
    const baseUrl = (env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, accept: "audio/mpeg", "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: model }),
    });
    if (!response.ok) throw new Error(`ElevenLabs request failed (${response.status}): ${await response.text()}`);
    return response.arrayBuffer();
  }

  if (provider !== "openai" && provider !== "openai-compatible") {
    throw new Error(`Unsupported TTS_PROVIDER: ${provider}`);
  }
  const apiKey = required(env.TTS_API_KEY || env.OPENAI_API_KEY, "TTS_API_KEY or OPENAI_API_KEY is required");
  const baseUrl = provider === "openai-compatible"
    ? required(env.TTS_BASE_URL, "TTS_BASE_URL is required for openai-compatible")
    : "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/audio/speech`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, voice: languageVoice || env.TTS_VOICE || "alloy", input: text }),
  });
  if (!response.ok) throw new Error(`Speech request failed (${response.status}): ${await response.text()}`);
  return response.arrayBuffer();
}
