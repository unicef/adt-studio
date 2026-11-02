---
id: SPEC-0023
title: Hosted ADT Language and Speech workspace
status: in-review
owner: "@elasticsounds"
approvers: []
issues: ["#1057"]
prs: []
adr: ""
created: 2026-11-02
updated: 2026-11-02
---

## Problem and evidence

An ADT recipient needs to upload a reader ZIP, inspect its language and audio
files, edit or regenerate them, and download the updated reader without installing
Studio or possessing the original PDF/project database. Gemini is the primary TTS
provider. The interface should feel like Studio's Language and Speech views.

Evidence at `develop` / `f2e59a0d2`:

| Existing code | Reuse and gap |
|---|---|
| `apps/studio/src/components/pipeline/stages/speech/SpeechView.tsx:1` | Delegates to `LanguageView`; there is already a shared text/audio interface. Its hooks depend on Studio book/run context. |
| `apps/api/src/routes/text-catalog.ts:56`, `tts.ts:490` | Catalog editing, speech-text editing, audio upload/generation and timestamps already exist, but require Studio book storage. |
| `packages/pipeline/src/core-tts.ts:288` | Preparation includes locale profiles, language normalization, LaTeX speech, caching and preservation of edited speech text. |
| `packages/pipeline/src/catalog-translation.ts:160`, `speech.ts:969` | Translation and audio generation can be reused below the full stage runner. |
| `packages/pipeline/src/packaging/web.ts:709` | Reader exports contain display text, speech text, primary/secondary audio maps and timecodes; they do not contain complete project history/provenance. |
| `packages/pipeline/src/packaging/web.ts:2473` | The offline preloader embeds JSON; editing only loose files can leave offline readers showing old text/audio mappings. |
| `packages/llm/src/providers/gemini/index.ts:1`, `packages/llm/src/speech.ts:500` | Gemini credentials, discovery, synthesis and PCM/WAV handling exist. Model discovery alone does not establish compatibility with newer request formats. |
| `packages/llm/src/speech.ts:105` | Current word alignment calls OpenAI Whisper. A Gemini-only workflow must not claim word-level alignment. |

