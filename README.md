# AI provider configuration

## Deploying on Vercel

The Express API is deployed as a Vercel Function. MongoDB remains the application's database through MongoDB Atlas (available as a Vercel Marketplace integration); this uses the existing MongoDB data and Mongoose models. Vercel Blob stores newly generated narration audio.

1. Import this GitHub repository into Vercel and deploy it as an Express project.
2. Connect an existing MongoDB Atlas cluster through the Vercel Marketplace, or use the existing cluster. Set `MONGO_URI` in Vercel's **Project Settings → Environment Variables** to that cluster's connection string. **Do not create a new empty cluster if you want to keep the current data.** Ensure the Atlas network access settings permit Vercel connections.
3. In the Vercel project's **Storage** tab, create a **public Blob** store and connect it to the project. Vercel provides the Blob credentials to the deployment. For local development, run `vercel env pull` after linking the project and connecting the store.
4. Add the app's runtime environment variables in Vercel for Production (and Preview if needed): `JWT_SECRET`, `CRON_SECRET`, AI/TTS provider keys, and any optional email or OSM settings listed below. `CRON_SECRET` must be a random value of at least 16 characters; Vercel sends it to the scheduled endpoint automatically.
5. Redeploy after setting environment variables. Verify `/` and `/api/test-ai` on the deployed URL.

The protected `GET /api/health` endpoint checks MongoDB, the configured text and speech providers, Nominatim, Overpass, and Resend authentication (when configured). Call it with `Authorization: Bearer <CRON_SECRET>`. It reports environment-variable presence without returning values. Text and speech probes make live provider requests and may incur usage charges; Blob is checked for token configuration only, not by uploading a test file. The Resend check does not send an email. Google Cloud Storage is reported as unused by this backend.

The account-deletion cron runs once daily (`0 0 * * *`) to support Vercel Hobby. Hobby schedules have hourly timing precision; account deletion may therefore happen up to roughly a day after the 24-hour grace period. On Pro or Enterprise, change the schedule in `vercel.json` to `*/5 * * * *` to restore five-minute processing.

Newly generated audio is uploaded to Vercel Blob. Existing MongoDB records are preserved when `MONGO_URI` points to the existing database. Existing audio files and URLs in MongoDB are **not copied** from Google Cloud Storage; keep the old bucket accessible until those files are migrated or regenerated.

Vercel provides the application hosting and Blob storage; MongoDB Atlas is a separate database service connected through Vercel's Marketplace. Do not commit `.env` or credentials.

### Local development

Set the environment variables from the provider configuration below in `.env`, then run:

```sh
npm ci
npm run dev
```

For testing Blob uploads locally, link the Vercel project, connect its Blob store, and run `vercel env pull`.

## AI provider configuration

Text generation and speech synthesis providers are configured in the project-root `.env` file; no provider credentials are sent to the client. Set the credentials, providers, and models in that file, then restart the server. Keep `.env` private; it is ignored by git.

## Text generation

- `AI_PROVIDER`: `google` (or `gemini`), `openai`, or `openai-compatible`.
- `AI_MODEL`: default text model used for AI narration and by the `/api/test-ai` connectivity check.
- `EXPERIENCE_AI_MODEL` and `NARRATION_AI_MODEL`: optional model overrides for those narration flows.
- Google uses `GEMINI_API_KEY` (or `AI_API_KEY`).
- OpenAI uses `AI_API_KEY` (or `OPENAI_API_KEY`). For compatible services such as OpenRouter, set `AI_PROVIDER=openai-compatible`, `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`.

The `.env` file is preconfigured for Google with `gemini-3.8-flash` and Gemini TTS (`gemini-3.8-flash-tts`). OpenAI-compatible providers require an explicit `AI_MODEL` and `AI_BASE_URL`.

## Text-to-speech

