# SPEC-0001 remediation and verification — 20 October 2026

The five confirmed findings from the final readiness review and its independent
whole-branch follow-up are fixed. This report does **not** declare the entire
original specification complete, approve the spec, or certify a release. The
ratified deferrals and designated historical-book acceptance below remain open.
All work is local on `spec/735-per-section-staleness`, the branch of PR #879.
Nothing was pushed and no PR message, metadata change or review request was made.

## Revisions and review

- Starting implementation: `0a4073850e6926c75f70435dfd2866debaf5d595`.
- `3021c271`: changed-input preparation eligibility after Speech fallback.
- `d51ac91e`: active ownership, reading order, assistant identity, source restore.
- `102c6a58`: spec narrative clarifications and verification attribution.
- `7ffc28bb`: merge current develop, `0efe1c2501a478049701fd221ab94fc97cdf50aa`.
- `2bac3534`: existing fixtures now supply valid paired ownership; media assertions
  require actual output rows instead of accepting empty collections.
- Remote PR head remains `91886d5bf96183f59ec06ba0435fdc5386bbc173`, base `develop`.
  No descendant spec branch was imported. A recoverable local ref was retained
  before integrating develop; the integration had no conflicts.

An independent agent reviewed the whole branch against develop, the complete spec,
feedback reconciliation ledger, Note 7 and accepted deferrals. It traced storage,
admission, publication, catalog, ownership, assistant, editor and reader paths. It
found R3–R5 below, then independently reproduced all five repaired failure cases.
Its additional focused runs passed 13 suites / 157 tests, including the merged
runtime sanitization tests and an actual exported-dictionary/runtime-DOM probe.
It also reviewed the five full-suite fixture corrections and caught the vacuous
media assertion before final delivery. The corrected media suite passes 24 tests.
No further confirmed blocker was identified in the agreed implementation scope.
This is a risk-focused review, not proof that every possible state is correct.

## Findings, changes and concrete evidence

| Finding | Resolution | Regression evidence |
|---|---|---|
| R1, P1: an omitted rendering could supply a live ID's text or an image consumer, including first-open baseline acceptance | Filter unresolved/pruned ownership before catalog deduplication and image inventory. Retain raw content/history and omission warnings. Bump packaging format 12 → 13. | `rendered-ownership.integration.test.ts`: absent, contradictory, ambiguous and removed owners, orphan-first duplicate, shared image, baseline, Preview/export, manual/history and reactivation; actual runtime dictionary probe; live Preview below. |
| R2, P2: Speech could stamp an old preparation failure onto changed inputs, making the next Language run skip them | Preserve unchanged failures; a changed basis becomes an unattempted/outdated fallback. Manual speech stays protected. | `preparation-input-change.integration.test.ts`: prompt/model/profile/neighbor changes with real storage/runner and fetch counts; `core-tts.test.ts`: source-context and checked/manual boundaries; live sequence below. |
| R3, P2: incidental saved-array order could disagree with reader order | Sort a copy by section index for catalog authority and Easy Read context. Do not reorder persisted arrays. | Reader/catalog/context regression with reversed saved order and duplicate conflicting data ID; raw history unchanged. |
| R4, P1: assistant creation/update could reuse active or historical text IDs and attach unrelated retained output | Shared spent-ID guard before and after templated rendering; same guard for custom creation and updates. Shared transactional conflict validation rejects newly divergent text. Image IDs remain shareable. | `assistant-identity.integration.test.ts`: active/retired/duplicate/render-invented collisions, local edits, harmless existing conflicts, fresh IDs/shared images, atomic rollback and manual translations. Actual renderer fetch boundary included. |
| R5, P2: restoring a source version could reinterpret an inferred rendering owner and rekey its answers | Persist uniquely resolved ownership from the pre-edit snapshot in the existing source transaction before moving the version pointer. | Actual restore route/SQLite regression: invalid-version rollback, old-tree omission, original owner reactivation, unchanged raw history and manual answer translations. |

The spec narrative now explicitly describes changed-input fallback eligibility,
omission before active catalog/inventory construction, reader order, pre-edit
ownership on restore, and new activity/assistant ID admission. These clarify the
existing contract; acceptance criteria and approval state were not weakened.
The narrow legacy leaf match remains an assumption, not historical proof. It does
not repair contradictory or ambiguous ownership, certify freshness, or start AI.

## Real UI evidence and production differences

Used built Studio with the real Hono API, worker, SQLite/filesystem and production
pipeline/client code. Six isolated representative historical books were seeded;
the seventh was created through the wizard. Subsequent tested mutations used the
real UI. External provider fetch was intercepted at the transport boundary; no
real provider spending occurred. A fake key was entered for this local origin and
cleared afterward. Caption latency and a live writer lease were controlled test
conditions, not product changes. Temporary global speech guidance was restored
exactly to committed content before the final Desktop build.

