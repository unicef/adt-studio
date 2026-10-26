# SPEC-0002 implementation evidence

> **2026-10-12 qualified implementation:** [the refreshed integration audit](../verification/spec-0002-oct12-audit.md)
> supersedes the historical reports below. Source `7b53e448` is integrated onto
> SPEC-0001 `aefe4185`; F1–F4 and the additional independent findings are fixed
> and rechecked. All 4,097 tests, final build/typechecks/lint/Lingui, actual Docker
> browser/export/restart checks, packaged Desktop API/resources checks and the
> built-old-version read probe pass. Exact published-head CI is recorded in the
> review-request comment. AC-9/11/17 retain SPEC-0001's explicit legacy-owner
> qualification; this is not unrestricted legacy compatibility, specification
> approval or release certification. See the audit for all 19 ACs and limits.


## Review preparation after manual testing — 2026-10-11

The owner considers the manual product walkthrough complete. The confirmations
below record the tested flows; they do not certify every numbered acceptance
criterion or a release build. No repeat manual walkthrough is requested.

At local `4dd0c83ab`, a fresh focused run of `manual-edit-survival.test.ts`,
`use-guarded-draft.test.tsx`, `SectioningPageDetail.test.tsx`,
`RevertSectioningEdits.test.tsx`, `UnsavedChangesGuard.test.tsx`,
`QuizzesView.history.test.tsx` and `LandingPageShell.authorship.test.tsx` passes
all 50 tests across seven files. Four independent review probes still reproduce
old-rendering/new-section association, TOC draft identity confusion, loss of the
fixed-layout tree on a skipped protected rerun, and skipped confirmed TOC work
in a combined stage range. These are separate from the successful manual flows.

Published downstream heads were rechecked. SPEC-0003 #884 already addresses
fixed-layout pair retention; SPEC-0012 #888 addresses preview identity selection.
Reuse those fixes. The catalog still assigns retained activity answers by section
index, and the TOC rebase and same-run consent gaps remain in the inspected code,
including updated #889 and #885. The #888 function probe was rerun, but no full
downstream-stack build or HTTP test is claimed. The TOC identity and remaining
catalog issues require correction before release; the combined-run issue is
medium priority and can be explicitly assigned/deferred. Duplication/refactoring
suggestions are nonblocking.

At review preparation, PR #880 published `e5b93e57b`, while the tested
conflict-prompt/TOC-badge commit `4dd0c83ab` and these later confirmations were
local. The owner then authorized publishing the updates and the prepared review.
The review records manual acceptance and the remaining findings; it does not
supply independent human approval. Spec approval and merge review remain open.

## Preview manual review — 2026-10-11

The owner confirmed that saved edits appear in Preview after the reader
walkthrough. This records visible edited content in the development preview;
the response does not separately confirm quiz scoring, TOC link destinations,
reload/restart persistence or exported/imported output. Those outcomes are not
marked as verified by this confirmation.

## Unsaved quiz navigation manual review — 2026-10-11

The owner confirmed all three choices in the unsaved quiz navigation walkthrough:
**Stay** keeps the editor and draft open; **Save & leave** saves the edit before
navigating, with the saved value present on return; **Discard & leave** discards
only the subsequent unsaved change and retains the earlier saved value. This is
user-reported development UI acceptance.

The owner subsequently clarified that the stale-draft **Save & leave** scenario
was already tested and complete. Record that walkthrough as passed: another
tab saves first, the stale save does not navigate away or overwrite the newer
version, the draft remains available, and resolving the conflict permits a
subsequent save and navigation. Do not request another run of this scenario.
The separate busy-book rejection variant has not been manually confirmed.

## Explicit quiz replacement manual review — 2026-10-11

The owner confirmed the walkthrough for intentionally replacing the edited
pages 6–8 quiz works. The walkthrough covered selecting the occupied position
after page 8, identifying the protected question in the Replace warning,
cancelling without changing saved content, and then confirming replacement.
Expected successful output replaces quizzes at that position without appending
an alternative below the edited quiz; other positions remain unchanged. This
records user-reported development UI acceptance.

