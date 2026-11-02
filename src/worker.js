import { Container } from "@cloudflare/containers";

const CONTAINER_ENV_KEYS = [
  "MONGO_URI",
  "JWT_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "GOOGLE_CREDENTIALS",
  "GCS_BUCKET_NAME",
  "AI_PROVIDER",
  "AI_MODEL",
  "AI_API_KEY",
  "AI_BASE_URL",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
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
  "OSM_NOMINATIM_URL",
  "OSM_OVERPASS_URL",
  "OSM_CONTACT_EMAIL",
  "WORKER_CRON_SECRET",
];

export class ApiContainer extends Container {
  defaultPort = 5000;
  sleepAfter = "10m";

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = Object.fromEntries(
      CONTAINER_ENV_KEYS.flatMap((key) =>
        typeof env[key] === "string" ? [[key, env[key]]] : [],
      ),
    );
    for (const [key, value] of Object.entries(env)) {
      if (/^TTS_VOICE_[A-Z]+$/.test(key) && typeof value === "string") {
        this.envVars[key] = value;
      }
    }
    this.envVars.NODE_ENV ??= "production";
    this.envVars.PORT = "5000";
  }
}

export default {
  fetch(request, env) {
    return env.API_CONTAINER.getByName("trip-tales-api").fetch(request);
  },

  async scheduled(_controller, env) {
    if (!env.WORKER_CRON_SECRET) {
      throw new Error("WORKER_CRON_SECRET must be configured for scheduled account deletion");
    }

    const response = await env.API_CONTAINER.getByName("trip-tales-api").fetch(
      new Request("http://container/internal/process-scheduled-deletions", {
        method: "POST",
        headers: { "x-worker-cron-secret": env.WORKER_CRON_SECRET },
      }),
    );
    await response.body?.cancel();

    if (!response.ok) {
      throw new Error(`Scheduled account deletion failed with status ${response.status}`);
    }
  },
};
