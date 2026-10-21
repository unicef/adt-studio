# Finding — Recover an extracted figure from a page crop

**Issue:** [#986](https://github.com/unicef/adt-studio/issues/986), a bounded feasibility slice of the broader image-cleaning proposal [#695](https://github.com/unicef/adt-studio/issues/695). Related foundation: #325; alpha preservation: #326.
**Branch:** `elasticsounds/malformed-images-cleanup` (kept as requested).
**Question:** Can a user recover or isolate an extracted figure using generative cleanup of a page crop or a dedicated background-removal model?
**Time box:** 2026-10-19 → 2026-10-20; extended at the user's request for Storyboard synchronization, model switching, and one additional session to implement a dedicated Replicate background-removal comparison route. This remains a feasibility experiment.
**Demo:** local Studio, Extract → a page → **Clean up figure**. Trials used an isolated synthetic demo book (`figure-cleanup-demo`); the temporary demo server has since stopped. Local comparison screenshot: `.context/figure-cleanup-comparison.jpg`.

## What we tried

- Open cleanup from the icon on an Extract image, or **AI Image → Clean up figure** in Storyboard (including its overview). Select a region on the original page, drag its interior to move the whole box, resize from its corners, or enter pixel coordinates. The initial selection uses the image's PDF placement bounds when available.
- Send the server-cropped page region to the configured image model, with editable instructions to retain labels and educational detail while removing surrounding background and unrelated fragments. The bad extraction is displayed for comparison but is not a model reference.
- Switch the model in the cleanup dialog between GPT Image 2.5 Flare and Nano Banana (`google:gemini-3.1-flash-image`). A configured book override remains selectable. The choice applies to this cleanup attempt without changing book settings; the selected model scopes provider credentials, caching, and provenance.
- Compare the original extraction, selected page crop, and generated candidate. Open any image at full size; adjust the crop/instructions and retry, cancel, or explicitly accept.
- Accept into a new `image-filtering` version when the source is in the extraction. In the same transaction, replace every current Storyboard use across pages: nested image leaves, placement keys, and matching HTML image tags. Save new sectioning/rendering versions only where changed; keep layout, text, alt text, and prior versions. Existing captions, text catalogs, and speech survive, while downstream pipeline steps become stale. No Storyboard rerun is needed.

The prototype uses the provider registry and `generateImageWithCache`; no dependencies, database migration, or pipeline steps were added. PNG/JPEG outputs keep their returned format and validated dimensions. Inputs, source crops, candidates, provenance, and model logs remain inside the book. Candidate files have unique IDs and exclusive writes. An `image-cleanup` node records source image, operation, input source, optional pixel region, prompt, model, candidate, timestamp, and accepted extraction version (nullable for Storyboard-only images). Older cleanup candidates remain readable. Acceptance checks that the extraction version has not changed and that no pipeline step or background task is running; duplicate acceptance is idempotent. Storyboard resolves the source page from the image catalog, including images reused across pages. Unsaved local Storyboard edits must be saved or discarded before cleanup.

## What we learned

### Model selection update (2026-10-20)

The user clarified that “Spark” meant `openai:gpt-image-2.5-flare`. Workspace,
demo, shared fallback, and provider defaults now use Flare for cleanup and the
existing Storyboard AI image tool; explicit per-book model overrides still apply.
The OpenAI adapter also supports Flare's target aspect ratio for new images.
Cleanup size and quality remain automatic.

The October 20 follow-up adds an explicit model selector to the shared Extract/Storyboard cleanup dialog. Model routing and cache separation are covered with mocked OpenAI and Google responses; no live Nano Banana cleanup trial has been run. The image wrapper does not expose sufficient usage data to report exact cost per cleanup, so latency is recorded without an invented price.

The follow-up synthetic trial took **9.641 seconds** for a fresh Flare call and
returned a 1430 × 1100 PNG. Accepting from Extract immediately updated the existing
Storyboard image. Repeating the same crop and prompt from Storyboard took **56 ms**
inside the image wrapper, reused the cache, and accepted into another new version.
This is one call per model, not a comparative speed benchmark. Browser dragging
moved the box without changing its dimensions. Screenshot:
`.context/storyboard-cleanup-tool.jpg`.

### One live synthetic trial

The fixture is an 800 × 1000 page with a labeled flower, a pale green background, and a deliberately partial 117 × 156 extraction. The selected source region was 650 × 500 pixels.

| Observation | Result |
|---|---|
| Model | `openai:gpt-image-2`, existing configured server credential |
| Model request duration | 18.485 seconds, about 19 seconds for the route |
| Output | 1431 × 1099 PNG |
| Background | Green page background removed; replaced by white |
| Alpha | 0 of 1,572,669 pixels had alpha below 255: **not a transparent cutout** |
| Labels | All four readable labels retained: Petal, Seeds, Leaf, Stem |
| Fidelity | Overall figure retained, but fine drawing details changed visibly (including the seed dots); not pixel-preserving extraction |
| Browser acceptance | New extraction version displayed; original successfully restored through version history |

This is feasibility evidence on one synthetic diagram, not a measured success rate on textbooks. Actual tiled raster images, complex vector diagrams, scans, small text, and multiple languages have not been evaluated.

### Initial verification

- `pnpm typecheck` — passed.
- `pnpm lint` — passed, with eight pre-existing unused-suppression warnings elsewhere.
- `pnpm --filter @adt/studio extract` — zero missing translations in all five locales. `pnpm --filter @adt/studio compile` also passed.
- `env -u OPENAI_API_KEY -u GOOGLE_API_KEY -u GEMINI_API_KEY pnpm exec vitest run apps/api/src/routes/image-cleanup.test.ts` — 15 passed. Covers actual page cropping, cache reuse, inspectable logs without keys, immutable candidates, acceptance/history, downstream preservation, conflicts, invalid JSON/coordinates, missing selected-provider credentials, path escapes, symlinks, and corrupt model output.
- Existing `pages.test.ts` — 88 passed with inherited credentials removed. The first run had two failures because tests expecting no OpenAI key inherited a configured server key; one of those tests made an unrelated live image-generation call. No changes were needed to these existing routes.
- Existing `image.test.ts` and `google-image.test.ts` — 54 passed.
- Browser: numeric crop selection, live model generation, three-image comparison, acceptance, and restore verified in Chrome. Later browser-tool calls timed out after a locale hot reload; the live trial had already completed. Pointer dragging, a packaged Electron build, production builds, and representative textbook quality were not verified.
- `pnpm lint:invariants` — unavailable, as the invariant registry documents. No checker was invented for this experiment.
- `git diff --check` — passed.

## Boundaries and recommendation

### Follow-up verification (2026-10-20)

- `pnpm typecheck` — passed.
- `pnpm lint` — passed with the same eight existing unused-suppression warnings.
- Studio `extract` and `compile` — passed; zero missing translations in all five locales.
- 191 focused/regression tests passed across cleanup routes (19), figure replacement (3), pointer selection (3), and existing pages/provider/registry/image suites (166). API tests ran with inherited model credentials removed.
- Tests cover cross-page replacements, preserving edits saved during generation, unchanged neighboring IDs and scripts, placement keys, transactional rollback on write failure, repeated acceptance, active background tasks, and whole-box dragging/clamping/resizing.
- Browser: Extract icon, moving the complete selection, live Flare generation, Extract acceptance visible in Storyboard, Storyboard **AI Image → Clean up figure**, cache reuse, and acceptance into new extraction/rendering versions verified. A later locale hot reload stalled the browser automation tab; API page reads still returned the expected versions.
- `git diff --check` — passed. No packaged Electron/production build or representative textbook quality study was run.

### Model-switching verification (2026-10-20)

- `pnpm typecheck`, `pnpm lint`, Studio `extract` and `compile`, and `git diff --check` passed. Lint retains the same eight unrelated warnings; all five catalogs have zero missing translations.
- **231 tests passed in nine files**: cleanup routes (23), figure replacement (3), region picker (3), cleanup dialog (2), and the existing pages/provider/registry/OpenAI-image/Google-image suites (200). The run used `env -u OPENAI_API_KEY -u GOOGLE_API_KEY -u GOOGLE_GENERATIVE_AI_API_KEY -u GEMINI_API_KEY pnpm exec vitest run` followed by those nine test-file paths.
- The new tests switch OpenAI → Google → OpenAI, check the crop sent to Google, isolate each model's cache, retain model provenance, leave book settings unchanged, reject malformed model IDs and missing selected-provider credentials, and check the dialog's default/selection/retry behavior.
- This final selector change was checked in component and route tests, not a new live browser/provider trial. The earlier live browser flows above remain the feasibility evidence.

### Remaining scope

- This remains an **experiment**, not an implementation PR to merge. It does not complete #695's brush masks, automatic validation, or standalone image-version UX.
- At the user's explicit request, the prototype is published as a draft experiment PR to make the code and finding reviewable. It is not proposed for merge; shipping requires a follow-up spec and smaller implementation PRs.
- Transparent output is not guaranteed by the existing image adapters; JPEG output cannot carry alpha. A transparent-output contract needs a separate design and provider-specific validation.
- An image model can redraw details despite a preservation prompt. A production design should compare segmentation/matting of original pixels against generative edits, and measure label accuracy, boundary quality, and preservation on representative book figures.
- Only one target image is replaced. Other fragments of a tiled extraction remain available for manual pruning. Re-running extraction/filtering may replace the active classification according to the existing pipeline behavior.
- Candidates survive cancellation/dismissal in book-local storage; the prototype does not provide a candidate library or a brush-mask editor. There is no pipeline scheduling lock during generation; acceptance detects active runs, active background tasks, and extraction-version conflicts. Separate browser tabs' unsaved edits are not synchronized.
- Preserve the explicit review step and immutable provenance. A shipping spec must cover the synchronized replacement and rollback experience: each affected extraction/sectioning/rendering version can be restored independently; a single coordinated rollback action is not implemented.

- [x] Recommend a follow-up spec for #695, informed by a representative quality trial and a decision on transparent cutouts versus regenerated figures.
- [ ] Archive the idea.
- [ ] Extend this time box.

The local context map corrections made during this session update Lingui to v6 and correct the API/router/stage-runner paths encountered while tracing the implementation.

## Replicate alternative (2026-10-20)

The user requested a choice between generative cleanup and [851-labs/background-remover](https://replicate.com/851-labs/background-remover/api). The shared cleanup dialog now offers **Clean up with AI** and **Remove background** in Extract and Storyboard. Removal defaults to the current image and also supports a selected page crop. The current-image path does not require a page render or a generative prompt. Both paths preserve the explicit preview/accept flow, immutable candidates, cached calls, and synchronized Storyboard acceptance. A checkerboard makes transparency visible in the comparison.

The Replicate adapter is limited to this model, pinned to version `a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc`. Its [versioned input schema](https://replicate.com/851-labs/background-remover/versions/a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc/api) specifies `background_type: rgba`, `format: png`, `threshold: 0` (soft alpha), and `reverse: false`; these are fixed for this experiment. The adapter uses the [HTTP prediction API](https://replicate.com/docs/reference/http), waits synchronously then polls if necessary, and downloads the returned PNG immediately into the book. It accepts PNG/JPEG inputs up to 5 MB and bounds output downloads to 20 MB. Actual PNG decoding happens before cache/storage; there is no white-background flattening.

Configure the token in **Settings → AI providers → Replicate**, or set `REPLICATE_API_TOKEN` on the server. The manifest adds a namespaced credential header and integrates with the existing local credential store. Tokens and signed output URLs are not logged. Downloads are restricted to HTTPS `replicate.delivery` hosts with redirects disabled; prediction polling/cancellation uses a fixed API origin. Cancellation attempts to stop a known prediction, while `Cancel-After` bounds runs when the initial creation response is interrupted before its ID is known.

Verification for this extension:

- `pnpm typecheck` passed. `pnpm lint` passed with the same eight unrelated warnings. Studio `extract`/`compile` passed; zero missing translations in all five locales. `git diff --check` passed.
- **123 tests passed across six files**: cleanup routes, Replicate image adapter, provider registry, provider routes, cleanup dialog, and provider settings. Credentials were removed from the test environment. Coverage includes the current-image and page-crop paths, provider routing, fixed RGBA parameters, polling, cancellation, failure/redirection/URL checks, bounded output, credential isolation, immutable storage, cache reuse, and Storyboard acceptance.
- Browser-checked the method switch, current-image preview, page-crop controls, missing-token feedback, and the Replicate settings entry. Screenshot: `.context/replicate-background-removal.png`.
- **No live Replicate prediction was run: no token was configured in the test environment.** Foreground/label fidelity, actual alpha coverage, latency, and cost remain unmeasured for this alternative. Full-suite, production, and packaged Electron verification were not rerun for this extension.

Recommendation remains a production spec after representative trials. This alternate method supplies a comparison path; it does not establish that background removal will preserve detached labels, thin lines, or every educational detail.

### Billing-error follow-up (2026-10-20)

Four real background-removal attempts in the user's book logs were rejected by Replicate with **HTTP 402 Payment Required**, in 78–816 ms. The adapter recorded the HTTP status, but the API's generic error handler hid it behind “Internal server error.” The observed blocker is Replicate account billing; the user needs to check the token's account credit balance and billing settings. Replicate documents that depleted [prepaid credit](https://replicate.com/docs/topics/billing/prepaid-credit) prevents new work from starting.

The adapter now emits the typed `payment-required` error, which the API returns as HTTP 402 with `provider: replicate`. Studio translates the billing guidance in all five locales. Provider response bodies and credentials remain excluded from client errors and logs. Failed requests create no candidates and leave extraction/Storyboard versions unchanged.

Verification: `pnpm typecheck`, `pnpm lint` (the same eight unrelated warnings), Studio `extract`/`compile` (zero missing translations), and `git diff --check` passed. **124 tests passed across six files**: cleanup routes, Replicate image adapter, provider registry, provider routes, Studio API client, and cleanup dialog. Tests replay the observed HTTP 402 and check safe actionable errors, failure logging, no cached result, unchanged images/versions, and client localization. Credentials were removed from the test environment with the same `env -u` flags as the prior run. No additional live prediction, browser trial, full suite, production build, or Electron build was run for this fix; a successful live Replicate result remains unverified.
