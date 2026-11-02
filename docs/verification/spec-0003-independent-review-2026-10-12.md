# Independent SPEC-0003 review — 2026-10-12

**Final result: no unresolved material correctness finding identified at `5a9f9b48a21ca9a5e6dd8d0ec3752e914393d28f`.** The backend reviewed at `c23f185928be91f7c7ca033c4e3fa61e9f137f0b` is unchanged; the subsequent F8 Studio correction was independently rechecked at this final head. The Git comparison confirms that only the named Studio code/tests and locale catalogs changed between these checkpoints. Prerequisite: SPEC-0002 `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89`, including SPEC-0001 `aefe41855ae63d89c09db5553c50f48eb01b190d`. This is a separate read-only reviewer, not the implementation writer. No tracked repository files, branches, PR content or remote state were modified by this reviewer. This result is an implementation review, not human product/spec approval or release certification.

The independent review found concrete problems beyond the initial consolidated review. The writer fixed them, froze a new runtime checkpoint, and the reviewer independently reran the original counterexamples plus positive and inherited safety controls. All seven initial additional findings and the later F8 component finding are resolved at their recorded final checkpoints. The qualified legacy-owner behavior and fixed-input restoration requirement remain explicit compatibility limits, not hidden passing claims.

## Sources, requirement map and boundaries

Read the original SPEC-0003 and every original AC1–26; the amended current specification and ADR025; both complete product reviews 5486273946 and 5368403884; #708, original #666 and #692; available PR discussion/inline feedback; prerequisite contracts/evidence; architecture/invariants/guidelines; and roadmap/SDD references. The independently constructed requirement map is [independent requirement map](spec-0003-independent-requirements-2026-10-12.md). It retains each original AC and distinguishes superseded mode-gate behavior from revised acceptance. Old passing gate tests were not treated as acceptance of the new behavior.

The reviewer traced Studio controls and query refresh, Hono routes, immediate/queued/combined stage execution, targeted service, fresh CLI DAG executor, SQLite publication/history, shared writer admission/recovery, stable rendering ownership, library/sidebar/stage coverage, preview and packaging. Source-level review included consent's semantic/HTML/tree versions; reset-before-generation transaction boundary; execution/publication revalidation; ordinary per-page commit versus actual layout-switch atomicity; same-run TOC consent and fixed/reflowable tree ownership.

Original integrated behavior was reproduced from immutable archive `c50bea33627b1e7b162f5adc746e12648da07aa2`, with exactly one syntax-only duplicate-import correction in that private archive. Therefore the baseline is not claimed as a byte-identical successful build. Intermediate revised checkpoint `ec029e0c0db1e7a2228b75ae0899c5237bd83429` fixed the first findings but still failed fresh DAG, package completeness and fixed-input probes. Final recheck used the clean tracked runtime at `c23f185928be91f7c7ca033c4e3fa61e9f137f0b`.

## Findings and final recheck

| Finding | Severity / concrete user impact | Independent evidence | c23f1859 outcome |
|---|---|---|---|
| Critical A / obsolete lifecycle gate | P1; manual saved sections and usable older books cannot render | Immutable baseline API/targeted failures | Fixed; valid multiple-section trees and absent lifecycle render |
| R5 buffered first page | P1; successful page withheld while another runs | Separate SQLite reader and actual page HTTP GET while the second renderer is deferred | Fixed on first generation and same-layout rerun |
| Ordinary Sectioning replaced existing AI pages | P1 product mismatch | Counted actual worker's generation boundary; existing versions | Fixed; ordinary run invokes zero generators for existing records |
| Targeted partial layout switch | P1; mixes fixed/reflowable active output | Fixed book, target only p2 of p2/p7 after selecting reflowable | Fixed; refuses without changing history; full-window switch controls pass |
| F1 positional HTML owner reassignment | P1; unrelated `sec900` HTML becomes another section's current content | Actual split HTTP route, SQLite/history; known stable reordered-owner positive control | Fixed; stable-owner projection precedes explicit structural transforms; clone/split/merge/delete tolerate deliberate null reset |
| F2 Studio publication throttle | P1; persisted fast first page remains invisible during silent slow second page | Actual hook, QueryClient and EventSource; actual worker event-after-commit probes | Fixed; explicit publication event immediately refreshes pages for both layouts |
| F3 fresh CLI reflowable buffering | P1; supported fresh DAG withholds/discards earlier successful page | Actual production web-rendering executor with real SQLite and isolated admission/scheduling/renderer boundaries | Fixed; first page is committed before second renderer starts |
| F4 unbounded missing-page diagnostic | P2; large missing-input book floods persisted/SSE/UI error | 25-page missing fixed-input probe | Fixed; total 25 preserved and displayed IDs limited to 20 |
| F5 untranslated error presentation paths | P2; decision dialog, reconnect polling and task paths show recognized safety codes raw | Independent presentation trace and actual polled run hook regression | Fixed through shared mapping; source producer uses recognized layout-switch code |
| F6 old partial package falsely complete | P1; a p2-only bundle is called complete after p7 is rendered in source | Actual Hono package-status endpoint with real old manifest/files; full retained bundle positive control | Fixed; required membership and files must accompany source coverage; preference/lifecycle changes do not block complete retained content |
| F7 missing fixed input becomes blank replacement | P1; absent positioned extraction/null classification silently replaces readable pages or removes images | Actual worker+SQLite fixed switch and same-layout image probes | Fixed; page retained, unrelated page publishes; actual switches retain all old pairs if any required input unavailable |

