# SPEC-0001 four worked examples — real UI acceptance

All four worked-example sequences were exercised through the actual Studio UI,
API, worker and book storage, with the variants described below. This closes the
four-example walkthrough gap in the [17 October report](spec-0001-finalization-2026-10-17.md).
It does **not** complete the original full specification: the ratified Note 7 D
deferrals, designated historical-book acceptance and release limits remain.
Human approval is pending. No push, PR comment, description edit or review request
was made in this round.

## Revision and correction

Started from local `30b01555f429cdb5f28d82528cee1b01eb83708f` on the existing
`spec/735-per-section-staleness` branch. The only new runtime change is
`9ac5bce1` — `fix(captions): include active referenced images in page discovery`.
GitHub was not refreshed during this UI round; the prior report's feedback ledger
and remote-head snapshot remain dated evidence, not a claim about newer feedback.

Example 3 exposed a real integration defect: the catalog found a glossary-only
image and showed its missing caption, but Captions hid its page because page counts
read only old `image-filtering` output. Page discovery now unions those retained
extraction IDs with available active references from the shared image inventory.
It deduplicates shared images and respects pruning; it does not create captions,
rehash media or call providers. The inventory scan uses a synchronous read snapshot;
this does not make the entire pre-existing page-list response one snapshot.

The new real-storage regression failed before the fix (expected two images, got
one). The corrected page-route suite passed 94 tests. Independent review found no
actionable defect, ran 10 page-list tests, and separately probed shared, missing,
escaping and pruned assets, unchanged persisted metadata, and zero media reads or
provider calls. Its synthetic 120-page requests took 28–47 ms, including 16–25 ms
for inventory. This is not a large real-book performance certification.

## Environment and production differences

Chrome used a built Studio SPA on port 5321 and the real API on port 4321. Eight
isolated journey copies and an unchanged baseline were prepared with real pipeline
stages. Every tested edit, review, run, restore, prune, preview and export was then
performed through the UI. Read-only SQLite/filesystem/catalog inspections supplied
the assertions; setup itself is not counted as a UI journey.

| Fixture feature | Production difference represented | Boundary |
|---|---|---|
| Two owned rendered sections, stable text/image IDs, English and French, generated captions/Easy Read/preparation/audio/timings | Current catalog contracts, complete saved output, neighboring context and unrelated-page preservation | Not a historical provenance or ambiguous ownership fixture |
| Manual French `pg012_tx003` and manual Easy Read neighbor, with saved evidence | Protected corrections alongside generated entries | No claim that every legacy schema is represented |
| Available image assets absent from `image-filtering` and initially absent from rendered HTML | Uploaded/later-attached glossary images; image inventory before caption text | One-pixel PNGs exercise identity and asset plumbing, not image understanding |
| New IDs, retired IDs, shared references, source versions and pruning | Membership changes, reactivation and history safety | Narrow content edits; not every structural editing operation |
| Schema-valid deterministic responses at the external fetch boundary | Actual production prompts, planning, caching, worker publication and persistence | No paid calls; model output quality, live provider reliability and systemic outage classification are not tested |
| Valid PCM tone audio differentiated by text, returned by the transport stub | Real persisted files, decoding, play state, timing and cache reuse | Not intelligible speech; no pronunciation or alignment-quality acceptance |

For the identical Easy Read variant, a punctuation-only source edit regenerated to
the original simplified text. The main Example 2 separately uses the specified
three-to-five edit. Image translation was disabled, so its excluded/not-applicable
state was checked; enabled image-translation generation was not exercised here.

## Observed journeys and evidence

