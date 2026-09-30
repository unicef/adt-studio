---
id: SPEC-0015
title: Nano Banana image models
status: draft
owner: "@elasticsounds"
approvers: []
issues: ["#579"]
prs: ["#904"]
adr: ""
created: 2026-09-28
updated: 2026-09-29
---

## Problem and goals

[#579](https://github.com/unicef/adt-studio/issues/579) requests Nano Banana as an
image-model option. The existing Google provider supports text/agent calls, but
needs an image backend; image translation must also resolve the selected provider's
credentials instead of requiring OpenAI. The implementation under review in
[#904](https://github.com/unicef/adt-studio/pull/904) spans 26 files, exceeding the
[spec-lane size threshold](../SPEC_DRIVEN_DEVELOPMENT.md#3-choosing-a-lane).

Allow users to select these models for existing image generation, editing, and
image-translation workflows:

| Name | Provider-qualified model ID |
|------|-----------------------------|
| Nano Banana 2 Lite | `google:gemini-3.1-flash-lite-image` |
| Nano Banana 2 | `google:gemini-3.1-flash-image` |
| Nano Banana Pro | `google:gemini-3-pro-image` |
| Nano Banana | `google:gemini-2.5-flash-image` |

## Non-goals

No automatic model switch or migration of user selections. Shipped defaults remain:

- Text: `openai:gpt-5.4`.
- Images: `openai:gpt-image-2`.
- Speech: `gpt-4o-mini-tts`.

No speech-provider changes, new third-party libraries, pipeline stages, prompt-output
contracts, entity IDs, or changes to versioning, staleness, or deletion semantics.

## Proposed design

Catalog-only registration is small (roughly 20 lines) but cannot execute image
requests. Choose a native adapter within the **existing** Google provider (roughly
150 adapter lines plus integration/tests), using the shared `ImageBackend` port and
Google Interactions API. An SDK would add a dependency without removing the need
for credential, caching, and storage integration.

Use existing Google credentials, shared book-local caching, and inspectable call
logs. Cache identity includes the provider/model, prompt, requested size/aspect ratio, and ordered
reference images. Never record keys or unsanitized provider error bodies.

Image translation uses its explicit image-model override, then the configured image
default, then the shipped image default. Resolve credentials before modifying
existing translations. Keep image models out of text/agent selections. Accept PNG
and JPEG output, record actual dimensions, and save with the matching extension;
translation need not force a new size. Validate response status, image payloads,
model-specific reference limits, and requested sizes; support cancellation/timeouts.

Review refinements:

- Export a typed `DEFAULT_GOOGLE_IMAGE_MODEL` alongside the catalog and use it for
  Google's default and manifest capabilities. This does not change global defaults.
- Share `imageFileExtension` from `@adt/types` across generation, translation storage,
  and CLI reference files. Keep the existing PNG fallback for absent/unknown MIME
  metadata; naming is separate from output validation and never converts bytes.
- Fully decode generated PNG/JPEG data before caching or saving, reusing `pngjs`
  and `jpeg-js` already present in the repository (declared directly by `@adt/llm`).
  Return validated dimensions to callers, with no guessed-size fallback. Bound
  decoding to 64 megapixels and JPEG decoder memory to 512 MiB. Unsupported output
  formats fail explicitly; decoder errors may indicate corrupt or unsupported encoding.
  Validate cache hits too, treating unusable entries as misses without promoting
  invalid legacy entries. Successful regeneration replaces the unusable cache result.
- Pass the source width/height ratio for generation, including style-only references.
  Google chooses the nearest ratio in its model-specific list; GPT Image 2 chooses
  valid 16-pixel-multiple dimensions near 1 MP within its 3:1 limit. Other adapters
  retain their existing size fallback. Source edits and translation omit a forced
  size/ratio, preserving reference proportions where the provider supports it.
- Never resize inputs non-proportionally. In storyboard swaps, retain the layout
  box but contain the returned image inside it without stretching or cropping.
  This preserves displayed proportions, not a guarantee that AI preserves all content.

## Impact map

- `packages/types`, `packages/llm`: model catalog/schema, Google image adapter,
  capability discovery, cache/log integration, and JPEG dimension handling.
- `packages/pipeline`, `apps/api`, `packages/storage`: selected-model routing and
  MIME/dimension propagation through existing generation/translation paths.
- `apps/studio`: existing model selectors and effective translation controls;
  all changed copy translated into the five supported locales.
- Images and caches remain book-local; no database migration or new storage root.
  Preserve layering, stable IDs, and key secrecy under [INVARIANTS](../INVARIANTS.md).
  Entity-preservation work (SPEC-0001/0002) and prompt persistence (SPEC-0011) remain
  separate; this addition must not introduce new destructive entity operations.

## Acceptance criteria

- [ ] **AC-1:** All four models are selectable for image workflows, not text/agent
  workflows. Without explicit user selection, all three shipped defaults stay unchanged.
- [ ] **AC-2:** Google image generation and translation work with only Google
  credentials; missing credentials fail before existing translated images are cleared.
- [ ] **AC-3:** Identical requests reuse the book-local cache; changing model, prompt,
  size, aspect ratio, or reference content/order misses it. Calls are inspectable without exposing keys.
- [ ] **AC-4:** PNG/JPEG results retain their actual MIME type and dimensions through
  generation and translation, with matching saved extensions. Existing PNG paths still work.
- [ ] **AC-5:** Unsupported models/sizes, excess references, failed or malformed
  responses, timeout, and cancellation fail clearly without caching an invalid result.
  Unusable legacy/current cache entries are ignored; malformed image bytes are not
  saved or swapped in, even if they have plausible headers or declared dimensions.
- [ ] **AC-6:** Image-model selection persists and honors translation override/default
  precedence; controls describe effective settings and changed copy covers all five locales.
- [ ] **AC-7:** Wide, tall, and nonstandard-ratio generation uses model-appropriate
  sizing. Source edits omit forced sizing, style-only references retain target sizing,
  and swapping a differently proportioned result contains it without distortion/cropping.

## Test plan

- **AC-1, AC-6:** Registry tests; config-default assertions; pipeline translation
  precedence tests; manual Studio selection/save/reload and default-inheritance checks.
- **AC-2:** `apps/api/src/services/stage-runner.test.ts` and `routes/pages.test.ts`:
  Google-only credentials and missing-key preservation regressions.
- **AC-3, AC-5:** `packages/llm/src/__tests__/google-image.test.ts`, `image.test.ts`,
  and registry tests: mocked HTTP, cache identity, sanitized errors, invalid responses,
  reference limits, timeout, and abort. Use fake keys, never live credentials.
- **AC-4:** LLM image, pipeline image-translation, API pages, and storage book-storage
  tests with PNG/JPEG fixtures, including JPEG metadata before the dimension marker.
- **AC-4, AC-5:** `image-validation.test.ts` covers real decoding, corrupt pixel data,
  extended-sequential JPEG, unsupported formats and size limits; image-cache tests
  cover invalid v1/v2 recovery. Types tests cover shared extension aliases/fallbacks.
- **AC-7:** Google and shared image tests cover supported ratios and cache separation;
  API pages tests cover source edits, style references, and proportional swaps.
- **AC-6:** Studio lint and locale extraction/catalog checks. Run `pnpm typecheck`
  and the affected suites before merge; record results separately from this draft.

## Rollout

Obtain maintainer review and product sign-off on this spec before implementation
merge. Split implementation into independently reviewable changes within the
approximately 400-line review budget; land adapter/tests before enabling the UI path.
No automatic config changes. Reverting support preserves saved images; users with
an explicitly selected Google image model must select another supported model.

No blocking design questions remain; acceptance criteria are not yet signed off.