The owner also confirmed the subsequent quiz-history recovery walkthrough:
find the version before replacement using the header version picker and compare
view, restore the quiz list, verify the manual question/answers and badge,
navigate away and back, and rerun Quizzes. The expected restored manual quiz
survives without duplication, while the newer generated version remains in
history. This is user-reported development UI acceptance, not release validation.

## Conflict prompt clarity and styling — 2026-10-11

The owner confirmed the two-tab quiz conflict flow works as described, but found
the warning's wording and styling confusing. The shared prompt now says
**Conflicting changes detected**, explains that the page changed after editing
began, and offers **Keep my changes** or **Load latest saved values**. Each choice
explains how overlapping changes are handled; a shared reminder says other
edits are kept and the result must be reviewed and saved again. Internal field
paths are no longer shown. The card uses the app's existing buttons, warning
colors and spacing, with text wrapping for longer translations.

This changes presentation in the four editors using `DraftConflict`; the merge,
draft retention and guarded-save behavior are unchanged. All new strings are
translated in all five locales. The owner repeated the conflict test with the
revised presentation and confirmed, “Yep it works.” The two-tab quiz walkthrough
and revised conflict prompt are therefore accepted in the development UI; this
does not claim conflict testing in every editor or release-build verification.

Verification: `use-guarded-draft.test.tsx` and `SectioningPageDetail.test.tsx`
pass (10 tests), including edits typed after a conflict and both resolution
choices. Typecheck and lint pass (eight existing lint warnings); extraction
reports zero missing translations, and `git diff --check` passes. The actual
component and app CSS were visually inspected in an isolated browser preview;
the temporary preview fixture was removed. No user book was changed by the agent, and no
full end-to-end, packaged desktop or release check is claimed for this copy edit.

## TOC manual review and badge layout — 2026-10-11

The owner confirmed saved TOC edits persist after navigation, the manual badge
appears, and restoring v1 works. After confirming the dedicated TOC replacement
warning, they initially reported retained edited content; read-only inspection
of the running API showed current AI output at v5 and manual versions retained
in history. The owner then confirmed the screen displays the generated TOC.
No regeneration behavior was changed on the basis of the initial observation.

The TOC uses the same authorship badge as Sectioning, but its flex-column parent
stretched the badge across the view. A padded flex row now preserves the compact
pill shape. The existing Sectioning confirmation test's text assertion was also
updated to match the previously published dialog wording.

Verification: all four `LandingPageShell.authorship.test.tsx` tests pass;
`manual-edit-survival.test.ts -t 'confirmed TOC'` passes (one test, 23 skipped).
`pnpm typecheck`, `pnpm lint` (eight existing warnings) and `git diff --check`
passed for the layout correction. No new strings, translations or backend
changes; visual confirmation of the adjusted pill remains with the owner.

## Single-page revert and clearer Sectioning consent — 2026-10-11

The owner confirmed the quiz correction works, French translation edits survive,
and Sectioning edits survive with the manual badge visible. They located and
tested the rerun dialog, but found the preservation/replacement wording confusing.
They requested a single-page way to remove saved manual edits in Sectioning,
explicitly declining a full version-history interface there.

- **Revert manual edits** appears beside a manual page's badge. The existing
  confirmation names the page, explains restoration and future rerun eligibility,
  and lists affected downstream stages. The shortcut uses the existing guarded
  restore API to select the most recent explicitly AI-authored version older than
  the current version. It retains edited history, restores the whole page, and
  does not modify neighboring page records or call a model. No schema/API change.
- Unsaved local edits and local mutations disable the action. The API still
  rejects stale/busy restores. A failed history read can be retried; absent AI
  history is explained without guessing that legacy content was generated.
- The rerun dialog now says listed pages keep their saved content by default,
  while other pages regenerate, and labels the opt-in as also regenerating the
  listed pages. All new copy is translated in all five locales.