| Example | Real UI sequence and observed result | Persisted/transport/export evidence |
|---|---|---|
| **1 — Cosmetic Storyboard Save** | Changed color, spacing and displayed image size; saved, reopened, previewed and exported. | Exact catalog-status equality; only the rendering changed among original downstream nodes; zero provider calls. Downloaded ZIP contains the changed classes and unchanged text. |
| **2 — One changed text string** | Changed `pg012_tx003` from three to five. Ordinary Speech used warned retained French. Kept the French edit, updated eligible Easy Read/translation, reran Speech, then repeated the run. | Manual French and Easy Read survived. Keep made no calls and retained audio. Only actual changed text consumers synthesized; repeat made zero calls. French Preview and export show the retained reviewed translation. |
| **2 — Edit, replace, fallback and retry variants** | Edited French explicitly, then confirmed replacement. On another copy, preparation failed; Speech used requested-language display text. Checked English `pg012_tx003`; an ordinary preparation rerun did not retry. Explicit retry succeeded for the still-failed English neighbor `pg012_tx004`. Separately, French `pg012_tx003` audio reached the playing state and Mark checked recorded review. An unchanged Easy Read regeneration was followed by neighbor review and Speech. | Replacement changes only the selected translation; Speech changes only its actual consumers. Historical manual versions remain. Failed preparation retains failure evidence and AI provenance after Check; upstream warnings remain distinct. The English-neighbor retry adds one preparation transport call, followed by no new synthesis/timing calls when effective text is identical. French `pg012_tx003` remains failed/checked; it was not the successful retry target. Identical Easy Read audio remains unchanged in both languages. |
| **3 — Glossary definition and image** | Edited `gl001_def` under its existing ID; attached new image; discovered/generated its caption; updated Language and Speech. Selected an existing shared image. Added a manual French definition, changed the English definition again and ran ordinary Language/Speech. Opened Glossary inside Preview and exported. | Stable glossary identity; zero calls on Save. Missing caption is discoverable before text exists. No invented caption translation/audio for glossary-only images. Shared caption reused without calls. Storyboard and Easy Read remain exact. Manual French survives and is used by Speech. Downloaded bundle contains the edited English and protected French definitions. |
| **4 — Delete/add text and image** | Removed `pg012_tx003`; added `pg012_tx009` and `pg012_im007`. Generated new work; restored original rendering through version history; pruned, saved, reopened and explicitly restored. Added a second reference on another page and removed the first. On a separate copy, ran ordinary Language/Speech before the caption existed, then explicitly generated the missing dependencies and speech. Previewed and exported both incomplete and completed states. | Retired IDs disappear from active catalog/work and export, while raw retained collections/history remain available. Restore rechecks signatures and reactivates current retained outputs without provider calls. Shared surviving reference keeps the exact manual French correction. Missing caption blocks only its consumers; the new text completes. After caption generation all applicable new outputs exist. Both downloaded bundles exclude retired text/audio; final bundle includes new caption audio in both languages. |

Across all eight copies, **26 original physical media files per copy remained
byte-identical**. Original English/French audio and timing version-one rows remain
intact. Retention is intentionally distinct from active membership: a raw stored
collection can retain an inactive entry while catalog, work planning and exports
exclude it. No positional reassignment was observed.

The evidence verifier passed **78 assertions** over captured UI checkpoints,
retained versions/assets and downloaded ZIPs. These are post-UI assertions, not an
additional 78 Vitest tests. Actual transport counts are in `ASSERTIONS.json`;
notably Example 1 has zero calls, unchanged Speech repeats have zero new calls,
and explicit preparation retry has one call. Cache claims count outbound fetches,
not mocked helper invocations.

An independent evidence audit reproduced all 78 assertions and checked 136
unchanged original node versions across the eight copies. It also verified new-ID
ownership of translations/audio, retired-ID absence from exported manifests and
the disabled image-translation state. Its retry-target wording correction is
incorporated above. French failed-preparation playback proves reuse of matching
French audio, not fresh French fallback synthesis. This audit did not repeat the
browser walkthrough and is not whole-branch or release certification.

Native Chrome controls completed the Save dialogs and download registration.
All five new ZIPs pass CRC checks and content assertions. Older pending historical
ownership and Momo exports were also saved from their existing dialogs; their
contents remain evidence of the earlier tested revision. Preview redirects were
occasionally paused by browser automation; stopping that debugger and using native
controls loaded the reader. One reload during packaging displayed BOOK_BUSY;
reopening after the package completed succeeded. No product change was inferred
from those automation-induced interruptions.

## Checks on the runtime correction