Open work checked on 2026-11-02: [#700](https://github.com/unicef/adt-studio/pull/700)
adds an OpenAI-only exported regeneration script; [#803](https://github.com/unicef/adt-studio/pull/803)
recovers a whole Studio project from an exported reader. Neither is this hosted
workspace. Coordinate with [SPEC-0018 / #958](https://github.com/unicef/adt-studio/pull/958)
and [#849](https://github.com/unicef/adt-studio/pull/849) on Gemini failure outcomes,
[#926](https://github.com/unicef/adt-studio/issues/926) on new Gemini models/voices,
[#967](https://github.com/unicef/adt-studio/issues/967) on Gemini transcription, and
[#710](https://github.com/unicef/adt-studio/pull/710) / [#697](https://github.com/unicef/adt-studio/pull/697)
on scoped regeneration. Open proposals are not approved dependencies.

## Goals and first-release boundary

- An independently deployable web interface with the same text/audio editing
  patterns, controls and appearance as Studio, backed by shared generation code.
- Upload an exported reader ZIP; browse/download language JSON and audio; edit,
  translate, normalize, synthesize, inspect history and export without a PDF.
- Gemini-first generation using an explicitly selected service key or personal
  key. A Google text model handles translation/preparation; a TTS model handles
  synthesis. These are separate model settings even when they share a credential.
- Preserve stable text IDs, uploaded content, manual work, and rollback history.

Proposed pilot defaults, awaiting product review: **reader ZIPs and invited users
with sign-in**, with private books per user. Full Studio project ZIPs, PDF ingestion,
image translation, image generation, storyboard/layout editing, new glossary/quiz
generation, real-time collaboration, billing subscriptions, voice cloning, and
EPUB/WebPub export are outside this first release. Existing captions, glossary,
quiz and easy-read text IDs remain editable and narratable. Existing reader
images, activities, video and custom styling survive unchanged. Other existing
speech providers may be exposed after Gemini parity; no new provider is introduced.

## Options and decision

| Option | Rough effort and trade-off |
|---|---|
| A. A restricted full Studio deployment | Medium UI work, but still substantial hosted isolation/auth work and reader-to-project recovery. Carries PDF/stage prerequisites the recipient does not need. |
| B. Separate web entry point, shared Studio UI and backend libraries | Larger initial adapter work; bounded product surface and no duplicate provider/normalization engine. Selected. |
| C. Browser wrapper around uploaded regeneration scripts | Small demo, but #700 lacks Gemini/preparation parity and arbitrary uploaded code cannot be the server's execution contract. Not selected. |

These are relative estimates, not delivery promises. Expect multiple PRs across
more than ten files. Each implementation slice stays near the 400-line review
budget; split it further when necessary. Keep the existing branch name for this
proposal as requested by the workspace owner.

### Interface

The flow is **My ADTs → Upload → Languages / Speech → Download updated ADT**.
Use Studio's typography, controls, language selector, page/category filters,
search, selected rows, editable cells, status badges, audio player, settings
drawer and version history. Adapt the current UI into focused reusable frontend
components; do not copy the entire large `LanguageView` into another application.

| Area | Required controls |
|---|---|
| Upload/overview | ZIP drop zone, validation report, title, source language, available locales, text/audio counts, missing/broken references, file inventory and original download. |
| Languages | Source/translation columns, edit/save/discard, add supported language, translate selected/missing/all, visible manual protection and conflict handling. |
| Speech preparation | Display text beside independently editable spoken text; normalization and math toggles; locale profile/guidance; prepare selected/missing/outdated/all; inspect prompt/result and fallback reason. |
| Speech | Locale and narrator selection, playback/download, provider/model/voice and delivery settings, manual audio upload, mute/exclusions, generate selected/missing/outdated/all and retry failed items. |
| Review/export | Per-item progress/errors, cancel, history/restore, changed-file summary, export warnings, updated-reader ZIP download and delete workspace. |

Regeneration controls preview their scope, show protected items separately and
require an explicit replacement decision before replacing them. Settings changes
mark affected outputs outdated; they never launch a paid job automatically.
Use Lingui and the existing five UI locales (`en`, `pt-BR`, `es`, `fr`, `sq`).
Keyboard editing, accessible playback, focus restoration and unsaved draft/conflict
behavior must survive reuse. A raw file inspector renders data as text, not HTML.
Interactive uploaded-reader preview is deferred; text/audio inspection is enough
for the pilot. Reader compatibility is still tested on downloaded exports.

### Application and storage boundary

- Add `apps/language-studio` (React/Vite/TanStack/Tailwind) and a dedicated Hono
  entry point in `apps/api`, registering only the workspace routes below. Do not
  expose the full Studio router or its global config, filesystem or agent routes.
- Share frontend presentation through a frontend-only workspace module when
  extraction is necessary. All server requests use an API client and TanStack
  Query; no pipeline/storage/LLM imports in frontend code. Shared request/response
  schemas belong in `packages/types`, inferred from Zod.
- The API adapts reader catalogs to `translateCatalog`, `prepareCoreTtsCatalog`,
  `generateSpeechFile` and the provider registry. Extract reusable orchestration
  from API routes where needed. Do not manufacture completed Extract/Storyboard
  stages or launch the full DAG. `PIPELINE` remains the stage/step source of truth.
- Store each uploaded book under `BOOKS_DIR/<owner-id>/<server-book-id>/`, including
  upload staging, immutable original ZIP/extracted baseline, existing WASM SQLite
  entity history, settings/profile snapshots, `.cache`, immutable audio blobs,
  job receipts, diagnostics and export snapshots. IDs are server allocated; user
  filenames and original book labels never select directories or ownership.
- Imported catalogs become version 1 without inventing original Studio history.
  Text IDs and locale spellings are retained; canonical aliases are lookup aids,
  not permission to merge conflicting locales. Unknown authorship is protected.
  Missing or ambiguous source language requires selection before translation.
- Imported text, speech and audio remain usable. Their old generation settings
  and freshness are unknown unless validated provenance supplies them. Do not
  label old assets current under the newly chosen model. Bulk replacement needs
  a reviewed scope; newly generated entries use normal signature comparison.
- Every edit, generated result and restore appends an entity version. Existing
  writer admission and guarded saves prevent concurrent jobs or stale editors
  from overwriting current values. Publication switches current references only
  after files and metadata validate; failure/cancellation retains prior assets.

### Import and export contract

Accept a reader root or one enclosing directory with `assets/config.json`,
`content/pages.json`, and `content/i18n/<locale>/texts.json`. Recognize optional
`speech_texts.json`, `audios.json`, `audio_voices.json`, audio files and both
timecode maps. Older readers without speech text can use display-text fallback,
shown explicitly. Missing audio is reported per item; malformed required JSON,
duplicate/conflicting identities and ambiguous roots block import with details.

Inspect the ZIP before and during bounded extraction: reject traversal, absolute
paths, symlinks, duplicate normalized paths, malformed entries and resource-limit
violations. Proposed configurable pilot ceilings: 250 MiB compressed, 1 GiB
expanded, 25,000 files and 20 books / 5 GiB per owner. Enforce aggregate live
storage including history/cache/exports, not just original uploads. Never execute
uploaded scripts, import uploaded modules, load remote asset URLs server-side, or
use uploaded provider endpoints/configuration to select executable behavior.

Display text may contain HTML/MathML because packaging converts LaTeX. Preserve
that display markup. Reuse imported speech text; recover a supported embedded
TeX annotation for math preparation when available. Where math cannot be safely
adapted to the existing preparation contract, request manual spoken text and
show the reason rather than stripping the formula or claiming normalization.
This adapter must have fixtures from actual exported math pages.

Build an export from the immutable baseline plus a validated revision overlay;
do not run the full `packageAdtWeb` and re-render custom pages. Allow changes only
to selected locale text/speech/audio/timecode maps and their new assets, necessary
language/read-aloud/highlight fields in `assets/config.json`, required bundled
interface translations for newly added supported locales, and the recognized
generated `assets/offline-preloader.js`. Preserve unrelated JSON fields and every
other file's bytes. Add-language validates reader support before offering a locale.

Refresh the recognized preloader from the resulting data without evaluating its
uploaded JavaScript. A customized/unknown preloader gets a visible compatibility
failure before export, not a silent replacement. Preserve original reader code,
page order, stable IDs, HTML, activities, images, videos and existing SCORM files.
No new SCORM certification is claimed. Existing original assets remain available
for history; an export references only validated selected outputs. Missing/stale
audio warnings are reviewable before export; stale timestamps are never attached
to a new recording. A failed export never replaces an earlier downloadable one.
Reader downloads exclude credentials, job logs, internal history and caches;
those stay together in the private book directory.

### Gemini, credentials and hosted execution

The operator supplies service keys through deployment secrets (`GEMINI_API_KEY`
and the registry's Google text credential configuration), never source code or
frontend build variables. Users explicitly choose **Use service allowance** or
**Use my key**. A personal key uses the provider's existing credential headers
over HTTPS, stays in browser/process memory only and is never placed in URLs,
localStorage, persisted job records, logs or exports. Do not reuse Studio's
desktop credential-persistence UI unchanged. Invalid personal credentials fail
without silently falling back to the service key. Snapshotted credentials are
isolated per job and discarded on completion; restart requires resubmission.

Default synthesis to Gemini with an operator-configured, integration-tested
model/voice allowlist. Preserve imported voice information without promising it
is available. Validate model/voice/format compatibility before a bulk request.
Do not hardcode a new model based only on its discovery name: Google's current
[speech guide](https://ai.google.dev/gemini-api/docs/speech-generation) documents
Gemini 3.8's verbatim transcript and separate style metadata; the current adapter
uses an in-text performance wrapper. #926 owns that compatibility work. If the
pilot needs those models, that work must land first under its own approved scope.
Never silently substitute provider, model or voice after failure. Default to
validated WAV output for browser playback; preserve other supported imported audio.

Gemini-only synthesis defaults to per-entry audio and sentence-level highlighting.
Word timings and page-batched synthesis remain gated by the current Whisper
dependency; #967 can enable another transcriber later. Keep valid imported timings
for unchanged audio. Changing audio invalidates its timings; alignment failure
does not discard otherwise valid audio or claim fabricated timestamps.

Use shared LLM-call/audio caching with complete ordered inputs, prompt/profile
fingerprints and effective model/voice/settings. Cache and logs stay book scoped.
Show model requests/responses, cache hits and item failures with credential
redaction. Preserve known/unknown cost status; do not invent an exact estimate.
Retries are bounded, respect rate limits and never modify the intended transcript.

Jobs return an ID immediately; progress streams via authenticated SSE and can be
reloaded from a persisted receipt. One writer/job per book, one running generation
job per owner, bounded pending queue and a credential-scoped global limiter are
the proposed pilot defaults. Cancellation stops new requests and prevents late
responses from publishing. On restart, unfinished jobs become interrupted and
can explicitly resume unfinished items; already published results remain intact.
No promise of exactly-once provider billing after an interrupted request.

Invited-user identity comes from a validated identity gateway token (trusted
issuer/audience/signature/expiry); reject missing/forged identity and direct
unauthenticated ingress. Authorize ownership on every list, read, edit, audio,
SSE, job, history, delete and export endpoint. Do not trust a forwarded email
header or a client-supplied owner. Apply same-origin/CSRF controls to mutations.
Service-key generation stays disabled until the operator sets per-owner usage
and global limits; reserve admission before starting parallel calls and count
retry attempts too. BYOK still follows compute/storage/concurrency limits.
Uploaded active content is never served as executable same-origin application
content. Audio endpoints validate MIME; raw files use attachment/text responses.

### API and deployment

Proposed `/api/language-workspaces` routes: upload/list; per-workspace inventory,
catalogs, guarded edits, settings, history/restore, audio upload/playback/download;
scoped translation/preparation/speech/alignment jobs; job status/events/cancel;
export request/download; explicit workspace deletion. Each request has a shared
Zod schema and each mutation names its expected revision. Deletion cancels work
and removes the whole private workspace, including history and cached exports.

Ship a distinct Docker target with the SPA and long-running Node API, HTTPS at
the gateway, a persistent book volume, bundled prompts/config and health checks.
Start with one instance; no distributed worker/queue or ephemeral-filesystem
deployment. A VM or managed container host with persistent disk can run it. The
deployment runbook must state identity setup, secret setup, quotas, volume backup
and restore, and restart recovery. The hosting account, region and domain are
deployment inputs, not credentials to infer from a developer's machine.

## Impact and compatibility

Expected areas: new web app/shared presentation; dedicated API entry/routes and
workspace services; shared schemas; small reusable pipeline/preloader adapters;
Docker/build configuration and browser fixtures. No existing book migration or
reader format replacement is proposed. New workspaces use the existing storage
versioning machinery; public reader files keep their established format.

Invariants affected: book-local data, immutable versions/stable IDs, ordered-input
caching, inspectable model calls without secrets, scoped freshness/protected work
and frontend-to-API layering (registry rows 1, 2, 4, 5, 7, 8). The tests below
enforce these at the new boundary; preserve the existing Studio tests too.
`pnpm lint:invariants` is not currently implemented: use the existing typecheck,
test and lint checks, and add the relevant new contract tests with implementation.
Do not amend the status of SPEC-0001, SPEC-0002 or open Gemini proposals here.

## Acceptance criteria and test plan

All paths/titles below are proposed tests, not verification already performed.
Each implementation test starts with its AC tag; unit/API tests use Vitest and
browser fixtures exercise the real downloaded reader without paid provider calls.

- [ ] AC-1: Current and legacy reader ZIPs import without a PDF/DB, preserve IDs, report missing audio and resolve source locale explicitly.
- [ ] AC-2: Malicious/oversized archives, unsafe references and duplicate paths fail within resource bounds without executing code.
- [ ] AC-3: Users can browse/download files, edit text and speech separately, normalize/prepare math, and translate/add supported locales with Studio-style controls.
- [ ] AC-4: Imported/manual work survives ordinary reruns; reviewed replacement and restore append versions; stale saves and conflicting jobs fail safely.
- [ ] AC-5: Selected/missing/outdated/all generation honors scope, exclusions and narrator slot; unchanged input reuses cache; failed rows keep previous audio.
- [ ] AC-6: Gemini settings are validated; no silent provider/model/voice fallback; Gemini-only generation works without an OpenAI key and reports alignment limits.
- [ ] AC-7: Own-key jobs do not leak keys, cross users or fall back to service billing; usage reservations/limits include retry attempts.
- [ ] AC-8: Cross-owner access is denied for every route including audio, SSE, history and exports; active uploaded content cannot execute on the app origin.
- [ ] AC-9: Jobs reconnect, cancel and recover after process restart; partial results survive and late responses cannot publish.
- [ ] AC-10: Export changes only the allowed files/JSON fields, refreshes offline data and preserves reader pages/activities; changed audio never uses stale timings.
- [ ] AC-11: UI strings cover all five locales; keyboard editing/playback and draft-conflict behavior match Studio.
- [ ] AC-12: Container restart/backup restore retains books; quota rejection is atomic; explicit deletion removes all workspace data and stops work.

| AC | Required test file(s) and tagged test |
|---|---|
| AC-1 | `apps/api/src/services/language-workspace/import.test.ts` — `AC-1: imports current and legacy reader fixtures without inventing provenance` |
| AC-2 | Same file — `AC-2: bounds extraction and rejects unsafe archives and references` |
| AC-3 | `apps/language-studio/src/workspace/Workspace.test.tsx`; `apps/api/src/services/language-workspace/preparation.test.ts` — `AC-3: edits and prepares imported language text including exported math` |
| AC-4 | `apps/api/src/services/language-workspace/history.test.ts` — `AC-4: protects imported work and rejects stale publication` |
| AC-5 | `apps/api/src/services/language-workspace/generation.test.ts` — `AC-5: regenerates only the admitted scope and preserves failures` |
| AC-6 | Same file — `AC-6: enforces Gemini capabilities and separates audio from alignment` |
| AC-7 | `apps/api/src/routes/language-workspaces.test.ts` — `AC-7: isolates credentials and enforces service allowance admission` |
| AC-8 | Same file — `AC-8: enforces ownership and inert uploaded content across the route matrix` |
| AC-9 | `apps/api/src/services/language-workspace/jobs.test.ts` — `AC-9: recovers interrupted jobs without late publication` |
| AC-10 | `apps/api/src/services/language-workspace/export.test.ts`; `apps/language-studio/e2e/reader-export.spec.ts` — `AC-10: round-trips the reader online and offline with only the reviewed overlay` |
| AC-11 | `apps/language-studio/e2e/workspace.spec.ts`, existing Studio language tests, Lingui extraction/lint — `AC-11: preserves accessible localized text and audio workflows` |
| AC-12 | `apps/api/src/services/language-workspace/lifecycle.test.ts`, deployment smoke script — `AC-12: persists and deletes complete private book workspaces` |

## Rollout and review

1. Review this proposal (#1057) and resolve the product defaults below; merge only
   with the required independent human approval and green CI. No application code
   ships in the spec PR. Implementation issues link the approved spec/AC subset.
2. Import/export core and fixtures first (AC-1, 2, 4, 10); then a local, read-only
   web shell showing inventory/audio and downloading the untouched reader. These
   are separate small PRs and provide useful inspection before paid generation.
3. Editing/preparation/translation and shared UI extraction (AC-3, 4, 11), then
   Gemini scoped jobs, playback/uploads, logs and recovery (AC-5, 6, 9). Split each
   into focused PRs; maintain the existing Studio behavior throughout.
4. Ownership, credentials, limits and deployment (AC-7, 8, 12) must pass before
   any hosted pilot is exposed. Exercise current/legacy, multilingual, math,
   manual-audio, secondary-voice, missing-audio and customized-reader fixtures.
5. Operator selects a host and credentials and validates a small authorized live
   Gemini sample before inviting users. Real voice quality, production quotas
   and hosting costs require that live check; mocks do not establish them.

Revert by disabling the dedicated service and restoring the previous image.
Retain the persistent volume and immutable originals; existing Studio and its
books are unaffected. Rollback must never discard user revisions. Release
verification is recorded separately from passing development tests.

## Decisions for product review

Owner for these decisions: @elasticsounds; proposed review date 2026-11-05.
The proposal remains in review until blocking decisions are explicitly resolved;
elapsed time is not approval.

| Decision | Proposed default | Blocking for |
|---|---|---|
| Upload format and parity boundary | Reader ZIP first; text/audio parity as listed; project ZIP and image translation later. | Spec approval |
| Audience and identity | Invited users, private books, validated organizational identity gateway. | Spec approval |
| Service-key policy and storage limits | Explicit service/BYOK choice; configured usage allowance; proposed ceilings above. | Spec approval |
| Gemini model family | Expose only integration-tested models; #926 precedes any 3.8 model availability; sentence-level highlighting until alignment credentials are available. | Generation pilot |
| Hosting account, region, domain and identity issuer | One persistent-volume container deployment; operator supplies these values before rollout. | Hosted rollout |