Other raised/rechecked edges: selected SQL-NULL versions versus absence; intentional JSON-null reset rows; returned targeted version after restoring an older current version; external global-config page-window agreement in library/detail; zero-output package state; stale HTML/tree consent; complete versus usable coverage. Unreadable historical Sectioning is retained and requires a valid restored historical version before safe ID allocation. It is not guessed missing or overwritten.

## Independent exact-checkpoint verification

All commands ran in `/Users/ksokolovic/Development/adt-studio/tmp/spec-0003-implementation`. Private configs alias workspace source. Prefix each command with `DEVELOPER_DIR=/Library/Developer/CommandLineTools`.

| Command | Result | Log |
|---|---|---|
| `pnpm exec vitest run --config /private/tmp/spec3-oct12-independent/vitest.recheck.config.mts` | **36/36 pass**, 41.33s | `recheck-c23f1859-final.log` |
| `pnpm exec vitest run --config /private/tmp/spec3-oct12-independent/vitest.dag.config.mts` | **1/1 pass**, 3.70s | `dag-c23f1859.log` |
| `pnpm exec vitest run --config /private/tmp/spec3-oct12-independent/vitest.ui.config.mts` | **3/3 pass**, 5.69s | `ui-c23f1859.log` |
| `pnpm exec vitest run --config /private/tmp/spec3-oct12-independent/vitest.inherited.config.mts` | **7 files / 100 tests pass**, 29.10s | `inherited-c23f1859.log` |
| `pnpm exec vitest run --config /private/tmp/spec3-oct12-independent/vitest.final-safety.config.mts` | **3 files / 74 tests pass**, 81.51s | `final-safety-c23f1859.log` |

Total: **214 independently executed passing tests at c23f1859**. This is not the repository's complete suite count. Baseline and intermediate expected failures remain preserved in [finding history](spec-0003-independent-findings-2026-10-12.md) and named logs. The final UI test harness needed explicit Lingui package aliases so its diagnostic mock resolved to the same module as Studio; that correction was private-only, not a product fix.

The 36 private tests exercise real SQLite/filesystem and public HTTP/service paths, including actual page availability before a slow neighbor finishes; fail/Skip/cancel retaining successes and prior failed-page output; malformed/missing page isolation; exact stale consent rejection before calls/reset; pre-reset cancellation; failed reset retaining semantic histories and image bytes; stable-owner structural edits; restored-version truth; actual event emission after committed HTML/tree pairs; missing-output completion; old partial package membership; bounded diagnostic counts; complete retained bundle availability despite mode/lifecycle change; fixed missing extraction/classification; and targeted missing-input isolation in both layouts. Generation is stubbed at a clearly named boundary; these are not provider-quality claims.

The inherited 100 tests include real independent-process admission/recovery and fail-closed anonymous SQLite crash evidence, the actual LLM client cache/retry path with counted provider transport calls, rendered ownership, server-owned authorship boundaries and scoped catalog freshness. The additional 74 tests cover manual-edit survival, exact TOC consent across combined stages, raw history/assets/audio/translation retention, immediate/queued/targeted existing-book flows, both modes/layouts and persisted part windows, reset/current-output reads, stale publication and coverage. Actual browser clicking is separate author evidence; the independent UI probe executes the production hook and real QueryClient/EventSource behavior.

## Revised acceptance coverage from this independent review