Verification: 34 tests passed across `RevertSectioningEdits.test.tsx`,
`SectioningPageDetail.test.tsx` and `manual-edit-survival.test.ts`. The new HTTP/
SQLite regression restores one page, checks both neighboring page records and
retained manual history, then runs Sectioning and verifies exactly one model
adapter call. Component tests cover cancel, the nearest earlier AI version,
legacy/missing history, unsaved drafts, stale/busy rejection and read retry.
`pnpm typecheck` passed; `pnpm lint` passed with the existing eight warnings;
`pnpm --filter @adt/studio extract` reports zero missing translations in every
locale. No full-suite, paid-provider, browser, desktop or release run is claimed
for this addition. The owner subsequently confirmed the single-page revert
walkthrough works, including Cancel, restoration, neighboring-page preservation
and ordinary rerun eligibility. No user book was modified by the agent.
The invariant lint command remains planned and unavailable.

## Quiz rerun correction from product testing — 2026-10-11

The owner tested the published `373619dd2` implementation and saw the generated
pages 6–8 quiz reappear beneath its manually corrected version. That matched the
old Decision 8 / AC-4, but the owner explicitly selected **keep the edited quiz
and skip its page group**. The spec and quiz identity documentation now record
that rule. The owner authorized committing and publishing this correction with
its review notes on the existing PR #880 branch. The verification below applies
to this amendment; the historical completion reports do not certify it.

- Build normal eligible batches first, then exclude complete source-page sets
  already covered by manual or unknown-authorship quizzes. Page selection order
  and display placement do not change coverage; partial overlap is a different
  group. Remaining batches keep their inputs, and protected groups make no model
  requests. API and DAG callers use the same exclusion for generation/capacity.
- Recheck protected coverage inside the existing atomic quiz publisher. A
  generated/cached candidate cannot append an alternative to a protected group.
  Ordinary publication retires prior AI alternatives from the active set while
  preserving history. Protected quiz/option IDs and content remain intact;
  multiple protected quizzes are retained. Explicit Add after / Replace keep
  their existing insert/consent behavior.
- Four added AC-4 regressions failed before the fix. Two run actual HTTP
  admission, saves, stage execution, batching, quiz generation and SQLite with
  only the model boundary stubbed: manual and legacy pages 6–8 stay unchanged
  across repeated reruns, the neighboring group regenerates, an old AI duplicate
  leaves active content but stays in history, and fully protected groups make
  zero model calls. Pure tests cover unchanged batch boundaries, reordered page
  selection and all-protected generation. Existing tests also exercise explicit
  Replace failure/cancellation/success and protected catalog/audio identities.

Verification for this correction:

| Command | Result |
|---|---|
| `env -u OPENAI_API_KEY pnpm exec vitest run packages/pipeline/src/__tests__/quiz-generation.test.ts apps/api/src/routes/manual-edit-survival.test.ts apps/api/src/routes/quiz-id-lifecycle.test.ts apps/api/src/routes/quiz-identity-regressions.test.ts apps/api/src/routes/quizzes.test.ts` | 5 files / 107 tests passed. |
| `env -u OPENAI_API_KEY pnpm exec vitest run packages/pipeline/src/__tests__/cli-authorship.test.ts` | 1 file / 1 test passed; fresh-book DAG writer compatibility, not full CLI resume acceptance. |
| `pnpm typecheck` | Passed; rebuilds the shared package output used by API tests. |
| `pnpm lint` | Passed; 0 errors and the existing 8 unused-suppression warnings. |
| `git diff --check` | Passed. |

No full-suite, paid-provider, browser, packaged desktop or release acceptance run
is claimed for this correction. The user subsequently confirmed “quizzes work now.” No
user book was modified during development; test storage used temporary copies.
The invariant lint command remains planned and unavailable.

## Completion under delegated assumptions — 2026-10-11

