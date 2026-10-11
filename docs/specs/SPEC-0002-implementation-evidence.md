# SPEC-0002 implementation evidence

## Independent review and authorized publication — 2026-10-11

The owner requested a fresh review before publishing this same branch, restoring
the original PR description and asking for review in a short comment instead.
The description and title have been restored from the saved pre-edit snapshot.
The no-push notes below describe the earlier handoff, not the current authorization.
SPEC-0002 remains a separate PR stacked on #879 at `a10d3fa0`; it does not need
SPEC-0001 approval or merge to be reviewed. Neither PR is approved by this agent.

This pass started from source, the specification and the actual discussion:
[the four review areas](https://github.com/unicef/adt-studio/pull/880#issuecomment-5776174130)
and [the author's response](https://github.com/unicef/adt-studio/pull/880#issuecomment-5868235633).
There were no submitted reviews or inline review threads. The checks followed
unknown-authorship protection, own/upstream preparation, structural deletion,
stable identity, explicit replacement, stale saves, retained history and output
consumers. The existing green suite was not used as a substitute for that trace.

### Findings reproduced and fixed

| Severity | Reproduction and impact | Correction and regression |
|---|---|---|
| P1 | Edit another field after a 409, then choose either conflict resolution. The conflict snapshot replaced the entire draft and discarded the newer field edit | `961cfe66`: resolve the known conflict against the latest pending draft. Both choices retain later independent edits; `use-guarded-draft.test.tsx` failed before the fix and passes after |
| P1 | Open a Sectioning/TOC confirmation or choose quiz Replace, then receive a background refresh. Submission used the newer version, silently widening consent to work the user had not chosen to replace | `961cfe66`: freeze the displayed work and expected versions for the open dialog. Three component regressions prove stale snapshots remain bound to the original versions so the API can reject them |
| P1 | Store a protected `fr_CA` translation, then save through `fr-CA` with baseVersion 0. The route returned 200 and created a preferred canonical document instead of rejecting the stale guard | `00f34460`: resolve canonical/legacy storage identity before version comparison and publication, matching the runner. Real HTTP/SQLite regression verifies 409/currentVersion, guarded update of the original record and no duplicate document |
| P2 | Remove a source entry, then correct a different active translation before the next Translate run. The full editor round trip carried the untouched removed entry and received an unrecoverable 409 | `00f34460`: allow unchanged retained entries in the round trip while rejecting edits against removed sources. Real-route regression saves the active correction, rejects the removed-source edit and verifies subsequent membership retirement/history |

All four findings were demonstrated by failing tests before production fixes.
On application head `00f34460`, `pnpm test` passed **313 files / 3,916 tests**
(153.34 seconds), including the root pretest build. The focused final command
passed 37 tests across five files, including 21 real-route preservation cases.
Both typechecks, lint (zero errors, the same eight baseline warnings) and catalog
extraction/strict compilation passed; no additional translated strings were
introduced by these fixes. All 3,674 messages remain translated in five locales.
The combined `app` Docker image was rebuilt from the reviewed application and
passed a new runtime smoke: SPA/health, TOC save v4→v5, stale-save 409, completed
real TOC run with v5 still manual/current, five readable historical versions and
the saved title in preview. The disposable container was then stopped. Image
manifest list: `sha256:09caf6651a62aca79f630be84f2203992514a16434e31e2171d91e44f8fdfff9`.
No signed desktop installer, representative-book harness or release-platform
verification is implied. Hosted CI is checked separately after publication.

The four entity implementation slices are present; confidence in that bounded
API/Studio behavior is high after these fixes. This is not full release acceptance
or human specification approval. The AC-2 amendment, easy-read ownership and
full Storyboard-rerun coordination remain explicit, and the unavailable checks
listed in the AC matrix are not promoted to passes by this review. AC-19 still
establishes CLI stamping only.

## Resumed stacked implementation — 2026-10-11

The owner authorized continuing before SPEC-0001 approval/merge. Published #879
is now `a10d3fa0` (test/Docker/i18n CI passed); #880 remains at `d2348233` and
develop at `ef31494d`. Local #880 was rebased onto exactly `a10d3fa0`, retaining
`backup/spec-0002-before-stack-20261011` at `fc2af185`. The newer prerequisite
already contains the audio-manifest regression adjustment; its equivalent was
retained and our duplicate commit omitted. No code is pushed.

The October 10 findings below are historical baseline evidence. They are not the
current dependency verdict. SPEC-0001 now provides catalog protection, shared
writer admission, input/version guards and publication. Its explicit non-goals
leave TOC/quiz/Sectioning protection to this PR. At resume, active-record
invalidation and pre-generation section retirement still needed integration here;
the delivered changes and current results below record that integration.
The earlier SPEC-0002 assumption that SPEC-0001 moved every entity's retirement
to publication is incorrect. Under the authorized stacked plan, extend the
existing preparation/publication paths for these units; do not invent new
freshness or writer-admission mechanisms. Human review remains pending.

Before resumed application edits, the refreshed acceptance map is:

| AC | Current prerequisite / slice behavior | Remaining implementation and verification |
|---|---|---|
| 1 | Translation stamps changed entries and guards target/source versions | Reuse; verify exact/no-op/forged stamping, structured 409 current version |
| 2 | Fixed-window catalog translation and shared selection implemented | Verify full-list stability, ordinary zero calls after correction, controlled cache/provider/cost test |
| 3 | Quiz IDs/options stable; PUT lacks version guard/authorship | Guard, compare content after identity resolution, stamp; real storage races |
| 4 | Full quiz replacement drops protected quizzes | Preserve IDs/options and placement, including no eligible pages; read/catalog/audio tests |
| 5 | TOC field exists; PUT/worker do not stamp | Guarded whole-document save/generation; real HTTP test |
| 6 | Generic confirmation; active TOC invalidated before generation | Named version-bound confirmation, publish only on success; cancel/failure tests |
| 7 | Page field exists; edits do not stamp or guard base versions | Central stamp plus guards on PUT/structural paths; test every operation |
| 8 | Sectioning preparation retires/inactivates pages | Retain records; skip protected pages before calls; publication-time retirement |
| 9 | Catalog protection now exists; other units still invalidated | Six-entity real HTTP save/run/read/history/preview/export chain, own/upstream |
| 10 | Translation has shared manual status; three other badges absent | Reuse label/badge, add appropriate indicators and translated confirmations |
| 11 | Catalog legacy protection exists; whole-record legacy protection absent | Protect unknown quiz/page/TOC, surface unknown labels; compatibility test |
| 12 | Restore retains stored tags and shared writer lease | Add expected-version/running-step checks; restore/rerun/race tests |
| 13 | Structural mutations share page-save helper | Guard/stamp both pages and empty pages; prove moved text occurs once |
| 14 | Catalog membership reconciliation exists; TOC retirement retains source field | Verify removed translation inactive/history and retired TOC entry/history/restore |
| 15 | No named protected-page replacement scope | Extend existing dialog/request with captured page versions, off by default; stale confirmation test |
| 16 | Quiz generation checks cancellation; Sectioning publishes before translation finishes | Per-unit successful publication/retirement, cancellation/partial-failure/version guards |
| 17 | Existing preview/export reads current nodes | Exercise retained manual content through real reader/package paths |
| 18 | Global writer lease and translation guards exist | All affected save/restore/structural guards, structured conflicts, retain drafts and explicit reapply |
| 19 | Catalog DAG already stamps some output | Stamp remaining four persistence paths; test new CLI outputs without claiming CLI preservation |

The map above records the pre-edit plan; current results follow. Easy-read
ownership and full Storyboard-rerun preservation remain coordination gaps, and
the AC-2 amendment remains proposed for review.

## Initial delivery and verification — 2026-10-11

All four entity slices are implemented locally, through Studio, HTTP routes,
workers, real storage, history and preview/export. This is no longer the
schema/helper-only safe slice. **Full-spec acceptance is not complete:** the
representative-book harness, full older-application compatibility and release
verification have not run, and the contract amendments need human review.
No implementation commit has been pushed. The published #880 diff still ends at
`d2348233`; the spec and index remain draft with unchecked acceptance boxes.

Application implementation head: `bc464c9b`, on published SPEC-0001 `a10d3fa0`.
The final acceptance regression commit adds explicit quiz-preview/page-export
checks and restores of manual/unknown provenance. That focused 19-test suite was
rerun successfully afterward. Subsequent documentation commits do not change the
tested application. New coherent implementation commits:

| Commit | Change |
|---|---|
| `61839033` | Shared guarded-save and named-replacement schemas |
| `a8731d2e` | Fixed translation windows and retained correction recovery |
| `13b2b7d1` | Shared run preparation, admission and authored-output protection |
| `f5158f73` | Guarded Studio drafts, conflict choices and named confirmations |
| `03a23cb1` | Translation route, worker, history and transport accounting |
| `d60b283f` | Whole-document TOC protection and confirmed publication |
| `09d8e395` | Protected quiz identities, guarded saves and replacement |
| `bc464c9b` | Whole-page structural protection and publication-time retirement |

### Verified commands and observable results

Commands ran from the isolated checkout. Git and checks involving Git used
`DEVELOPER_DIR=/Library/Developer/CommandLineTools`; the machine's default Xcode
selection otherwise exits at its license gate. Raw logs and UI screenshots are
local, ignored artifacts in `tmp/spec-0002-evidence` beside this checkout.

| Check | Result and limit |
|---|---|
| `pnpm test` | **Passed: 312 files, 3,909 tests**, 152.59 seconds; includes root pretest build. Final run includes conflict-callback and in-flight draft regressions |
| `pnpm typecheck` | Passed after the final application changes |
| `pnpm --filter @adt/runtime typecheck` | Passed; this package is excluded from root typecheck |
| `pnpm lint` | Passed: zero errors, eight existing unused-disable warnings, matching the recorded baseline |
| `pnpm build` | Passed through the full-suite pretest; this is a development build |
| `pnpm --filter @adt/studio build` | Passed after the final draft-retention fixes; bundle-size warning remains |
| `pnpm --filter @adt/studio extract` | Passed: 3,674 messages per locale, zero missing in es/fr/pt-BR/sq; all five changed catalogs committed |
| `pnpm --filter @adt/studio compile --strict` | Passed for all five final catalogs |
| `pnpm exec vitest run apps/api/src/routes/manual-edit-survival.test.ts` | Passed: **19 real HTTP/SQLite survival, conflict, cancellation, failure and publication cases**. All 19 passed in the full suite; final strengthened restore/preview/export assertions passed in the focused rerun at `5871ea24` |
| `node scripts/probes/spec-0002-foundation.mjs` | Passed: the probe now delegates to the complete 19-case real-route regression, replacing the historical failing preparation-only probe |
| Catalog execution/transport tests | Passed, including a 120-entry, three-window fixture with actual stubbed transport calls and cache logs, described below |
| CLI authorship test | Passed for the four registered DAG persistence paths using real storage. It stubs the scheduler/provider and does not certify a full CLI run or resume |
| Electron API bundle | `node apps/api/scripts/bundle-electron-server.mjs` passed, including WASM assets. No signed installer or running Electron application verified |
| `docker build --target app -t adt-studio:spec-0002-local .` | Passed on local Linux arm64; final image manifest list `sha256:f95cc814a96941cb7513f95e7e835aea976e0cc4824785847818f1cbe813c2ee` |
| Combined Docker runtime smoke | Passed against a disposable mounted book: SPA/health 200, guarded TOC save v3→v4 with server-owned manual tag, stale save 409/currentVersion 4, actual TOC run completed, v4 retained, all four historical versions readable, saved title in preview. Container stopped after verification |
| Running Studio | Four manual badges verified; real conflicting TOC save retained the draft, displayed the overlapping field, and saved after explicit Keep mine; Sectioning checkbox reset to off on reopening; ordinary Sectioning run preserved both pages; quiz replacement named its protected ID/question; translation correction survived |
| `git diff --check` | Passed against `a10d3fa0` and the working diff |
| Available invariant checks | Storage, identity, catalog and pipeline checks passed in the full suite. There is no `lint:invariants` or `acceptance` script |

Translation accounting is deliberately split. With current output and one saved
correction, both ordinary runs submit **zero adapter requests, zero provider
calls and zero provider cost**. In the separate controlled full-eligibility test,
the complete ordered source list remains partitioned into 50-entry windows.
Removing the correction from its request changes that window only: first pass
has **3 requests / 2 cache hits / 1 provider call**, and the identical second pass
has **3 requests / 3 cache hits / 0 provider calls**. The stub tariff is 0.015 per
call, so costs are 0.015 then 0. No retries occur in that experiment. These are
measured stub-transport/cache results, not live provider billing or an ordinary
rerun cost promise. Empty and protected-only windows make no request.

The final diff review exposed a stale Sectioning save callback after conflict
rebase. A component regression reproduced the failure before the callback's
draft dependency was corrected; the fixed regression and full suite pass.
Translation, quiz and TOC editors also disable editing during an in-flight save
so a successful response cannot clear newer unsaved keystrokes. Recovery keeps
drafts if reload fails and ignores a late reload after discard/new editing.

### Current AC-to-evidence matrix

"Passed" below means the listed development evidence passed, not human acceptance
or release verification. Explicit unchecked portions are shown separately; no
unavailable check is counted as a pass. All numbered spec checkboxes stay open.

| AC | Status | Evidence and limits |
|---|---|---|
| 1 | Passed | Real translation PUT stamps changed/new text, ignores supplied source, retains untouched authorship; current/source versions guarded and version increments |
| 2 | Passed for proposed amendment; scale not run | Fixed-window adapter/transport/cache/provider/cost tests plus two ordinary zero-request reruns; Mathematics STD 5 harness unavailable; human ratification pending |
| 3 | Passed | Quiz save compares resolved identities/content, stamps changed/new quizzes, retains IDs/options and unchanged authorship; identity regressions and guarded HTTP saves |
| 4 | Passed for available ordering; custom-order flow not run | Real full/no-eligible-page runs retain manual/unknown quizzes and stable quiz/option/catalog/audio identities, allocate fresh AI IDs, sort by page. Existing resolver is reused; no user-editable explicit reading-order persistence exists to exercise |
| 5 | Passed | Guarded TOC PUT stamps manual; confirmed worker publication stamps AI; real HTTP and Docker checks |
| 6 | Passed | TOC confirmation names protected document; cancellation/failure retain current/history, successful replacement publishes AI; Studio dialog and route tests |
| 7 | Passed | Whole-page PUT, clone, split, merge, cross-page merge, delete and real queued AI-edit service stamp manual; generation stamps AI; shared factory/retirement paths |
| 8 | Passed | Manual/unknown page versions and section IDs unchanged with zero sectioning calls; mixed fixture calls only AI pages |
| 9 | Passed | Six authored entity types survive real Save → HTTP run → worker → current/history for own-stage and Sectioning/upstream chains, followed by real preview/export reads |
| 10 | Passed | All four badges verified in running Studio; five catalogs fully translated; extraction and lint pass |
| 11 | Passed for protection/parsing; old-app workflow not run | Unknown records survive ordinary runs and show legacy protection; missing output can be filled; actual pre-change compiled schemas parse tagged records. No full old-app/downgrade run |
| 12 | Passed | Real restores of AI, manual and absent source retain their tags; subsequent runs regenerate AI and preserve manual/unknown; stale/concurrent restore rejects |
| 13 | Passed | Real delete/delete-last leaves protected empty page; cross-page merge protects both pages, moved content occurs once after rerun; stale destination writes neither page |
| 14 | Passed | Source removal retires active translation membership while history survives; same-ID source return recovers correction; restored source/rendering covered; section retirement removes active TOC reference with provenance/history retained |
| 15 | Passed | Named page/version snapshots checked on execution; checkbox off on every open in component and running Studio checks; ordinary runs preserve, confirmed runs publish AI/history |
| 16 | Passed | Model failure, cancellation, duplicate/stale confirmation and injected SQLite publication failure retain prior in-flight units; retirement rolls back atomically; explicit quiz Replace names protected work and publishes fresh AI identity only on success |
| 17 | Passed | Actual preview and web package contain retained manual translation, quiz, TOC and page content after survival chain; saved sections render through current outputs |
| 18 | Passed | All four saves require baseVersion, missing 400/stale 409 with currentVersion and no write; shared writer/persisted-running guards; queued publication checks; Studio three-way draft recovery with explicit overlap choices |
| 19 | Passed for stamping only | Four new CLI/DAG output kinds stamped AI at actual registered persistence boundaries; no full CLI preservation or SPEC-0010 completion claim |

### Outstanding decisions and verification limits

- **Blocked on human decisions:** approval of the AC-2 reconciliation, ADR/no-new-
  ADR confirmation, and coordination of easy-read ownership and the full
  Storyboard-rerun follow-up. These are not silently added to this implementation.
  SPEC-0003 mode-change behavior also needs integration coordination before its
  merge; this PR does not make protected old-mode pages silently replaceable.
- **Not run:** Mathematics STD 5 / `pnpm acceptance` (fixture and script absent),
  full old-application/downgrade workflow, a custom reading-order editor flow,
  live provider billing, signed desktop installers and release-platform runs.
  The local combined Docker smoke and Electron API bundle do not establish
  release acceptance.
- **Not run:** hosted CI for these local commits, because the owner prohibited
  pushing. The prerequisite's green hosted checks concern `a10d3fa0` only.
- **Publication:** keep #880 based on #879's `spec/735-per-section-staleness`
  until that prerequisite merges; recheck remote heads and preserve recoverable
  refs before any later rebase/push. No descendant was merged into its ancestor.
  After #879 merges, rebase only #880's own commits onto develop and retarget the
  same PR. No other PR was modified.
- **Review:** request @elasticsounds in the existing discussion because GitHub
  cannot assign a PR's author as its formal reviewer. Implementation diff review
  on GitHub becomes possible only after separately authorized publication.

<details>
<summary>Historical October 10 baseline and safe-slice results — superseded by the current results above</summary>

The probe output and blocked matrix below describe the older recorded refs. The
current probe has been replaced by the passing full-route regression; running it
on today's branch does not reproduce the historical failure.

## Scope and dependency audit — 2026-10-10

This is a partial implementation in PR #880, on `spec/736-manual-edit-preservation`.
The owner authorized implementation before approval and local commits without a
push. SPEC-0002 remains draft; human review is pending. The implementation order
is shared schemas/helpers, translation, TOC, quizzes, then Sectioning, as coherent
commits in the same PR.

Published target: `d2348233838ee635f2ef727984fb93e2d8289306`. Refreshed develop:
`ef31494d`. Published SPEC-0001/#879: `a1fc11a2`, four documentation files only.
The dependency advanced during implementation: its first local foundation commit
`7d974c28` now supplies writer admission, immutable audio storage and shared
`OutputSource`/`OutputMetadata`. This branch is based on that exact committed
prerequisite; no uncommitted dependency drafts were copied. SPEC-0002 reuses its
authorship schema, with a source-only projection for entities outside freshness.
Its spec/index/ADR-024 remain inherited dependency work, not changes claimed here.

The dependency is **not behaviorally complete**: `stages.ts` still retires IDs and
calls `clearNodesByType` before generation, and saves/restores are not fully
integrated with its shared mechanisms. The real-route probe remains the gate.
The target was first isolated on develop, then rebased onto `7d974c28` when it
became available. `backup/spec-0002-published-20261010` retains the published head;
`backup/spec-0002-slice-20261010` retains the tested develop-based slice. Compare
this PR's own changes against `7d974c28`. The remote base can remain SPEC-0001's
branch; coordinated publication must check both remote heads first.

The source issues #736 and #144, all their comments, #880's discussion and empty
inline-review list, and #879's current discussion were read. No separate existing
implementation PR is named in the target block. A current search for #736 and
manual preservation found the merged #737, which only addresses Storyboard stage
invalidation, not pre-run preservation. Its existing behavior is reused, not
duplicated. The identity dependencies #784, #785, #786 and #787 are merged into
develop. Existing glossary merge behavior (`packages/pipeline/src/glossary.ts`)
is the design precedent for the shared helper, adapted to preserve unknown
authorship and exact stable identities; the glossary implementation is unchanged.

The roadmap and SDD references in `Downloads/adt studio proposal` prioritize
surviving manual edits, version history, stable identity and release acceptance.
Current SPEC-0001/ADR-024 refine their earlier section-level freshness proposal.
The user's authorization overrides approval-before-implementation sequencing,
but not the runtime dependency or pending human approval.

### Blocking runtime evidence

On develop and the exact dependency commit `7d974c28`, `makeBeforeRun` in
`apps/api/src/routes/stages.ts` retires section IDs
and calls `clearNodesByType` before the worker runs. The latter deletes all
versions for most node types. `saveStoryboardNode` also calls the destructive
`clearCaptionData`. SPEC-0001's non-destructive preparation and complete
publication/freshness integration are absent; initial admission/storage
primitives alone do not suffice. A merge helper cannot recover erased input or
history, and a running-step check alone cannot guard queued work or atomic publication.

The only dependency-free rollout slice documented by SPEC-0002 is slice 1:
optional stored authorship schemas and pure helpers. Behavioral slices 2–5 are
blocked. This PR must not introduce a second freshness/admission subsystem or
advertise end-to-end preservation before the shared foundation exists.

## Acceptance map recorded before application edits

The current-behavior column records the initial develop `ef31494d` source audit,
not the old spec's line numbers or completion of the newer dependency commit.
The verification column is the completion requirement; it is not a claim that
the check has run. Results follow below.

| AC | Current behavior | Required change | Concrete verification |
|---|---|---|---|
| 1 | Translation PUT validates only id/text; no authorship or version guard | Guarded server-side per-entry comparison and stamp | Real PUT: changed/new versus untouched/forged source; version increment |
| 2 | `runTranslateStep` submits every fixed window, then replaces the language node | Shared freshness selection plus protected merge; stable full-list windows | HTTP reruns and stubbed transport/cache/log accounting; see amendment in spec |
| 3 | Quiz PUT uses `saveQuizOutput(edit)` without authorship comparison | Resolve stable IDs, guard version, stamp changed/new quiz content | PUT with existing/new/legacy IDs, no-op and conflicting writers |
| 4 | `saveQuizOutput(replace)` removes all IDs; no-page result is empty | Preserve protected quizzes/IDs; allocate only new generated quizzes | Eligible/no-eligible pages; ordering, catalog/audio references and explicit reading order |
| 5 | TOC PUT and worker store unstamped whole document | Server manual stamp and generated AI stamp | Real PUT/worker/read with untrusted source ignored |
| 6 | TOC pre-run clear deletes history; generic reset dialog | Named protected-document confirmation and safe publication | Confirm/cancel/fail; current and history read; UI check |
| 7 | `saveStoryboardNode` persists structural results without authorship | Guard/stamp both affected page records; AI stamp in worker | PUT, clone, split, merge, cross-page merge, delete, AI edit |
| 8 | Sectioning pre-run retirement and clear precede model work | Ordinary skip of manual/unknown pages before any mutation | HTTP run: zero calls/writes/retirement for protected pages |
| 9 | Own-stage and upstream HTTP preparation deletes protected data/history | SPEC-0001 foundation, then all six entity integrations | Save → real run route → read/history → preview/export, both run scopes |
| 10 | Four views lack authorship badges | Existing badge pattern and five-locale strings | Component/Studio checks, extraction and lint |
| 11 | Four schemas lack authorship; legacy data can be regenerated | Preserve absent source without migration; shared legacy warning | Schema compatibility plus HTTP run/missing-output and warning checks |
| 12 | Restore reads stored JSON; downstream clearing can destroy history | Preserve stored tags plus shared guarded restore/publication | Restore AI/manual/unknown, rerun, cancellation/concurrent restore |
| 13 | Structural operations write pages but no page protection | Protect empty/deleted/source and destination records | Real delete/delete-last/cross-page merge; rerun and content occurrence count |
| 14 | Translation wholesale replacement; TOC retirement parses/re-saves document | Active membership reconciliation retaining history and authorship | Remove source/retire section; read active, history and restore |
| 15 | Run body has no protected replacement scope | Off-by-default confirmation naming pages and captured versions | Reopen dialog, ordinary call, confirmed replacement, changed scope/race |
| 16 | Section retirement precedes replacement success | Per-unit atomic publication and shared admission; fresh quiz IDs | Inject failure/cancel before publication; inspect current/history/assets/IDs |
| 17 | Preview/export read active output already erased by preparation | Surviving active versions through full chain | Real preview and web package contents, including saved page sections |
| 18 | Translation/TOC saves are unguarded; quiz/page busy guards lack baseVersion | Required baseVersion plus shared admission; retain/reapply drafts | Missing/stale version, queued/active worker, concurrent saves/restores and UI conflict |
| 19 | Separate DAG writers save all four nodes without AI stamps | Stamp newly generated outputs at DAG persistence boundaries | Execute DAG with stubbed provider and inspect persisted four node types; no CLI preservation claim |

## Delivered slice

- SPEC-0001's `OutputSource` / `OutputMetadata` already provide translation
  authorship. `AuthoredContent` is a source-only projection of that shared schema
  for individual quizzes, whole page sectioning records and the whole TOC. No
  duplicate source enum, migration or implicit AI default.
- `stampManualEdits` ignores client source, compares by stable identity, stamps
  changed/new content and preserves unchanged authorship. It requires the caller
  to establish admission and a current base version first; it is not a lock or
  version check.
- `mergePreservingManual` retains both manual and unknown records wholesale,
  including metadata and IDs, and stamps trusted generated replacements AI.
  Duplicate or missing identities throw. Source-membership filtering,
  current/unselected AI reuse, quiz placement, allocation and atomic publication
  remain the integrating caller's responsibilities. It is not wired into runners.
- Stored schemas are also used by existing edit routes. Their input projections
  continue stripping caller authorship (including nested Storyboard sectioning),
  preventing the schema addition from making client-provided tags authoritative.
  This does not implement guarded saves: current routes still do not stamp manual
  edits or satisfy `baseVersion`/draft-conflict requirements.
- The existing quiz/audio regression reads the new audio through the persisted
  manifest, matching SPEC-0001's immutable asset contract. It still checks the
  generated bytes and that the old manual recording survives generation and
  restore; it no longer assumes the generated filename equals its text ID.
- The spec corrects absent provenance to protected/unknown and explicitly proposes
  the AC-2 ordinary-selection versus controlled-cache-test reconciliation. No
  approval or runtime-cost guarantee is claimed. The index still says draft.

## Verification results

The develop-based slice passed 293 files / 3,805 tests before rebasing. The final
checks below are repeated on the exact local dependency `7d974c28` plus this
slice, unless explicitly identified as a baseline or compatibility check.

| Check | Result and scope |
|---|---|
| Baseline `pnpm build` | Passed before application edits; application source identical to develop `ef31494d` |
| `pnpm exec vitest run packages/types/src/__tests__/content-authorship.test.ts packages/pipeline/src/__tests__/manual-edits.test.ts apps/api/src/routes/authorship-boundaries.test.ts` | Passed: 3 files, 35 tests (18 schema, 15 helper, 2 real HTTP/SQLite boundary tests covering five edit surfaces each) |
| `pnpm test` | Final rerun passed: 296 files, 3,822 tests, including pretest build; 151.71 seconds. Initial dependency-based failure and verified baseline are described below |
| `pnpm typecheck` | Passed; repeated after the quiz/audio test adaptation |
| `pnpm --filter @adt/runtime typecheck` | Passed |
| `pnpm lint` | Passed: zero errors, eight warnings; no warning cleanup included |
| `pnpm build` | Passed; runtime assets build included; no installer or Docker image built |
| `pnpm --filter @adt/studio extract` | Passed: 3,622 messages per locale, zero missing in es/fr/pt-BR/sq; catalogs unchanged |
| `pnpm --filter @adt/studio compile --strict` | Passed; no changed Studio strings in this slice |
| Pre-change schema compatibility | Passed for four record kinds with AI/manual tags, using the actual pre-edit compiled schemas from develop; legacy reads remain untagged. This verifies parsing, not a complete old-application/downgrade workflow |
| `node scripts/probes/spec-0002-foundation.mjs` | Failed with exit 1 on the develop baseline, the develop-based slice and the final dependency-based slice; not a passing acceptance test |
| `git diff --check` | Passed |
| Invariant checks | Available identity, storage and pipeline tests ran in the full suite. `lint:invariants` and `acceptance` scripts are absent; no aggregate invariant/harness pass claimed |
| UI, representative Mathematics STD 5, provider/cost measurements | Not run: runtime integration is blocked; pure helper tests cannot establish these claims |
| Desktop/Docker/release and hosted CI | Not run; nothing pushed, and development tests do not establish release verification |

The first full test run after the dependency rebase had 3,821 passes and one
failure: `quiz-identity-regressions.test.ts` tried to read the old derived filename
`qz002_que.mp3`. A clean disposable checkout of **exactly `7d974c28`**, without
SPEC-0002 changes, reproduced the same ENOENT failure with the focused test. This
establishes the dependency baseline rather than assuming the failure is unrelated.
The assertion now follows the saved manifest and retains the manual-byte and
restore checks. That focused test passed after adaptation; the full rerun is
reported in the table above. No other PR or working draft was modified.

### Reproducible HTTP dependency failure

After `pnpm build`, run `node scripts/probes/spec-0002-foundation.mjs`.
It creates and removes disposable books, makes real translation/TOC PUT requests,
uses the real HTTP run route and `StageService`, then reads real SQLite current
and history records. Only the worker is replaced, with a failure before any model
or publication. No credentials or paid calls are used.

Both documents have two retained versions before the run. The results are:

| Requested run | Translation versions before → after | TOC versions before → after |
|---|---|---|
| Translate → Translate | 2 → 0 | 2 → 2 |
| TOC → TOC | 2 → 0 | 2 → 0 |
| Sectioning → Sectioning | 2 → 0 | 2 → 0 |

The worker-entry snapshots already lack the affected rows. Failure leaves them
missing. The saved edits have absent provenance because current PUTs do not stamp
it; these are explicitly protected by Decision 4/AC-11. The PUTs also succeed
without `baseVersion`, demonstrating that part of AC-18 is not satisfied. This
probe deliberately fails instead of encoding destructive behavior as a passing
regression. It stops short of generation, preview and export and cannot certify
AC-9/17. Update its saves to use required base versions when that contract lands.

### AC-to-evidence result matrix

**No complete numbered AC is passed by this dependency-free slice.** Partial
helper/schema evidence below is not behavioral acceptance. Failed marks an
observed violated requirement; Blocked marks integration requiring the missing
foundation; Not run identifies deliberately unimplemented/unchecked surfaces.

| AC | Status | Evidence / remaining requirement |
|---|---|---|
| 1 | Blocked | Helper stamps changed/new text and ignores forged tags; guarded PUT not integrated |
| 2 | Blocked | Protected merge tested; selector, transport/cache/cost counts and representative book not run; amendment awaits review |
| 3 | Blocked | Quiz-key comparison and position-only no-op tested; PUT stamping/version guard absent |
| 4 | Blocked | Helper keeps protected IDs including empty generated set; full runner/allocation/order/catalog/audio chain absent |
| 5 | Blocked | Whole-TOC stored schema and untrusted input boundary tested; server/worker stamping absent |
| 6 | Blocked | No replacement UI/publication; own-stage probe destroys TOC history |
| 7 | Blocked | Page-level/empty-page schema tested; structural stamping and guarded writes absent |
| 8 | Blocked | No protected-page runner skip or deferred retirement integration |
| 9 | Failed | Real PUT → run-route/real-service → storage/history loses corrections before worker entry; full six-entity chain not reached |
| 10 | Not run | No badges/UI changes in slice 1; extraction/lint passes do not prove this AC |
| 11 | Blocked | Unknown retained by helper; actual older schemas read new records; legacy warnings and ordinary-run protection absent |
| 12 | Blocked | Schema JSON round trips retain tags; restore → rerun and concurrent restore not integrated/tested |
| 13 | Blocked | Empty-page metadata supported; deletion/cross-page operations and rerun preservation not integrated |
| 14 | Blocked | Helper permits caller-filtered active membership without mutating prior input; no source-removal/history/restore integration |
| 15 | Blocked | No named, off-by-default protected-page replacement scope or UI |
| 16 | Blocked | No atomic replacement/cancel/identity-retirement integration; preparation already deletes history before injected failure |
| 17 | Blocked | Preview/export acceptance not run because the prerequisite survival chain fails |
| 18 | Failed | Probe PUTs without baseVersion succeed (200); no stale-write/queued-admission/draft-conflict implementation |
| 19 | Not run | DAG stamping deferred with entity slices; no CLI preservation or SPEC-0010 completion claim |

## Remaining decisions and handoff

1. Integrate and verify SPEC-0001's shared non-destructive preparation, writer
   admission, captured-input/version publication, active/history reconciliation,
   freshness/legacy review and physical-asset safeguards. A helper commit or green
   documentation CI is insufficient. Re-run the HTTP dependency probe first.
2. Reconcile the proposed AC-2 amendment in human review. Keep the original cache
   experiment as an adapter/transport test, not an ordinary-run billing promise.
3. Continue in the same PR with translation, TOC, quizzes and Sectioning, in that
   order. Reuse the shared foundation; do not merge a descendant into its ancestor.
4. Easy-read ownership and full Storyboard-rerun preservation remain explicit
   coordination gaps in #736/#144; no new owner or follow-up issue is invented.
   The integration approver and ADR confirmation remain human review items.
5. No branch was pushed or merged. Recheck both remote heads before a future
   publication, preserve the backup ref, and coordinate rebase/retargeting then.
   Request review from @elasticsounds in a tagged PR comment because GitHub cannot
   assign a PR's author as its formal reviewer. The remote description must make
   clear that this implementation is currently local and unavailable in its diff.

</details>