| Command/check | Result |
|---|---|
| `pnpm test --maxWorkers=2` | **343 files / 4,251 tests passed**, 266.97 seconds. Includes the build pretest. |
| `pnpm typecheck` | Passed. |
| `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed: zero errors, eight existing unused-disable warnings, matching the prior report. |
| `pnpm build` | Passed separately and in pretest. |
| `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop build:unpack` | Passed: macOS arm64, ad-hoc signature, no notarization. Runtime dependency installation required standard registry access. |
| Fresh packaged API smoke | Passed: starts, book listing succeeds, page image counts are 2/1 and catalog outputs load from the completed Example 4 copy. |
| Docker capacity recheck | Official installed Node image, no network: 140 GB total, 136 GB used, zero available, 100%. Combined `app` build remains blocked; no shared data/cache removed. |
| i18n | No Studio strings changed in this correction. Prior extraction/strict compilation remains the five-locale evidence; no new extraction claim. |
| Separate invariant command | None exists. Source review and the relevant repository tests remain the evidence. |

The initial full-test invocation used an extra argument separator and was stopped;
the successful invocation above is the reported result. An initial sandboxed
Desktop dependency install was stopped and rerun with registry access. Neither
interrupted attempt is counted as passing. The packaged API smoke is not live
Electron-window, signed-installer, Windows or Linux acceptance.

## AC-to-evidence disposition

This table supplements the previous report; it does not remove ratified deferrals.

| AC | Status after this round | Evidence / remaining boundary |
|---|---|---|
| AC-1 | Passed | Complete UI Example 1, exact downstream/status equality, zero calls, Preview and downloaded export. |
| AC-2 | Passed | UI Example 2 plus Keep/Edit/Replace, protected neighbor, warned French, context and unchanged-audio variants. |
| AC-3 | Passed for configured scope | UI Example 3, new inventory regression, protected definition, shared image, Preview/export. Enabled image translation not run here. |
| AC-4 | Passed for worked example; blocked for original historical contract | Complete Example 4 plus shared reference/restore/pruning. Positional activity carry-over, pruned-leaf ownership and historical blank-drift remain deferred. |
| AC-5 | Passed (existing automated evidence) | Signature/context suite; UI cosmetic and changed-input controls reinforce it. Entire configuration matrix not repeated live. |
| AC-6 | Passed | Ordinary UI runs continue with warned inputs and isolate missing caption consumers; existing scoped-execution tests. |
| AC-7 | Passed for tested review journeys; blocked for complete historical acceptance | Keep/Edit/Replace/Check and retained versions proven here. Designated original books and ambiguous legacy scope remain pending/deferred. |
| AC-8 | Passed for tested retry/cache behavior; large-book measurement not run | Actual transport counts and repeated UI runs; representative 100-page cost measurement remains deferred. |
| AC-9 | Passed (existing automated evidence) | Shared admission/concurrent publication tests pass in full suite. No new live concurrent-writer journey in this round. |
| AC-10 | Passed for prior-output preservation; publication-order follow-up remains | Original files/timings retained across all copies; existing cancellation/failure tests pass. New-audio-before-highlighting remains #958. |
| AC-11 | Passed | UI source restore plus retained physical bytes/history; existing explicit asset restore/cache-cleanup tests. |
| AC-12 | Passed for these reader/export journeys; original-book acceptance pending | Native Preview and completed downloads/CRC/content assertions. De-codable pg006 and other designated original-book results remain outstanding. |
| AC-13 | Passed for requested-language fallback; blocked for systemic-classifier portion | Controlled preparation failure, French display fallback and retained manual content. Systemic classification remains SPEC-0013/#889. |
| AC-14 | Passed | UI unchanged-failure no-retry, explicit single-call retry, identical-text audio reuse; existing transport regressions. |
| AC-15 | Passed for these inline actions/disclosures | UI review actions, separate upstream/fallback warnings, Preview/export summaries. All possible bulk combinations were not demonstrated; bulk endpoint follow-up remains deferred. |
| AC-16 | Passed for pruning/restore and existing automated contract | UI exclusion through pruning survives reopen and explicit restore. Skip/cancel races remain automated evidence, not new live tests. |

The original specification is still **not fully implemented or accepted**. This
round completes the four worked examples within the currently ratified scope and
fixes the new integration defect they exposed. Remaining live acceptance outside
these examples includes the wizard through first Extract, busy-baseline retry,
rapid captions during an in-flight Save, concurrent glossary rename, and designated
original-book checks. The fifteen Note 7 D obligations and release work remain as
listed in the previous report; this work did not silently absorb or waive them.

## Local evidence

The plan, fixtures, scripts, screenshots, transport/HTTP logs, SQLite checkpoints,
reviewer probes and exports are local-only under
`/private/tmp/spec0001-four-examples-20261017/`. A durable ignored copy is kept at
`/Users/ksokolovic/Development/adt-studio/.local-docs/spec0001-four-examples-20261018/`.
Run `python3 assert-evidence.py` there to repeat the read-only assertions.
Key artifacts: `ASSERTIONS.json`, `assert-evidence.py`, `PLAN.md`,
`independent-caption-inventory-result.json`, `example-*-adt.zip`,
`example-1-preview.png`, `example-2-preview-french.png`,
`example-3-preview-glossary.png`, and `example-4-complete-preview.png`.