The owner authorized reasonable assumptions to finish the remaining items after
publication of `8ab973c1`. The four-entity API/Studio implementation is complete
under the scope decisions now recorded in SPEC-0002. This is a code-completion
claim, not specification approval, release certification, or completion of all
work in #736/#144. SPEC-0002 and its INDEX entry remain draft; approval checkboxes
remain open. PR #880 remains separate and stacked on #879 at `a10d3fa0`.

The AC-2 reconciliation is the selected working contract: current output is
skipped before requests, and the full-eligibility cache experiment is separate.
ADR-024 supplies the shared design; no additional architecture decision is needed.
Easy-read remains owned by SPEC-0001/#736, and full Storyboard-rerun preservation
remains explicitly deferred to #144. These are linked existing open follow-ups,
not silently delivered features or reasons to expand this PR.

Additional acceptance evidence (commit `0f2c4fe0`):

- **Textbook scale:** `catalog-execution.test.ts` now runs both 120 and 8,850
  entries. The larger fixture warms 177 windows. After correcting entry 4,407,
  both ordinary runs make zero adapter requests, cache hits, provider calls or
  provider charges. In controlled full-eligibility passes, each pass makes 177
  adapter requests; the first has 176 cache hits / one provider call / 0.015
  fixture cost, the second 177 cache hits / zero calls / zero cost. Complete
  request bodies in every unaffected window remain identical. The real transport
  boundary and filesystem cache are exercised with a stub provider, not helper
  call counts alone. This is synthetic scale evidence, not Mathematics STD 5.
- **Reading-order preservation:** the real quiz HTTP-run regression now stores
  an explicit order containing protected quiz and section IDs. Both ordinary
  generation and the no-eligible-pages case leave that entire saved row/version
  unchanged. It does not introduce or certify the deferred ordering editor.
- **Old-build readability:** an independent source archive of develop
  `ef31494dc2951b92222c473960fecee2d91f9544`, before either implementation, was
  installed with the frozen offline lockfile and built with
  `pnpm exec tsc --build apps/api`. The committed compatibility probe performs
  real current HTTP saves to a disposable SQLite book, launches the old API in a
  separate process, reads all four entities and previews/exports their text,
  then reopens using the current API. Content, authorship, stable identities and
  every entity's current/history rows remain unchanged. This proves AC-11's read
  contract; editing/regenerating with an old build remains outside that promise.

Reproduce the compatibility check after building both trees:

```sh
node scripts/probes/spec-0002-compatibility.mjs --baseline /path/to/built/pre-change/tree
```