| Contract | Independent assessment |
|---|---|
| RAC1 generation/cache | Pass: inherited validator plus actual cache/provider-boundary test; saved-tree cardinality gates removed separately |
| RAC2 saved-tree freedom | Pass: original targeted counterexample, old-book/multiple-section controls, structural route probes |
| RAC3 older books | Pass: no initialization requirement; retained complete package positive control; F8 actual component controls now admit saved trees and select Storyboard/missing-only Sectioning without accidentally dispatching Extract; shared ownership safety retained |
| RAC4 per-page input failure | Pass: malformed Sectioning, missing positioned/classification, ordinary and targeted neighbor publication, part-window integration |
| RAC5 missing-only Sectioning | Pass: zero generator calls on existing AI records; raw null/unreadable preservation integration |
| RAC6 exact explicit consent | Pass: before-call rejection of changed semantic/HTML/tree versions and queued execution integration |
| RAC7 reset/recovery | Pass within documented safety qualification: scoped transaction and failure/cancel probes; inherited process recovery. Anonymous in-transaction mutex remains fail-closed, not automatically repaired |
| RAC8 reset then edit/rebuild | Pass: both mode directions/layout/windows in integration; split/clone/merge/delete history and owner controls |
| RAC9 immediate publication | Pass: real page HTTP read during slow second renderer, both-layout committed events, actual Studio hook and fresh DAG |
| RAC10 failure/Skip/cancel | Pass: already-published page and prior failed-page HTML retained; stale-input publication suite |
| RAC11 layout switches | Pass: full-window success versus partial/failed preservation; fixed tree deactivation controls |
| RAC12 partial coverage | Pass: partial/reset/empty output and old partial bundle regressions, library/stage integration |
| RAC13 usable retained preview/export | Pass with explicit unverifiable-owner qualification; unaffected authored fixed pair and assets retained across export |
| RAC14 informational preference/freshness | Pass in source/integration and catalog-freshness selection; parent supplies full locale/UI flow results |
| RAC15 shared coordination | Pass in writer/recovery suites and publication/queued integration; no unsafe timeout lock deletion |
| RAC16 five-locales/errors | Presentation fixes rechecked; private hook regression passes. Full catalog extraction/strict compilation is author verification, not executed by this reviewer |
| RAC17 bounded CLI/scope | Fresh executor counterexample now passes; source review confirms existing-book resume refusal and no B2/automatic merge/new dependency or competing guard |
| RAC18 inherited guarantees | Selected current suites pass, including server ownership, drafts/stale restore, stable IDs/audio/TOC consent/current reads/scoped catalog freshness; full repository regression and packaging remain author gates |

Original AC disposition is preserved in the independent map, including superseded AC1/2/12/13/14/16/18 behavior. The nine consolidated-review scenarios are mapped there and covered by the above public-path, integration and UI-hook evidence. This table describes the independent review's evidence; it does not substitute for the writer's complete publication/CI/platform matrix.

## Remaining qualifications and publication boundary

- A legacy owner that cannot be verified, or contradicts HTML ownership, remains raw/history/assets-readable but is omitted from preview/export with a warning. Missing authorship alone does not cause omission. Product ratification or safe repair remains separate.
- Fixed-layout rebuilding needs valid current positioned extraction and classification with a positive viewport. Old missing-input books retain their safely owned readable output; they need restored valid inputs or SPEC-0010 repair. This review does not claim universally successful reflowable-to-fixed switching when those inputs do not exist.
- A crash inside an ordinary SQLite transaction may leave an anonymous mutex. Recovery preserves the evidence and refuses writes; editable automatic recovery is not promised in that ambiguous case. A committed reset deliberately leaves the active Storyboard inactive after failed generation; history/assets remain recoverable. Parent's new real-process reset probe was source-reviewed; its execution/platform logs belong to the parent report.
- Expanded existing-book CLI resume, B2, automatic cross-page merging, provider output quality, signed release certification, full Electron GUI and cross-platform packaging are not accepted by these focused tests.
- The reviewer did not run the full repository checks, exact-head hosted CI, Docker, Desktop packaging or physical browser flows. Those must be separately verified by the writer before publication/readiness claims. No paid provider calls were made for this independent review.
- Formal spec/ADR approval remains pending. The authorized product corrections are implemented targets, not self-approved decisions.

Within the revised B1 scope and its explicit compatibility qualifications, the independent runtime review has no outstanding material defect to return to the writer. Publication remains conditional on the writer's full checks and exact published-head CI, and any later runtime modification requires an affected-path recheck.


## F8 continuation — final immutable recheck at 5a9f9b48

