---
id: SPEC-0020
title: Figure cleanup and background removal in Extract and Storyboard
status: in-review
owner: "@elasticsounds"
approvers: []
issues: ["#992", "#695", "#986", "#326"]
prs: []
adr: ""
created: 2026-10-21
updated: 2026-10-21
---

## Problem and evidence

PDF extraction can leave a figure clipped, tiled, garbled, partially rendered from
vectors, or surrounded by page background and neighboring content. Manual cropping
cannot reconstruct pixels absent from the extraction or remove a background inside
the crop. Fixing a figure should also update its existing Storyboard uses.

[#992](https://github.com/unicef/adt-studio/issues/992) specifies the validated first
slice of [#695](https://github.com/unicef/adt-studio/issues/695). The experiment
[#986](https://github.com/unicef/adt-studio/issues/986), draft
[PR #987](https://github.com/unicef/adt-studio/pull/987), is evidence, not the
production implementation. Its
[finding](https://github.com/unicef/adt-studio/blob/315c3ef4a/docs/experiments/986-figure-cleanup.md)
records a 9.641-second Flare call and a 56-ms cached repeat on a synthetic labeled
flower. An earlier GPT Image 2 result retained four labels but redrew fine details
and returned opaque white. Four Replicate attempts returned HTTP 402, initially
hidden behind “Internal server error”; billing guidance was subsequently fixed.
The user then confirmed background removal and the final hover controls worked,
and requested this spec. That confirmation is qualitative: Replicate quality,
latency, cost, and representative textbook success rates have not been measured.

## Goals and non-goals

Provide two explicit methods in a shared Extract/Storyboard flow: generative
cleanup from the original page, and dedicated background removal. Let the user
compare and accept a candidate; retain originals, history, authored content, and
all current uses of the accepted figure. Keep paid operations explicit and calls
inspectable. Keep labels and text belonging to the figure in the cleanup prompt.

This slice excludes brush/polygon mask editing, automatic fidelity scoring,
batch cleanup, automatic consolidation or pruning of other extraction fragments,
a standalone image-version editor, coordinated one-click rollback across pages,
and automatic caption/translation/speech regeneration. These remain follow-ups
under #695. This does not fix all extraction/export alpha issues in #326 or
guarantee that a model preserves every educational detail. It adds no pipeline
stage, general-purpose Replicate model catalog, dependency, or external queue.

## Proposed design

### Choice and scope

| Option | Rough implementation cost | Decision |
|---|---|---|
| Continue using existing recrop tools | No new provider or persistence work | Insufficient for backgrounds inside a crop and malformed extraction. |
| Productionize the two-method workflow | Approximately 6–8 focused PRs across shared types, providers, API/storage integration, UI, and tests | Chosen; the prototype already demonstrates the interaction. |
| Full #695 mask editor and image-version graph | Additional canvas/accessibility and storage subsystems; a separate estimate and spec | Deferred; not needed for the validated workflow. |

Estimates are planning ranges, not commitments. The experiment spans 48 files and
about 2,600 added lines including tests/catalogs/docs, so merging it wholesale
would exceed the review budget. Reuse reviewed concepts in smaller implementation
PRs. This proposal applies existing storage, versioning, caching, and layering
decisions; it does not establish a new system-wide invariant or require an ADR.

### Interaction contract

1. **Entry:** Extract reveals the purple cleanup icon only on the hovered image,
   or when the button receives keyboard focus. Disabled controls follow the same
   visibility rule. Storyboard exposes **Clean up figure** in the existing AI Image
   tool, including its overview. Both open the same dialog for the same image.
2. **Method:** **Clean up with AI** is initially selected. **Remove background** is
   an explicit alternative; switching methods does not start a request. Changing
   settings after a preview requires a new candidate before acceptance.
3. **Source:** Cleanup uses a selected region of the original rendered PDF page.
   Background removal defaults to the current image and also offers a page region.
   Current-image removal works without a page render. If the page source is absent,
   explain why page-based cleanup is unavailable and retain the current-image path.
4. **Selection:** Initialize from the source image's placement when known. Map PDF
   bounds through the actual page/render dimensions; do not assume a fixed zoom.
   Drag the interior to move the entire box without resizing, drag edges/corners
   to resize, or use labeled numeric coordinates. Clamp to the rendered page and
   require integer pixel regions at least 16 × 16 before submitting.
5. **Instructions:** The generative prompt is editable and requests the complete
   figure, its labels/text, colors, proportions, and educational detail; remove
   unrelated text, surrounding page background, and neighboring fragments. Ask it
   not to invent, translate, redraw, or repair missing content. This is an instruction,
   not a fidelity guarantee. The selected source crop is the model reference.
6. **Review:** Show current image, selected source crop when applicable, and candidate,
   with full-size inspection and a checkerboard for alpha. Offer **Adjust and retry**,
   **Cancel**, and explicit **Accept cleaned figure**. Explain that acceptance updates
   existing Storyboard uses. Do not represent opaque output as transparent; an opaque
   removal result says no transparent pixels were returned and can still be reviewed.
7. **Feedback:** Show busy/cached/error states and preserve selections for retry.
   Prevent duplicate submits. Closing aborts an in-flight request where possible;
   a late result never changes the active image. A completed dismissed candidate may
   remain book-local but is not automatically accepted or exposed in a new library.

### Models, credentials, and failures

| Method | Provider/model | Effective controls |
|---|---|---|
| Clean up with AI | GPT Image 2.5 Flare, `openai:gpt-image-2.5-flare`; Nano Banana, `google:gemini-3.1-flash-image` | Per-attempt model selector and editable prompt; compatible explicit book defaults remain selectable. |
| Remove background | Replicate `851-labs/background-remover`, pinned below | Current image or page crop; no generative prompt/model controls. |

For cleanup, selection precedence is this attempt → explicit book image default →
explicit global image default → shipped default. The shipped image default becomes
Flare, including the existing Storyboard AI image tool. Preserve explicit saved
settings and never rewrite a book's config when switching a dialog model. Other
consumers of the shared image default retain their normal inheritance. This is an
intentional update to the earlier default-preservation scope of
[SPEC-0015](SPEC-0015-nano-banana-image-models.md), not a text/speech default change.
Unavailable/incompatible models fail with selection guidance; never silently switch
providers or run a text-only model. Reuse the existing Google/OpenAI image adapters.

Replicate version:
`a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc`.
The [versioned model schema](https://replicate.com/851-labs/background-remover/versions/a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc/api)
defines `threshold: 0` for soft alpha, `reverse: false`, `background_type: rgba`, and
`format: png`. Fix these parameters and include the version in cache/provenance.
Configure the token through **Settings → AI providers → Replicate** or server-side
`REPLICATE_API_TOKEN`; use the registry's namespaced credential header. A successful
connection check verifies authentication, not available credit or successful inference.

Validate credentials/capabilities before submitting. Replicate input accepts PNG/JPEG
up to 5 MB; bound downloaded output to 20 MB. Fully decode all outputs and cache hits
under the existing 64-megapixel limit. Store actual MIME/dimensions and matching file
extensions. Generative PNG/JPEG may be opaque; removal must return valid PNG and its
alpha must survive storage, Storyboard, preview, and transparency-capable packaging.

Use a 180-second server timeout, bounded polling after synchronous prediction wait,
and provider cancellation for known unfinished predictions. Use `Cancel-After` to
bound an initial call interrupted before its prediction ID is known. Cancellation is
best effort and does not promise zero billing. Do not automatically retry a paid
creation request after an uncertain network outcome. A user's retry may start a new
billable request; successful cached inputs avoid another provider call.

Return safe, machine-readable failures with localized guidance: missing/invalid
credentials, payment required (HTTP 402), rate limit, invalid/oversized input,
provider failure, timeout, and cancellation. Billing errors link to Replicate billing;
configuration errors point to provider settings. Never expose raw provider bodies,
keys, or signed output URLs. Failed/corrupt results never enter the successful cache.
Show available duration/cache information; show cost only if supported by actual
usage/accounting data, with no hardcoded per-click price.

### Persistence, acceptance, and concurrency

The API owns side effects; replacement transforms in `packages/pipeline` are pure.
Shared Zod contracts live in `packages/types`; Studio uses its API client and TanStack
Query. Retain the prototype's separate candidate and accept endpoints under
`/books/:label/pages/:pageId/image-cleanup`, with `/accept` for publication.

Each attempt records operation, input source, immutable source image ID/hash, page,
optional region in rendered pixels, exact source-copy/crop, effective prompt and
provider/model/version/parameters, output asset ID/MIME/dimensions, timestamp,
expected extraction version (nullable), and cache status. Acceptance adds a new
provenance version recording affected entities and their before/after versions.
Use existing `images/`, image metadata, append-only `node_data`, `.cache/`, and
`llm_log` inside the book. No new database table or destructive migration is planned.
An asset's bytes/ID never change; a cleaned asset has a new ID and parent provenance.
Section/page/quiz IDs and reading order are retained. Existing version restore creates
a new current entity version; a single restore need not undo every affected page.

Candidate creation changes no active extraction/sectioning/rendering. Persist validated
assets and metadata before exposing an accept-ready record; interruption cannot leave
an active reference to a missing file. Cache keys include adapter version, method,
provider/model/version, prompt, effective parameters, and ordered source-image bytes.
Identical successful inputs reuse the call while each candidate retains its own record.
All inputs/results and sanitized failures are inspectable through existing book logs.
Keys remain outside book artifacts. Enforce book containment including symlinks; use
parameterized SQL, a fixed Replicate API origin, and HTTPS Replicate delivery hosts
with redirects disabled before sending download authorization.

Acceptance is one book mutation and database transaction:

- Revalidate candidate ownership, asset existence/integrity, expected extraction
  version, and source membership in the current extraction or current Storyboard.
  Storyboard-only images are supported without inventing an extraction row.
- Exclude conflicting active/queued pipeline and image-edit work. Use the book's
  writer/admission mechanism; a check followed by an unprotected write is insufficient.
  Keep the lock out of provider wait time. Reject conflicts with 409 and reload guidance.
- Read the latest saved Storyboard versions inside the mutation. Replace exact source
  image references across all current pages: image leaves, placement keys, and rendered
  image references. Never replace substrings in text/scripts, similarly named IDs, or
  unrelated books. Retarget image-identity metadata together with the asset reference.
- Create a new extraction version if it contains the source, with the accepted image
  unpruned. Create new sectioning/rendering versions only where references changed.
  Preserve saved layout, text, alt text, caption relationships, other images, and history.
  Carry the existing caption association to the new asset while retaining the old
  association/history; copying that association must not regenerate its text.
  Contain a differently proportioned candidate within the existing layout box without
  stretching/cropping; remove stale responsive sources that would display the old asset.
- Append the acceptance receipt in that same transaction. Any failure rolls back all
  entity changes. Repeating the same acceptance returns its receipt without new versions
  or undoing intervening edits. Competing candidates for a changed source conflict.

Do not rerun Storyboard to show the accepted image. Refresh the affected client queries.
Unsaved local Storyboard edits must be saved or discarded before opening cleanup.
Edits saved while generation runs are retained by reading current versions at acceptance;
later stale saves must conflict rather than undo the replacement. Uncommitted drafts in
other tabs are not merged. Preserve captions, text catalogs, translations, speech, and
their histories; acceptance starts no paid downstream work. Integrate changed image
inputs with SPEC-0001's freshness comparison. Affected retained output may need review;
do not claim it was regenerated or delete it. Steps/order come only from `PIPELINE`.

### Impact and concurrent work

- `packages/types`: cleanup/provenance/error schemas and image defaults.
- `packages/llm`: Replicate image adapter, registry integration, safe errors, cache/logs;
  reuse current image validation and Google/OpenAI support from SPEC-0015 / merged #904.
- `apps/api`, `packages/storage`, `packages/pipeline`: candidate persistence, publication,
  exact reference replacement, book writer integration, and preservation regressions.
- `apps/studio`: shared dialog, region picker, Extract/Storyboard entry points, provider
  settings, typed error presentation; localize all strings in en, pt-BR, es, fr, sq.
- No new pipeline step, book storage root, native dependency, or independent image-version
  graph. Prototype candidates without the new receipt remain readable; acceptance must
  recognize their existing accepted marker and must not replay a completed replacement.
- [INVARIANTS](../INVARIANTS.md) 1, 2, 5, and 7 apply: layering, preservation, freshness,
  and key secrecy. No prompt output schema changes; cleanup is an image-edit instruction.
- Coordinate writer/freshness integration with [SPEC-0001 / #879](https://github.com/unicef/adt-studio/pull/879),
  manual edits with [SPEC-0002 / #880](https://github.com/unicef/adt-studio/pull/880), and
  sectioning/rendering synchronization with [SPEC-0012 / #888](https://github.com/unicef/adt-studio/pull/888).
  These are in review, not approved dependencies. Production publication is gated on
  an approved compatible writer/freshness contract; do not copy the experiment's broad
  downstream step resets as the production policy. If those specs change, amend this one.
- Reuse crop interaction work in [#991](https://github.com/unicef/adt-studio/pull/991)
  where appropriate without modifying other crop modes. Align error presentation with
  [SPEC-0017 / #950](https://github.com/unicef/adt-studio/pull/950) if it lands; this feature
  must already explain provider/billing errors without waiting for a global connectivity UI.

## Acceptance criteria

- [ ] **AC-1:** Extract cleanup appears only on the hovered image or keyboard-focused
  button, including disabled visibility; Storyboard and its overview open the same tool.
- [ ] **AC-2:** Method/source switching sends the correct source; current-image removal
  works without a page render; unsupported page-based cleanup explains the missing source.
- [ ] **AC-3:** Interior dragging moves without resizing; edge/corner and numeric changes
  remain within page bounds at different render scales, including keyboard operation.
- [ ] **AC-4:** Flare/Nano Banana selection reaches the correct provider; precedence,
  preserved overrides, shared shipped default, and unchanged per-attempt config follow
  this spec. Unsupported selection never silently falls back.
- [ ] **AC-5:** Cleanup sends the selected crop and editable preservation prompt; removal
  uses the pinned Replicate version/parameters and its own credential only.
- [ ] **AC-6:** Compare full-size current/source/candidate images with alpha visualization,
  accurate opaque-result feedback, retry/cancel, and explicit acceptance; dismissing or
  generating never changes an active image. Late responses never publish automatically.
- [ ] **AC-7:** Provider input/output limits, real decoding, bounded wait/poll/cancel,
  credential isolation, and actionable typed/localized errors include the observed 402
  regression. Failure creates no successful cache entry or active replacement.
- [ ] **AC-8:** Every candidate and acceptance has immutable book-local assets/provenance;
  historical assets and versions survive success, failure, cancellation, and restart.
- [ ] **AC-9:** Cache identity includes all effective ordered inputs and model/version;
  valid identical requests reuse it, corrupt cache entries are rejected, and logs remain
  inspectable without keys, raw provider error bodies, or signed URLs.
- [ ] **AC-10:** Acceptance updates every current exact source use across pages atomically,
  including Storyboard-only images, preserving layout, proportions, text, alt/caption
  relationships, stable section identities, and unrelated content. No rerender is required.
- [ ] **AC-11:** Active work, changed sources, concurrent acceptance, and stale saves cannot
  overwrite newer work. Duplicate acceptance is idempotent; a mid-publication failure
  rolls back all entity changes; edits saved during generation survive acceptance.
- [ ] **AC-12:** Downstream outputs/history remain available; affected freshness is derived
  through the approved input-comparison contract. Unrelated outputs stay current; no
  automatic generation or destructive clearing occurs on acceptance or ordinary restore.
- [ ] **AC-13:** Each affected entity can be restored through existing version history as
  a new version, including the original extraction. No claim of coordinated rollback;
  old prototype candidates/accepted markers remain readable without duplicate publication.
- [ ] **AC-14:** Path/symlink escapes, cross-book candidates, unsafe delivery URLs, redirects,
  malformed requests, and corrupt/oversized images fail safely before active mutation.
- [ ] **AC-15:** All controls have accessible names, keyboard operation/visible focus,
  announced progress/errors, and complete translations in all five supported locales.
- [ ] **AC-16:** PNG alpha survives acceptance, Storyboard, preview, and supported packaging;
  a representative release trial records actual fidelity/labels/alpha, failures, latency,
  and cache behavior separately for both generative models and background removal.

## Test plan

Paths below are implementation targets; some exist only on the experiment branch.
Every proving test title starts with its AC tag. A table row does not claim a passing
test today. Use fake provider responses in automated tests, with inherited credentials
removed; live calls belong to the explicit release trial.
UI test basenames refer to `apps/studio/src/components/pipeline/components/figure-cleanup/`;
LLM test basenames refer to `packages/llm/src/__tests__/`. The planned browser path
must be wired into the repository's browser test runner in its implementation PR.

| AC | Level / target file | Test title |
|---|---|---|
| AC-1 | Browser, planned `apps/studio/e2e/figure-cleanup.spec.ts` | `AC-1: reveals only the active image control and opens both entry points` |
| AC-2 | UI + API, `FigureCleanupDialog.test.tsx`, `apps/api/src/routes/image-cleanup.test.ts` | `AC-2: selects the correct source with and without a page render` |
| AC-3 | Unit + browser, `FigureRegionPicker.test.tsx`, planned browser file above | `AC-3: moves and resizes a bounded region at actual render scale` |
| AC-4 | Registry/config + UI/API, `registry.test.ts`, `FigureCleanupDialog.test.tsx`, cleanup routes | `AC-4: resolves model precedence without mutating explicit defaults` |
| AC-5 | Adapter/API, `packages/llm/src/__tests__/replicate-image.test.ts`, cleanup routes | `AC-5: submits exact source and method-specific parameters and credentials` |
| AC-6 | UI + browser, `FigureCleanupDialog.test.tsx`, planned browser file | `AC-6: compares transparency and requires explicit acceptance` |
| AC-7 | Adapter + API/client, `replicate-image.test.ts`, cleanup routes, `apps/studio/src/api/client.test.ts` | `AC-7: bounds requests and exposes actionable billing and provider failures` |
| AC-8 | Storage/API, cleanup routes | `AC-8: retains immutable candidate assets and provenance across restart` |
| AC-9 | LLM, `packages/llm/src/__tests__/image.test.ts`, `replicate-image.test.ts` | `AC-9: caches ordered effective inputs and logs safely` |
| AC-10 | Unit/API, `packages/pipeline/src/__tests__/replace-figure.test.ts`, cleanup routes | `AC-10: atomically replaces exact cross-page uses without changing authored content` |
| AC-11 | API integration, cleanup routes and book-writer tests | `AC-11: serializes acceptance and preserves concurrent saved edits` |
| AC-12 | API integration, cleanup routes plus SPEC-0001 freshness tests | `AC-12: retains downstream work and compares only relevant changed inputs` |
| AC-13 | Storage/API/browser, cleanup routes and existing version restore tests | `AC-13: restores a new entity version and recognizes legacy acceptance` |
| AC-14 | API + adapter, cleanup routes, `replicate-image.test.ts` | `AC-14: rejects unsafe paths and output locations before publication` |
| AC-15 | Browser + locale/lint checks | `AC-15: operates by keyboard and announces localized progress and errors` |
| AC-16 | API/output/browser, planned `apps/api/src/routes/image-cleanup-alpha.test.ts`; release trial | `AC-16: preserves transparent pixels through preview and packaged output` |

Use fixtures with a labeled diagram, detached labels/thin lines, a flat background,
a photograph, a clipped/tiled extraction, and a multilingual figure; include transparent
PNG and JPEG, no page render, multiple cross-page uses, manually edited metadata,
and similarly named image IDs. Inject failure after one planned entity write to prove
rollback. Exercise two candidates, two clients, pipeline admission during acceptance,
and a stale save after acceptance. Assert original bytes and prior versions remain.

The release trial runs these six figure categories through Flare, Nano Banana, and
Replicate (at least 18 fresh attempts, plus cached repeats). Record accept/reject and
reasons, missing/changed labels or lines, alpha coverage, dimensions, duration, provider
failures, and measured cost if available. Preserve inspectable examples in test-book
artifacts; no sensitive fixtures in the repo. Owner and reviewer assess the results;
this spec makes no minimum automated quality-score claim. Verify the approved release
build in Studio and Electron; record the build and fixture set before marking verified.

## Rollout and review

1. Review this docs-only proposal; no AC is closed and no implementation is authorized
   by its `in-review` status. Require a non-author maintainer and product sign-off.
   Keep #987 as experiment evidence. The user who prompted this work is its author.
2. After approval, create one issue/PR per slice, near the 400-line review budget:
   shared schemas/defaults and validation (AC-4/8); Replicate provider/errors/cache
   (AC-5/7/9/14); candidate/source API (AC-2/5/8/14); atomic replacement and writer
   integration (AC-10/11); freshness/history compatibility (AC-12/13); shared dialog
   and crop controls (AC-2/3/6/15); Extract/Storyboard wiring and provider settings
   (AC-1/4/7/15); release/alpha evidence (AC-16). Split further if necessary.
3. Land backend prerequisites before enabling entry points. Gate activation on passing
   publication/concurrency/preservation checks and the compatible writer/freshness work.
   No automatic runs, candidate acceptance, config rewrites, or book-data migration.
4. Run affected Vitest suites, typecheck, Studio lint, locale extraction/strict compile,
   browser checks, and the release trial. `pnpm lint:invariants` is currently planned;
   cite the actual invariant checks run rather than asserting it exists.
5. Revert entry-point enablement before reverting supporting endpoints/adapters. Retain
   already accepted image files and entity history; disabling generation must not break
   books that reference them. Legacy candidate records are preserved even without the UI.

No blocking product question is left unspecified: the choices above are proposed for
review, not already approved. @elasticsounds owns reconciliation with SPEC-0001/0002/0012
and the new image default during this review, targeted for 2026-10-26 (three working
days). If dependencies remain unresolved, keep production activation blocked and amend
the rollout; elapsed time is not approval. Implementation and release reviewers remain
to be assigned through normal review; the author cannot supply their own approval.