The previous published head passed hosted test, Docker and i18n jobs in
[run 38099892321](https://github.com/unicef/adt-studio/actions/runs/38099892321).
The final additions change tests, a verification probe and documentation only;
production code, UI strings and dependencies are unchanged. Final verification
results:

| Command/check | Result |
|---|---|
| `pnpm test` (including pretest build) | Passed: **313 files / 3,917 tests**, 151.87 seconds |
| Focused catalog execution + real-route survival suites | Passed: **30 tests**, including the 8,850-entry transport/cache test |
| Compatibility probe against pre-change `ef31494d` | Passed: old API read/preview/export and current reopen; all four entity histories unchanged |
| `pnpm typecheck` and `pnpm --filter @adt/runtime typecheck` | Passed |
| `pnpm lint` | Passed: zero errors, the same eight recorded baseline warnings |
| `git diff --check` | Passed |
| Studio strings/catalogs | Unchanged; the prior five-locale extraction/strict compile and hosted i18n results still cover the application |
| Docker/Electron | Application unchanged since the successful combined Docker build/runtime and Electron API bundle checks; no new release claim |

Earlier dated sections are historical checkpoints;
their no-push and unresolved-choice notes no longer describe the current handoff.

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
| 2 | Passed under delegated reconciliation | Fixed-window adapter/transport/cache/provider/cost tests at 120 and 8,850 entries plus two ordinary zero-request reruns; actual Mathematics STD 5 harness remains a release/harness check, not claimed here |
| 3 | Passed | Quiz save compares resolved identities/content, stamps changed/new quizzes, retains IDs/options and unchanged authorship; identity regressions and guarded HTTP saves |
| 4 | Passed | Real full/no-eligible-page runs retain manual/unknown quizzes and stable quiz/option/catalog/audio identities, allocate fresh AI IDs, sort by page and leave a stored explicit reading-order row/version unchanged. A new ordering editor is outside this PR |
| 5 | Passed | Guarded TOC PUT stamps manual; confirmed worker publication stamps AI; real HTTP and Docker checks |
| 6 | Passed | TOC confirmation names protected document; cancellation/failure retain current/history, successful replacement publishes AI; Studio dialog and route tests |
| 7 | Passed | Whole-page PUT, clone, split, merge, cross-page merge, delete and real queued AI-edit service stamp manual; generation stamps AI; shared factory/retirement paths |
| 8 | Passed | Manual/unknown page versions and section IDs unchanged with zero sectioning calls; mixed fixture calls only AI pages |
| 9 | Passed | Six authored entity types survive real Save → HTTP run → worker → current/history for own-stage and Sectioning/upstream chains, followed by real preview/export reads |
| 10 | Passed | All four badges verified in running Studio; five catalogs fully translated; extraction and lint pass |
| 11 | Passed for the specified read contract | Unknown records survive ordinary runs and show legacy protection; missing output can be filled. Independent pre-change API reads/previews/exports current saved books and current reopen preserves authorship/IDs/history. Old-build writes/reruns are not certified |
| 12 | Passed | Real restores of AI, manual and absent source retain their tags; subsequent runs regenerate AI and preserve manual/unknown; stale/concurrent restore rejects |
| 13 | Passed | Real delete/delete-last leaves protected empty page; cross-page merge protects both pages, moved content occurs once after rerun; stale destination writes neither page |
| 14 | Passed | Source removal retires active translation membership while history survives; same-ID source return recovers correction; restored source/rendering covered; section retirement removes active TOC reference with provenance/history retained |
| 15 | Passed | Named page/version snapshots checked on execution; checkbox off on every open in component and running Studio checks; ordinary runs preserve, confirmed runs publish AI/history |
| 16 | Passed | Model failure, cancellation, duplicate/stale confirmation and injected SQLite publication failure retain prior in-flight units; retirement rolls back atomically; explicit quiz Replace names protected work and publishes fresh AI identity only on success |
| 17 | Passed | Actual preview and web package contain retained manual translation, quiz, TOC and page content after survival chain; saved sections render through current outputs |
| 18 | Passed | All four saves require baseVersion, missing 400/stale 409 with currentVersion and no write; shared writer/persisted-running guards; queued publication checks; Studio three-way draft recovery with explicit overlap choices |
| 19 | Passed for stamping only | Four new CLI/DAG output kinds stamped AI at actual registered persistence boundaries; no full CLI preservation or SPEC-0010 completion claim |

### Remaining release gates and follow-up

- **Implementation decisions resolved under delegation:** AC-2 follows
  SPEC-0001, ADR-024 is reused, easy-read stays with SPEC-0001/#736 and full
  Storyboard rerun with #144. No unresolved decision blocks these four slices.
  Human spec/PR review remains pending. SPEC-0003 must coordinate its mode-change
  policy before integration; this PR does not silently replace old-mode pages.
- **Not run; retained release/harness gates:** Mathematics STD 5 /
  `pnpm acceptance` (fixture and script absent), live provider billing, signed
  desktop installers and release-platform runs. Synthetic scale, the combined
  Docker runtime and the Electron API bundle do not establish those results.
- **Outside the compatibility promise:** editing or regenerating with the
  pre-change application. Old-API reads, preview, export and current reopen were
  exercised; an entire old Desktop UI workflow was not. A new reading-order
  editor and full CLI preservation likewise remain outside this PR.
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