| Journey | Observed result | Difference from production / limit |
|---|---|---|
| Omitted legacy rendering before a valid owner with the same text ID | Preview showed owned English `Visible live text`, preserved manual French `Texte manuel visible`, and disclosed the omitted rendering. Web Export completed with the disclosure. | Synthetic historical ownership shape; small placeholder image. Export download was not recovered for a new browser-download assertion. Actual package/dictionary/runtime tests pass independently; the five prior downloaded worked-example ZIPs remain October 18 evidence. |
| Failed preparation → changed profile Save → Speech → Language → repeat Speech | Save made zero calls. Speech made one audio call and no preparation call, with `outdated` fallback. Language made exactly one preparation call and became ready. Repeat Speech made no new call; audio entries/files were identical. Original failed preparation remains version 1. | Stubbed HTTP 400 preparation rejection and valid PCM tone. Verifies decisions, caching, persistence and UI disclosure, not voice quality or provider outage classification. Prompt/model/neighbor variants are automated real-storage tests, not repeated UI variants. |
| Caption entered while a previous save is in flight | With a 30-second request delay, the newer draft remained after the first response, stayed saveable, then persisted as v4 and survived reload. Other page stayed v1. | Controlled local request latency. Original, first draft and in-flight saved version remain in history. |
| Concurrent glossary editors | Both opened v1. First save returned 200 and persisted v2; stale save returned 409, displayed a conflict toast and retained its draft. | Live UI exercises definition editing. Renaming is not exposed by this UI; rename/ID preservation remains real-route integration evidence. |
| First-open baseline while another writer owns the book | First open created no receipt and did not alter the manual entry. After releasing the real shared writer lease, reload created one receipt and one review version; manual text/source and old history were preserved. | Small copied historical book with missing provenance. No uncertain/dead-owner recovery was inferred from this live-owner scenario. |
| New PDF book → first Extract | Native file picker uploaded repository `raven.pdf`; wizard created `spec0001-first-extract`; real PDF extraction completed two selected pages, visible in Extract and SQLite. No “Book not found”. | Fixed-layout preset, pages 1–2. Later metadata request deliberately failed at the unsupported external stub. The whole Extract stage is **not** claimed passed. |
| Source-version ownership restore | Automated route and actual SQLite checks pass. | Current Sectioning UI has no source-version picker, so this route operation was not demonstrated through a fabricated UI control. |

These complement, not replace, the four complete worked examples documented in
[the October 18 report](spec-0001-worked-examples-2026-10-18.md). Those earlier
live sessions and 78 artifact assertions are evidence at their recorded revision;
this report does not relabel them as four new live runs at the final head.

A third same-origin Studio tab caused local HTTP requests to wait before reaching
the API; closing that extra tab released them. Independent source comparison found
the same two persistent SSE subscriptions per book tab on develop and this branch,
with unchanged mounting/cleanup. Six HTTP/1 connections across three tabs are a
plausible cause ([documented browser limit](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events));
no socket trace was captured, so the exact cause is an inference. No branch-added
subscription was found. The two-editor conflict journey completed after closing
the abandoned third tab. This environment observation is not hidden as a pass or
treated as a newly proven regression in SPEC-0001.

## Checks

| Command / check | Result |
|---|---|
| `pnpm install --frozen-lockfile` after develop merge | Passed |
| Initial red regressions | Seven expected failures: three ownership shapes and four changed-preparation-input cases; negative controls passed |
| Focused repair run | Passed, 6 files / 89 tests; independent additional runs described above |
| `pnpm test --maxWorkers=2` (includes build) | Passed, 349 files / 4,300 tests, 273.06 seconds |
| Final media test after strengthening assertions | Passed, 1 file / 24 tests. This test-only change followed the full run; production source did not change afterward. |
| `pnpm typecheck` | Passed, repeated after final test edits |
| `pnpm --filter @adt/runtime typecheck` | Passed |
| `pnpm lint` | Passed, 0 errors / 8 unused-disable warnings; same count/category as pre-change readiness evidence |
| `pnpm --filter @adt/studio extract` | Passed; no catalog diff; all five locales present, zero missing translations |
| `pnpm --filter @adt/studio compile --strict` | Passed |
| Studio production build | Passed |
| `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop build:unpack` | Passed for macOS arm64 with ad-hoc signing; notarization not run |
| Packaged Desktop API smoke on a copied worked-example book | Passed: book read, two page image inventories, 86 output rows |
| Working-tree and whole-branch `git diff --check` | Passed |
| Dedicated invariant command | No such repository script exists. Storage/versioning/admission/asset invariants are covered by the named tests. |
| Clean Docker `app` target | Blocked: Docker 29.8.0 runs, but VM reports 139.0G total / 135.5G used / 0 available / 100%. No pruning performed. |
| Signed installers, Windows/Linux packages, real-provider speech quality | Not run; no release certification claimed |

