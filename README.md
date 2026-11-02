# AI provider configuration

Text generation and speech synthesis providers are configured in the project-root `.env` file; no provider credentials are sent to the client. Set the credentials, providers, and models in that file, then restart the server. Keep `.env` private; it is ignored by git.

## Text generation

- `AI_PROVIDER`: `google` (or `gemini`), `openai`, or `openai-compatible`.
- `AI_MODEL`: default text model used for AI narration and by the `/api/test-ai` connectivity check.
- `EXPERIENCE_AI_MODEL` and `NARRATION_AI_MODEL`: optional model overrides for those narration flows.
- Google uses `GEMINI_API_KEY` (or `AI_API_KEY`).
- OpenAI uses `AI_API_KEY` (or `OPENAI_API_KEY`). For compatible services such as OpenRouter, set `AI_PROVIDER=openai-compatible`, `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`.

The `.env` file is preconfigured for Google with `gemini-1.5-flash`; the default OpenAI model is `gpt-4o-mini`. OpenAI-compatible providers require an explicit `AI_MODEL` and `AI_BASE_URL`.

## Text-to-speech

- `TTS_PROVIDER`: `openai`, `openai-compatible`, or `elevenlabs`.
- `TTS_MODEL`: selected provider's speech model; the `.env` file uses `tts-1` for OpenAI-compatible speech; ElevenLabs defaults to `eleven_multilingual_v2`.
- `TTS_VOICE`: provider-specific voice; the `.env` file uses `alloy` for OpenAI-compatible speech. ElevenLabs requires a voice ID via `TTS_VOICE` or `ELEVENLABS_VOICE_ID`.
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