- `TTS_PROVIDER`: `google`/`gemini`, `openai`, `openai-compatible`, or `elevenlabs`.
- `TTS_MODEL`: selected provider's speech model; Gemini defaults to `gemini-3.8-flash-tts`, OpenAI to `tts-1`, and ElevenLabs to `eleven_multilingual_v2`.
- `TTS_VOICE`: provider-specific voice; Gemini defaults to `Kore`, OpenAI to `alloy`. ElevenLabs requires a voice ID via `TTS_VOICE` or `ELEVENLABS_VOICE_ID`.
- `TTS_VOICE_<LANGUAGE>`: optional voice override for a language, using its uppercase language code (for example `TTS_VOICE_ES`).
- OpenAI uses `TTS_API_KEY` (or `OPENAI_API_KEY`). An OpenAI-compatible speech API also needs `TTS_BASE_URL`.
- ElevenLabs uses `ELEVENLABS_API_KEY` (or `TTS_API_KEY`); optionally configure `ELEVENLABS_BASE_URL`.

Provider and model values are selected from environment configuration rather than route-level constants. The `/api/test-ai` endpoint checks the configured text-generation provider; `/api/test-openai` remains available as a backwards-compatible alias.

## Places and geocoding

Experience discovery uses OpenStreetMap data through the public Nominatim reverse-geocoding and Overpass API services. These services require no API key; their endpoints can be changed with `OSM_NOMINATIM_URL` and `OSM_OVERPASS_URL` in `.env`. Set `OSM_CONTACT_EMAIL` to identify your application in service requests.

Nearby-place discovery is restricted to named visitor attractions, museums, artworks, viewpoints, cultural institutions, historic and heritage features, notable architecture, religious sites, parks, nature reserves, and protected/national areas. The query does not request general shops, offices, crafts, or industrial places; records carrying those business tags are excluded even if they also have a tourist tag. OSM coverage and tagging vary by region, so no query can guarantee that every site is classified consistently.

The public services are community-operated, rate-limited, and have no uptime guarantee. The backend caches nearby-place results for an hour and spaces Nominatim requests to respect its public usage policy. For sustained production traffic, use a hosted OSM provider or self-host the services. OpenStreetMap coverage varies by location, and photos are returned only when OSM records an image or Wikimedia Commons reference.

The experiences API response includes an `attribution` field. Display it visibly in the client as required by the [OpenStreetMap attribution guidelines](https://www.openstreetmap.org/copyright).

## Factual accuracy

Tour narration uses AI with OpenStreetMap fields or the submitted place name and coordinates as grounding, plus the model's general knowledge to make it sound like a tour guide. Prompts discourage specific unsupported claims and ask the model to flag uncertainty. Each discovered place includes its OSM source link, but the AI does not verify claims against that link or independently research them.

These safeguards reduce but cannot eliminate hallucinations. AI-generated narration and user-submitted place data may be inaccurate; map records may also be incomplete or out of date. Responses include a `contentNote` warning users to verify factual claims. Previously generated source-only tours and narrations are bypassed using versioned keys.

## Narration styles

Generated stops rotate through distinct writing styles (such as curious companion, field notes, museum audio guide, storyteller, thoughtful conversation, and reflective). The selected style is returned as `narrationStyle` and stored with generated tour stops; older cached narrations are bypassed after style changes. This varies the script, not the synthesized speaker voice: TTS voice selection remains controlled by `TTS_VOICE` and its language overrides.

Nearby OSM records with the same normalized name within 50 metres, or the same OSM element ID, are merged before tour selection. Places with linked Wikipedia or Wikidata references may appear in up to two differently themed experiences; other places appear only once. This keeps duplicates down while allowing a sourced landmark to fit more than one tour.

## Account deletion

Authenticated users can request deletion with `POST /api/auth/delete-account` and cancel during the 24-hour grace period with `POST /api/auth/cancel-delete-account`. Both endpoints require `Authorization: Bearer <token>` and use the user ID from the verified token rather than trusting a user ID in the request body. A scheduled job processes due requests every five minutes.

Deletion removes the account, its authored experiences, feedback, ratings, and favorite references. Purchase transaction records are retained with the user association cleared. Deleting the app account does not cancel billing managed by Apple or Google; users must cancel those subscriptions through the store where they subscribed.