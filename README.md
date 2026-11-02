# Trip Tales Backend

## Cloudflare deployment

This backend runs as a Cloudflare Worker. D1 stores application data, R2 stores generated narration audio, and a Workers Cron Trigger processes due account deletions every five minutes. MongoDB, Google Cloud Storage, Express, and the Node.js server are not used.

The included D1 migration creates a fresh database. Existing MongoDB records and existing Google Cloud Storage audio are **not** migrated; export/import them separately if they need to be retained.

### Provision the Cloudflare resources

Install dependencies and authenticate with Cloudflare:

```sh
npm ci
npx wrangler login
npx wrangler d1 create trip-tales
npx wrangler r2 bucket create trip-tales-audio
```

Copy the `database_id` returned by D1 into `wrangler.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID`. The R2 bucket name must match the configured bucket.

### Configure secrets and variables

Add secrets with `npx wrangler secret put NAME` (Wrangler prompts for each value):

- `JWT_SECRET`
- `RESEND_API_KEY`
- Text generation credentials: `GEMINI_API_KEY` or `AI_API_KEY`; for OpenAI, `AI_API_KEY` or `OPENAI_API_KEY`
- Speech credentials: `TTS_API_KEY` or `OPENAI_API_KEY`; for ElevenLabs, `ELEVENLABS_API_KEY` (or `TTS_API_KEY`) and `TTS_VOICE` or `ELEVENLABS_VOICE_ID`

Set non-secret values in `wrangler.jsonc` under `vars` or in the Cloudflare dashboard: `EMAIL_FROM`, `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, `EXPERIENCE_AI_MODEL`, `NARRATION_AI_MODEL`, `TTS_PROVIDER`, `TTS_MODEL`, `TTS_BASE_URL`, `TTS_VOICE`, `TTS_VOICE_<LANGUAGE>`, `ELEVENLABS_BASE_URL`, `OSM_NOMINATIM_URL`, `OSM_OVERPASS_URL`, and `OSM_CONTACT_EMAIL`, as applicable. Never commit credentials.

After setting up the bindings and secrets, apply the schema and deploy:

```sh
npx wrangler d1 migrations apply trip-tales --remote
npm run deploy
```

### Local development

Create `.dev.vars` (ignored by Git) with the secrets needed for the features you test. Apply the schema locally and start Wrangler:

```sh
npx wrangler d1 migrations apply trip-tales --local
npm run dev
```

## API and content notes

Text generation and speech synthesis support Google/Gemini, OpenAI, OpenAI-compatible endpoints, and ElevenLabs. `/api/test-ai` and its backwards-compatible `/api/test-openai` alias check the configured text-generation provider.

Experience discovery uses OpenStreetMap's public Nominatim and Overpass services. They are community-operated and rate-limited; configure `OSM_CONTACT_EMAIL` and consider a hosted provider for sustained production traffic. The API returns OpenStreetMap attribution; display it in the client as required by the [OpenStreetMap attribution guidelines](https://www.openstreetmap.org/copyright).

AI-generated narration and map records can be inaccurate or incomplete. Responses include a content note asking users to verify factual claims. Narration audio is served by this Worker from the configured R2 bucket.

Authenticated users can schedule account deletion with `POST /api/auth/delete-account` and cancel during the 24-hour grace period with `POST /api/auth/cancel-delete-account`. Both require an `Authorization` bearer token. A Cloudflare Cron Trigger processes due accounts every five minutes. Account deletion does not cancel subscriptions billed through Apple or Google.