The author subsequently found a real-browser cancelled-attempt presentation error and traced an older-book UI readiness problem. The reviewer independently reproduced five expected-behavior failures in actual c23 StoryboardView/Landing components (private copies with import-only path rewrites): false Sectioning-change banner; disabled rerender despite a saved tree; complete older book selecting Extract; partial older book selecting Extract; loading pages transiently dispatching Extract. A genuinely fresh-book Extract control passes. This is P1 for older-book execution and P2 for misleading status. The previous API/runtime checks did not exercise these component decisions. `ui-retained-components-baseline.log` preserves the failures. This subsequent finding prevented treating the earlier checkpoint as final acceptance. It is now fixed and independently rechecked at `5a9f9b48a21ca9a5e6dd8d0ec3752e914393d28f`.


Final F8 command: `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run --config /private/tmp/spec3-oct12-independent/vitest.f8.config.mts` — **5 files / 43 tests pass, 9.40s**. Log: `f8-5a9f9b48.log`. The run includes 11 independently authored actual-component controls, the 3 prior real-hook probes, and the current Sidebar, StoryboardAvailability and retained-run hook suites. This is 43 final-head affected-path tests, not 43 additional unique tests beyond every earlier run.

The 11 private controls verify the original five failures, fresh-book Extract selection, unknown and complete coverage without false warnings, genuine incomplete output without a fabricated source-change claim, retained content during running state, and a deliberately empty saved tree not triggering implicit Sectioning replacement. The original c23 components were copied privately with import path rewrites only, so the baseline does not depend on the moving working tree. Child visuals/providers were stubbed to isolate actual parent-component branching; these are component tests, not a physical browser claim.

The final source review confirms:
- `StoryboardView` uses actual shared coverage for a missing-output notice; idle/cancelled attempts do not prove Sectioning changed. Unknown coverage does not invent missing work. Saved trees permit rerender without completed attempt rows.
- The landing page waits for page loading and chooses Storyboard for complete saved trees, ordinary missing-only Sectioning when a tree is absent, and Extract only for a genuinely fresh no-page state or the existing upstream policy. Stored empty/unreadable records remain existing records; server execution retains the authoritative validation and consent gates.
- Sidebar idle with retained output says output available (or needs attention for known missing coverage), without changing attempt completion or inventing freshness.
- The new notice does not promise that rerunning Storyboard alone repairs unreadable Sectioning. Existing restoration and per-page rejection requirements remain.

No backend/storage/publication change occurred in the F8 commit; the prior backend probes remain applicable by source comparison. Parent full checks, physical browser rerun, exact-head CI and packaging evidence remain separate publication gates. The only tracked uncommitted change during this final review was the author's INVARIANTS documentation link correction; owner drafts and probe material remained untracked and were not modified by this reviewer. Final independent verdict: no outstanding material finding in the revised B1 implementation at 5a9f9b48, with the previously stated compatibility and release-verification qualifications.

## Published-CI assertion-cost continuation

Published head `b2280e354827ada9d1da337a0d031db6e3b07f6f` had three timeout failures in `sectioning-resume.test.ts`; the log reports 31.756s, 30.230s and 32.908s against explicit 30s case limits. The fourth preservation case passed at 22.802s, the actual CLI fixture/refusal case passed at 1.665s, and 4,267 other tests passed. These were timeout failures, not failed semantic assertions. This reviewer read `/private/tmp/spec3-oct12-review/ci-failed.log` and the exact test. The log alone does not prove extraction itself was slow.

Independent isolated timing on the actual 5,704,567-byte Raven PDF: `expect(copy).toEqual(original)` took 9,991.823ms; `expect(copy.equals(original)).toBe(true)` took 1.4605ms. Deliberately changing a middle byte caused native equality to return false. Evidence: `byte-equality-timing.test.ts`, `byte-equality-timing.json`, `byte-equality-timing.log`. This identifies substantial unnecessary generic Buffer traversal while preserving an exact byte-equality check.

The writer applied only the exact PDF assertion substitution plus an explanatory comment. The explicit 30s integration-case bounds and 15s CLI child bound are unchanged; no global timeout, real extraction, SQLite, manifest comparison, provider-call count, rejection, history or preservation assertion was removed. Product runtime code is unchanged. The independent reviewer reran `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run packages/pipeline/src/__tests__/sectioning-resume.test.ts`: **8/8 pass, 6.69s total / 5.32s tests** (`resume-byte-equality-recheck.log`). At execution, HEAD remained b2280e35 with only this three-line test diff. The reviewed test file SHA-256 is `ecf577d46f20c5619d954511fe57e52a97f50d06adc404a6108d4a7f4d718aa6`.

Independent verdict on the correction: appropriate test-only optimization with unchanged exact-byte preservation semantics; it does not hide a semantic defect or relax a timing bound. Linux rerun and exact newly published-head CI remain the writer's verification gate. Do not call the original CI green or describe this evidence as proving slow PDF extraction.