The first full run exposed 34 failures in five fixtures that no longer represented
owned rendering. The fixtures were repaired without removing their assertions;
the dedicated unresolved-owner and conflict regressions remain. Independent review
checked those corrections and required nonempty media rows. They are not described
as pre-existing production failures or suppressed to obtain the green result.

## AC-to-evidence disposition

“Passed” is bounded to the agreed PR scope and evidence in the second column.
The last column explicitly prevents that label from claiming deferred behavior or
unperformed acceptance. No confirmed finding R1–R5 remains failed.

| AC | Verified PR behavior | Remaining original-contract / acceptance limit |
|---|---|---|
| AC-1 — Passed | Cosmetic saves, unchanged outputs and zero calls; full suite and prior complete UI Example 1. New profile Save also made zero calls. | No-op Save optimization remains deferred. |
| AC-2 — Passed | Scoped changed-text/review/preservation regressions and prior complete UI Example 2, including unchanged audio. | Not every provider/language combination exercised live. |
| AC-3 — Passed for configured scope | Inventory/shared references/new-image and protected outputs; prior complete UI Example 3. | Enabled image-translation UI variant not run in this round. |
| AC-4 — Passed for active identity contract | R1/R3/R4/R5 regressions, old/new ownership and prior complete UI Example 4. | Positional historical activity carry-over, pruned-leaf ownership and blank-drift recovery remain deferred. |
| AC-5 — Passed | Canonical signature/config/context tests plus changed-profile UI. | No media-byte freshness claim; unchanged media ID with changed pixels is an accepted limitation. |
| AC-6 — Passed | Usable warned inputs continue; missing inputs isolate affected work; full suite and worked examples. | Provider-wide systemic classification is separate. |
| AC-7 — Passed for implemented compatibility/review slice | R1 baseline exclusion, R4/R5 manual/history protection, live busy retry/caption/glossary drafts, prior review actions. | Original historical-book acceptance and unresolved ownership repair remain pending/deferred. |
| AC-8 — Passed for cache/retry behavior | Actual fetch counts, unchanged repeated Speech, existing retry/cache regressions. | Representative large-book measurement/projection caching not run and deferred. |
| AC-9 — Passed | Shared admission/concurrent publication tests, live busy lease and two-editor 409. | Uncertain-owner recovery deferred. |
| AC-10 — Passed for preservation | Actual filesystem failure/cancel/partial-publication regressions and unchanged prior media. | New-audio-before-highlighting publication remains #958. |
| AC-11 — Passed for restore/history | R5 atomic source restore and prior physical audio/timing restoration tests. | Source restore has route evidence, not a current UI picker. |
| AC-12 — Passed for exercised reader/output behavior | R1 actual runtime/package test, live English/French Preview and export task, prior downloaded worked examples. | Designated original books and fresh browser-download proof for the R1 fixture remain pending/not run. |
| AC-13 — Passed for fallback slice | Requested-language/manual protection tests and live failed→outdated→ready sequence. | Provider-wide classifier remains SPEC-0013/#889; original full criterion is not delivered here. |
| AC-14 — Passed | R2 prompt/model/profile/neighbor transport regressions, unchanged failure/audio reuse and live changed-profile sequence. | Checked/manual variants automated; no speech quality claim. |
| AC-15 — Passed for existing inline actions/disclosure | Ownership warnings, baseline omission, status/review regressions and prior complete UI review flows. | Bulk review endpoint remains deferred. |
| AC-16 — Passed for tested scope | Existing exclusion/skip/cancel tests and prior live prune/reopen/restore examples. | Every cancellation race was not repeated through UI. |

## Outstanding scope and acceptance

The full original specification is **only partially delivered**, as already
ratified in review. These 15 deferrals remain: uncertain lease recovery;
new-audio-before-timings publication; systemic preparation classification;
large-book measurement/projection caching; no-op Save optimization; server quiz
plan; ownership claim/repair; positional activity-ID carry-over; pre-schema-14
compatibility; pruned-leaf ownership; bulk review endpoint; unassigned sign videos;
Storyboard caption editing/mirroring; stale-page Storyboard selection; historical
blank-drift recovery. Thirteen local follow-up drafts group these obligations;
filing is due at merge and has not been represented as done. This work does not
silently pull those separately assigned changes back into this PR.

De-codable pg006 remains assigned to elasticsounds. Frankenstein final acceptance,
the original ancientegypt-2 retest, and the named integration approval are pending.
Tanzania doctor and clean Docker `app` verification remain release gates. Spec and
INDEX remain in review, and applicable proposed ADRs remain proposed.

Confidence is high in the five focused fixes because the original failures now
pass independently with persistence and transport evidence. Whole-branch confidence
is bounded by the historical-book and release limits above. The next publication
step requires user authorization; no push or completion/review comment is implied.

Local evidence (outside Git): `.local-docs/spec0001-remediation-20261020/` in the
primary checkout, containing the plan, raw command logs, independent report, UI
screenshots, fixture/transport scripts, HTTP call records and persisted assertions.
