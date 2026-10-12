# Independent SPEC-0010 acceptance review — frozen integration

> Latest disposition: the separate reviewer passed the final `8c66c2fc` recheck, with all known material findings resolved. Earlier failed verdicts are retained chronologically below. The final requirement matrix and dynamic-Liquid compatibility qualification are at the end; platform/full-suite/CI results belong to the author acceptance ledger.

Reviewer: delegated read-only acceptance agent, separate from implementation author. Reviewed head `cf66de8614cd256eea9f2bd51c3d8252ade25e1a`; exact prerequisite `c71605454126c29f8f6e5dab56ee90385012b886`. Target PR #886. No tracked implementation, test, document or branch edits were made by this reviewer.

**Current independent runtime-review verdict: passed at `8c66c2fc02cc6c443e101e5fd4f9549f6d89c756` (runtime unchanged from `26b042cb6e059e3e9f98d145b8fa545d60526b87`). No known material findings remain. See final recheck below; final repository/platform/hosted-CI publication gates remain separately owned and must pass. Historical verdict at cf66de86 was changes requested for F12.** The eleven original adversarial probes pass and the integrated admission/resume/publication group passes 107 tests, but an independently reproduced package-status reader bypass remains. This is not an admission-only implementation: successful Extract-to-Package, current reuse, selective generation and real bundle recovery are demonstrated. It is not yet an unqualified final publication approval. Later frozen recheck, if supplied, is appended below rather than retroactively describing this head as defect-free.

## Basis and independent method

I read the original SPEC-0010 and original R1–R10 at `backup/spec0010-before-oct12-integration`, amended SPEC-0010/ADR 026, SPEC-0001/0002/0003, and the complete authoritative SPEC-0003 product reviews 5368403884 and 5486273946 from the refreshed review snapshots. I derived the maps below independently, before relying on the author's evidence matrix. I reviewed prerequisite-relative changes, tracing Studio decisions and ordinary Run through HTTP validation, immediate/queued services, common stage execution, writer admission, transactions/publication, current stored versions, output catalog and package/read paths. Source review included direct extraction, fresh CLI/DAG, occupied resume, targeted/combined stages, ordinary single-stage warnings, fixed/reflowable publication and active windows.

Private probes use real SQLite/filesystem, committed Raven PDF, and stub actual fetch/provider transport without paid calls. Process tests use independent Node processes and SIGKILL. Tests run from the frozen worktree with previously built dependency output; source-alias probes independently exercise current source. I did not claim the author's browser, Docker, Desktop or full-suite work as my own execution.

## Original requirements mapped to authorized amendments

No original AC is removed. AC-4 now distinguishes immutable extraction capabilities from later rendering-layout preference; explicit extraction-option changes still reject. AC-12/13 and R2/3/9/10 consume the saved semantic tree, including edited/empty trees: ordinary Sectioning is missing-only, and By Page cardinality validates generation/cache responses only. AC-8/12 and R5/6/10 use exact semantic/rendering-version consent and committed scoped reset. AC-12/13 and R6/9 require immediate successful page publication; only an actual layout transition publishes a whole active window atomically. AC-12/13 use saved-tree coverage and actual package manifest/files, distinguish usable warnings from currentness, and retain strict full-resume nonzero behavior. AC-8/12/13 and R3/5/10 bind decisions to selected owner revisions, separate collection AI facets from protected items, and allow ordinary single-stage usable-warning attempts without claiming complete freshness. AC-8/18 retain raw/history/assets for unverifiable rendering ownership, omitting only unsafe ownership from preview/export with warning; absent authorship alone does not omit output.

These are owner-authorized reconciliation decisions, not reviewer approval of the specification. Existing in-review metadata must remain truthful.

## AC-1–18 evidence matrix

Status describes frozen implementation evidence, not release certification. A passed row can retain an explicitly listed platform-verification limit.

| AC | Status | Independent evidence and precise boundary |
|---|---|---|
| 1 | Passed | `extraction-admission.test.ts` complete durable manifest, final-manifest rename failure, actual initial CLI; full-resume real extraction fixture. Manifest follows durable source/inventory publication. |
| 2 | Passed | Admission equivalence/reuse compares source/page/image/history/IDs/cache; full-resume repeated all-current histories and transport counts. |
| 3 | Passed | Same-length changed bytes reject before stored PDF/rows/media mutation; actual DAG and CLI rejection. |
| 4 | Passed | Normalized defaults/spreads/windows and explicit mismatch tests; reviewed config resolver retains original verified extraction fixed-layout basis while rendering preference changes independently. Missing positioned input remains a compatibility restriction. |
| 5 | Passed | Real admission corrupt/missing assets, invalid/incomplete/zero-page inventory fixtures refuse reuse; no source mutation/provider work. |
| 6 | Passed | Legacy/untrusted manifest refusal tests and common preparation trace; no guessed provenance or legacy reset fallback. Ordinary downstream editing may remain available without pretending extraction was verified. |
| 7 | Passed | Cancelled extraction, failed final rename and killed-process extraction preserve incomplete diagnostics; restart cannot infer completion. |
| 8 | Passed | Histories/stable IDs/manual Core TTS/uploaded audio-video and referenced assets retained; private mixed collection, no-op quiz, glossary trust and exact-revision tests; archive tests. F2/F3/F6/F7/F9/F11 repaired. |
| 9 | Passed | Direct/API/CLI admission tests and shared call ordering show mismatch rejected before copy/clear/writable content/provider work. |
| 10 | Passed | API admission, direct stage, actual CLI, full HTTP and duplicate queued runs all tested; F4/F7 repaired by common scoped execution rather than legacy fallback. |
| 11 | Passed | Independent-process writer/recovery tests cover live ownership, killed owner, anonymous SQLite mutex fail-closed. Cancellation cleanup now occurs inside original lease by source review; no age-based stealing. |
| 12 | Failed | Successful full pipeline, selective protected resume, genuine unsupported capability refusal and real package recovery otherwise pass. F12 still exposes package completeness through actual status route during unresolved publication, violating integrated read-model/recovery agreement. |
| 13 | Failed | Actual CLI/HTTP current zero-call/no-version-churn and required unresolved nonzero pass; F1 false coverage and F6 skipped publication fixed. F12 still advertises complete package while serving is blocked. |
| 14 | Passed | Normal valid/invalid cache and ordered request behavior retained; admission/cache and catalog-resume tests count actual transport requests, not only mocked helper calls. |
| 15 | Passed | Fresh user-selected label extracts without touching original book or transferring edits/IDs; source mismatch guidance remains explicit. |
| 16 | Not run (complete criterion) | API/CLI reason/privacy paths reviewed and admission tests pass; five locale catalogs and localization wiring reviewed. Reviewer did not execute Lingui extraction/strict compile or full Studio language flows; author must supply current exact-head results before marking entire criterion passed. |
| 17 | Passed | External PDF mutation after snapshot test proves actual extraction/manifest refer to immutable stored snapshot. |
| 18 | Passed | Real project archive/export/import tests retain source/manifest/history/referenced media and strip writer artifacts; provenance stays in book directory. Streaming archive lease lasts through production/drain. |

## Integration R1–R10 matrix

| Scenario | Status | Independent evidence and limits |
|---|---|---|
| R1 | Passed | Actual full CLI and HTTP, real bundle generation, second queued/current run zero transport and no content-version churn; full-resume and API full-resume suites. |
| R2 | Passed | Private mixed quiz plus catalog selective translation/caption tests preserve manual neighbor and unaffected IDs/history; eligibility generates exactly required request; current repeats reuse. |
| R3 | Passed | Manual/unknown ordinary API and full-resume probes retain content; collection AI facet does not authorize protected item deletion or whole-book acceptance. Required unresolved full scope remains incomplete/nonzero. |
| R4 | Passed | Genuine unsupported runtime/dynamic prompt refuses safely; supported current scopes ignore unrelated unsupported prompts; missing Sectioning is runnable; no unconditional legacy fallback. |
| R5 | Passed | Real-process admission; stale plan/publication race; same-content version ABA; stale shared-owner bulk Keep rejects whole transaction; classification versions bind extraction decisions. Cancellation lease source fix reviewed. |
| R6 | Failed | Independently run incremental API first page while slow second success/failure/cancel, late Skip, rollback, SIGKILL package recovery and extraction interruption pass. F12 actual package status ignores recovery barrier. Browser clickability is author evidence, not this reviewer's execution. |
| R7 | Passed | Actual HTTP duplicate queued full runs and queued source-manifest mutation tests; second request reassesses after writer admission and does not duplicate provider/content versions. |
| R8 | Passed | Real stubbed transport/cache tests validate valid/invalid cache and retry; corrected private changed prompts alter content inside chat so assertions genuinely reach provider boundary. |
| R9 | Passed (automated/source scope) | Independently reran 45 tests covering both modes × fixed/reflowable/part-window HTTP continuation, missing-only/explicit reset, structural saved trees, stale semantic/HTML/tree versions, whole-window transitions and rollback, page API availability and package/read coverage. Browser clickability and packaged-platform repetitions require separately attributed author evidence; reviewer did not independently operate a browser. |
| R10 | Passed | Explicit page selection and exact owner revisions, stale replacement, aggregate protected collection refusal, atomic batch Keep, required glossary baseVersion and forged-evidence rejection. Keep cannot certify incomplete coverage or AI authorship. Default-off Sectioning UI/shared reset traced. |

## Independent findings and fixes

| Finding | Severity and user impact | Frozen recheck |
|---|---|---|
| F1 | P1: Keep certified incomplete Storyboard as current, allowing false completion. | Fixed; private coverage probe and shared coverage guard pass. |
| F2 | P1: one manual quiz froze an eligible stale AI neighbor. | Fixed; per-item protection/AI facet, exact transport count and preserved manual data pass. |
| F3 | P1: selected Sectioning expanded generation to unrelated missing pages. | Fixed; private selection and active-scope consent source review pass. |
| F4 | P1: global missing-Storyboard gate falsely refused valid Sectioning continuation. | Fixed; private selected Sectioning continuation passes; only genuine required missing scope remains incomplete. |
| F5 | P2: cancellation released writer before cleanup and reacquired it later. | Fixed by source inspection: cleanup inside admitted operation. Process admission/recovery suite passes; reviewer did not reproduce the old narrow timed cancellation race. |
| F6 | P1: late Skip published abandoned output while reporting it skipped. | Fixed; corrected provider-boundary probe passes. Original outside-chat prompt probe was invalid/cache-hit; corrected version failed on isolated original f39 and passes here. |
| F7 | P1: ordinary Studio/API Storyboard Run replaced manual content without consent. | Fixed; real Hono ordinary request preserves edits under shared catalog execution. |
| F8 | P2: unrelated dynamic prompt blocked otherwise supported current output. | Fixed; lazy scoped capability projection private probe passes. |
| F9 | P1: stale aggregate replacement deleted newer protected collection item. | Fixed; AI facet cannot grant protected-item replacement; stale/aggregate private regression passes. |
| F10 | P2: missing unrelated Storyboard blocked valid selected downstream translation. | Fixed; one selected transport call and preserved unrelated state pass. |
| F11 | P2: unchanged quiz Save discarded server evidence, causing new identities on rerun. | Fixed; Hono no-op Save/current repeat preserves IDs and histories. |
| Revision/Keep | P1 safety gap: hash-only review admitted same-content version ABA; batch shared-owner decisions needed atomic prevalidation. | Fixed; exact revision plus stale-member rollback and valid manual/unknown batch test pass. |
| Glossary/targeted render | P1 stale-save/trust gap: glossary draft Save lacked version binding; targeted complete render did not establish reusable trusted evidence. | Fixed; missing/stale baseVersion reject, forged evidence ignored, unchanged server evidence retained, edited authored content remains manual; targeted render then ordinary current reuse zero calls/history pass. |
| F12 | P2: `GET /books/:label/package-adt/status` says `hasAdt:true, complete:true` with unresolved `.package-publication.json`, while actual package serving fails closed. Regex only matches `/package/`, not `/package-adt/status`. Reader sees a complete artifact before journal recovery establishes publication. | **Open at cf66de86.** New private real Hono test fails expected409 versus actual200. No destructive publication claim: `packageAdtWeb` already shares safe attempt publication. |

F12 minimal fix: extend the existing package-read middleware guard to the actual status route, add its real route regression, preserve dynamic saved-tree preview availability if it does not read packaged artifacts, then freeze and independently recheck. Do not add a second publication or lock system.

## Reviewer-run commands and results

- `pnpm exec vitest run --config /private/tmp/spec10-oct12-independent/vitest.config.mjs` at frozen head before adding F12: **11 files / 11 tests passed**, 24.54 seconds. `frozen-private-cf66de86.log`.
- Independent focused invocation of book-writer, book-writer-recovery, pipeline/API extraction-admission, extraction-archive, pipeline full-resume/catalog-resume/generation-publication, API catalog-resume/full-resume/resume-incremental/resume-review-revisions/resume-review-glossary-targeted: **13 files / 107 tests passed**, 272.69 seconds. `frozen-integration-cf66de86.log`.
- `pnpm exec vitest run --config /private/tmp/spec10-oct12-independent/vitest.config.mjs /private/tmp/spec10-oct12-independent/package-journal.test.ts`: **1 test failed**, expected409 actual200, 8.36 seconds. `package-journal-cf66de86.log`. First setup attempt had an unresolved private Hono import and ran no tests; corrected absolute dependency import produced the behavioral failure.
- `pnpm exec vitest run apps/api/src/services/sectioning-existing-book.test.ts apps/api/src/services/sectioning-preflight-runners.test.ts apps/api/src/services/storyboard-publication.test.ts --maxWorkers=2`: **3 files / 45 tests passed**, 32.12 seconds. `frozen-layout-cf66de86.log`.
- Earlier fail-before evidence and live rechecks remain in private `review.md` and named logs. The swallowed-RESUME_INCOMPLETE stage-runner diagnostic is explicitly not an acceptance test. Artificial delayed fake TaskService probe is not a production defect because real service owns writer before executor deferral.

## Limits, qualifications and downstream implications

- Parent must supply final full repository suite, root/runtime typechecks, lint/build/invariants, Lingui extraction/strict compile, copied-book/browser flows, combined Docker actual runtime/export/restart in both layouts and Desktop bundled API/resources. This reviewer has not independently certified those or hosted CI.
- Signed releases, full Electron GUI and other OS installers remain release-verification limits, not evidence of a functional dependency gap.
- Legacy provenance cannot be guessed. Unverifiable rendering ownership remains physically recoverable but is omitted from preview/export with warning. Actual extraction inventory differences require a fresh label; later rendering layout uses the original verified extraction capabilities.
- Protected quiz/glossary items use explicit item editor replacement with exact versions or Keep; aggregate generation cannot erase them. Ordinary warning-bearing attempts may finish while their freshness summary remains incomplete. Full resume remains strict.
- SPEC-0003 B2/cross-page merge and unrelated CLI progress redesign remain outside scope. Pending human review of SPEC-0001/0002/0003/0010 is not an implementation blocker or automatic approval.
- At this frozen head the revised B1 implementation is functionally broad and substantially accepted by independent regressions, but **not complete for publication while F12 remains open and final verification gates remain outstanding**. Do not substitute a percentage or green historical CI for those concrete gates.

## Frozen-head recheck — 26b042cb6e059e3e9f98d145b8fa545d60526b87

Exact prerequisite remains `c71605454126c29f8f6e5dab56ee90385012b886`. Reviewed the entire four-file delta from cf66de86: package reader middleware, shared package coverage, real recovery-status regression, and cancellation-test synchronization. No tracked files were edited by reviewer.

**F12 is independently fixed. No known material runtime correctness or data-loss finding remains from this review.** Actual `/package-adt/status` now returns409/BOOK_BUSY while the journal exists; library/package completeness also fails closed without altering history or journal evidence. Required HTML must be a regular file, not a directory/symlink. Dynamic saved-tree preview has not been unnecessarily coupled to packaged-artifact recovery. Full package publication followed by all-current reuse still passes, including temporary coverage suppression during journaled commit.

Reviewer execution at this new head:

- Private original F12 regression: **1/1 passed**, 3.25s, `recheck-package-26b042cb.log`.
- Targeted tracked package recovery/read model and real whole-book package/current-reuse checks: **2 passed**. The third selected combined cancellation/queued-stale test **timed out at its unchanged20s project budget**, reporting29.245s under concurrent author full-suite/platform work. No content/version/provider assertion failed; logs show cancellation followed by correct queued `VERSION_CONFLICT`. Overall command:1 failed/2 passed/59 skipped,116.14s. `recheck-affected-26b042cb.log`. This is an observed failed check, not a passed check or a claim of a pre-existing failure.
- The cancellation test's new provider-start and cancellation-event barriers preserve assertions and avoid the prior polling/leaked-provider behavior. Remaining queued-half polling and the combined scenario budget should be replaced by two independent deterministic tests, preserving all version/provider assertions. Do not broaden timeouts as a substitute.

Current requirement disposition after F12 repair:

| Criterion | Current status | Evidence/limit |
|---|---|---|
| AC-1 | Passed | Original frozen admission/CLI evidence, unchanged runtime. |
| AC-2 | Passed | Original frozen equivalence/history evidence; current real package repeat also passes. |
| AC-3 | Passed | Same-byte-length mismatch tests, unchanged runtime. |
| AC-4 | Passed | Extraction/rendering distinction and scoped layout tests, unchanged runtime. |
| AC-5 | Passed | Manifest/inventory rejection, unchanged runtime. |
| AC-6 | Passed | Legacy rejection, unchanged runtime. |
| AC-7 | Passed | Interruption/process restart evidence, unchanged runtime. |
| AC-8 | Passed | Independent preservation/revision/editor probes and layout group, unchanged runtime. |
| AC-9 | Passed | Common no-mutation admission tests, unchanged runtime. |
| AC-10 | Passed | Real direct/CLI/HTTP/queued entry coverage, unchanged runtime. |
| AC-11 | Passed (runtime evidence) | Independent process/admission suite remains valid; final combined cancellation-test timeout must be resolved as a verification gate. |
| AC-12 | Passed | Full preservation-aware resume plus independently repaired F12 read barrier; no known capability gap in declared B1. |
| AC-13 | Passed | Zero-call/current/nonzero semantics and now journal-aware completion; real package repeat at new head passes. |
| AC-14 | Passed | Real transport cache evidence, unchanged runtime. |
| AC-15 | Passed | Fresh label/original unchanged evidence, unchanged runtime. |
| AC-16 | Not run (entire criterion by reviewer) | Localized error wiring reviewed; author must supply current Lingui/strict locale results. |
| AC-17 | Passed | Immutable snapshot race evidence, unchanged runtime. |
| AC-18 | Passed | Real archive roundtrip/history/asset evidence, unchanged runtime. |
| R1 | Passed | Real package/current rerun also passed at new head. |
| R2 | Passed | Selective stale/mixed/private evidence, unchanged runtime. |
| R3 | Passed | Authored/unknown protection and collection exact consent evidence, unchanged runtime. |
| R4 | Passed | Safe true-capability refusal/scoped supported paths, unchanged runtime. |
| R5 | Passed (runtime evidence) | Process and exact-version evidence; final combined cancellation/queued test is a recorded verification failure requiring deterministic split/recheck. |
| R6 | Passed (runtime evidence) | Partial publication/restart/Skip evidence; F12 independently fixed. Same cancellation test gate remains. |
| R7 | Passed | Duplicate queue/reassessment original frozen suite, unchanged runtime. |
| R8 | Passed | Valid/invalid cache actual transport checks, unchanged runtime. |
| R9 | Passed (automated/source scope) | Independent45-test both-mode/layout/part/reset group plus current package-read regression. Browser/platform remains separately attributed. |
| R10 | Passed | Revision ABA/atomic Keep/exact save/consent evidence, unchanged runtime. |

The revised B1 functional implementation is present and no remaining functional dependency blocker was identified. Confidence is high in exercised runtime behavior. **Publication readiness is still conditional on the unresolved test-timeout gate, current full repository checks/localization/platform results and exact published-head hosted CI.** The author reports Desktop and Docker both-layout runtime/export/restart evidence for cf66de86 and plans final bundle rebuilds; these are author evidence, not independently executed or release-certified by this reviewer. Formal human approval remains pending.

### Test synchronization follow-up (reviewed before test-only freeze)

Reviewed the proposed split of cancellation and stale queued TOC into separate tests, deterministic provider-entry/error promises, and event-based run helper. Assertions still require preserved semantic versions, unchanged retained TOC, queued VERSION_CONFLICT, exactly one provider call and expected committed version. The helper crosses one `setImmediate` boundary after the terminal event because `startStageRun` owns an outer admission promise around nested `executeJob`; the terminal event occurs before outer promise release. A subsequent actual HTTP request executes after that microtask unwind, while synthetic Hono calls can enter immediately. This synchronization is valid and does not swallow409, weaken guards or raise timeouts. Exact test-only frozen-head execution remains to be appended.

## Final independent recheck — 8c66c2fc02cc6c443e101e5fd4f9549f6d89c756

Runtime remains exactly `26b042cb6e059e3e9f98d145b8fa545d60526b87`; prerequisite remains `c71605454126c29f8f6e5dab56ee90385012b886`. Confirmed the entire new commit changes only `manual-edit-survival.test.ts`. The deterministic test changes were source-reviewed above.

Reviewer executed:

```sh
pnpm exec vitest run apps/api/src/routes/manual-edit-survival.test.ts --testNamePattern 'cancels section replacement before publication while preserving saved semantics|rejects a queued stale confirmation after the preceding TOC run publishes' --maxWorkers=1
```

**2 passed /37 intentionally filtered tests skipped;4.35s.** `recheck-split-8c66c2fc.log`. Cancellation preserves saved semantic versions/TOC; queued stale exact-version consent is rejected after predecessor publication with exactly one generation call. No assertion or timeout was weakened. This resolves the reviewer-observed combined-test timeout gate; it does not retroactively convert that previous failed run to a pass.

I also inspected the author's `lingui-final-extract.log` and `lingui-final-strict.log`: extraction reports3,788 messages in each locale, zero missing translations in es/fr/pt-BR/sq, followed by successful strict catalog compilation. Together with reviewed error wiring and exercised CLI/API reason handling, this supplies AC-16 evidence. These locale commands were **author-run and reviewer-inspected**, not independently executed by reviewer. Full linguistic/editorial translation review is not claimed.

### Final independent requirement verdict

All original numbered criteria remain represented. Prior evidence tables retain historical failures transparently; this table is the current runtime acceptance disposition after fixes and recheck.

| AC | Current status | Evidence basis |
|---|---|---|
| AC-1 | Passed | Durable fresh extraction/admission and actual CLI. |
| AC-2 | Passed | Equivalent source reuse, preserved histories/IDs/assets, real package current repeat. |
| AC-3 | Passed | Same-length changed bytes rejected before writes/provider. |
| AC-4 | Passed | Verified extraction options separated from rendering preference; explicit mismatch rejected. |
| AC-5 | Passed | Invalid/incomplete/corrupt/missing manifest assets refused. |
| AC-6 | Passed | Legacy provenance refusal without guessed adoption/deletion. |
| AC-7 | Passed | Failed/cancelled/killed extraction cannot become complete by assumption. |
| AC-8 | Passed | Authored/unknown content, complete histories, stable IDs and physical assets retained. |
| AC-9 | Passed | Common admission precedes destructive preparation/provider paths. |
| AC-10 | Passed | Direct, CLI/DAG, HTTP and queued common policy. |
| AC-11 | Passed | Independent process exclusion/recovery plus deterministic cancellation/stale queue recheck. |
| AC-12 | Passed | Successful shared downstream resume; true capability refusal; F12 reader repair. |
| AC-13 | Passed | Current zero-call/no-churn and truthful unresolved/nonzero/completeness; actual package barrier. |
| AC-14 | Passed | Actual transport valid/invalid cache reuse and retry evidence. |
| AC-15 | Passed | Fresh user-selected label with original book unchanged. |
| AC-16 | Passed | Independent API/CLI/error review plus reviewer-inspected author Lingui extraction/strict compile logs. |
| AC-17 | Passed | Immutable source snapshot survives external-source mutation. |
| AC-18 | Passed | Real archives retain book-local provenance/history/media and omit stale ownership. |

| Integration scenario | Current status | Evidence basis |
|---|---|---|
| R1 | Passed | Actual CLI/HTTP full package generation and all-current repeat. |
| R2 | Passed | Selective eligible work with protected/unaffected neighbors preserved. |
| R3 | Passed | Manual/unknown per-unit protection and truthful unresolved reporting. |
| R4 | Passed | Unsupported capabilities safely rejected, unrelated unsupported work does not block supported scope. |
| R5 | Passed | Process writer, exact revisions, stale publication/consent, atomic batch Keep and final queued test. |
| R6 | Passed | Incremental page API visibility, failure/Skip/cancel, SIGKILL/restart and package reader recovery. Browser clickability is author-run evidence. |
| R7 | Passed | Duplicate queue reassessment and exact stale queued confirmation, no duplicate generation. |
| R8 | Passed | Real stubbed transport/cache/retry accounting. |
| R9 | Passed | Independent45-test HTTP/layout/mode/part-window/reset/publication group plus package repair. Browser and bundled-platform repetitions remain separately attributed. |
| R10 | Passed | Scope-/version-bound replacement and atomic acceptance, no invented coverage/authorship. |

**Independent acceptance conclusion:** the full revised SPEC-0010 B1 functional contract is implemented for supported configurations as reviewed and exercised (see the explicit dynamic-prompt compatibility qualification below), with no remaining known material correctness/data-loss finding and no newly identified unimplemented prerequisite blocking B1. This is successful preservation-aware resume, not safety-only refusal. Confidence is high in the exercised runtime integration.

**Publication limits remain:** parent must finish the current bounded full repository run, final root/runtime typecheck/lint/build/invariants/localization verification as applicable, final Docker/Desktop bundle verification, and exact pushed-head hosted CI. The author reported preceding resource/deadline failures; this reviewer does not call them pre-existing or completed checks. Report those command outcomes accurately. Browser clickability, copied-book runs, Docker/desktop runtime/export/restart and full-suite results remain author evidence; signed release/all-platform/Electron GUI certification is not claimed. Compatibility restrictions and pending formal product/spec review remain as detailed above, separate from functional gaps.

### Explicit functional compatibility qualification: dynamic Liquid dependencies

Final source/spec recheck distinguishes a real unsupported feature from a pending prerequisite. `createPromptEngine().fingerprint()` follows literal `include`, `render` and `layout` targets, but rejects non-literal/dynamic targets because the current fingerprinting implementation does not prove their dependencies. `generation-catalog` exposes this as unavailable capability; requested verified resume fails with `UNSAFE_RESUME_UNAVAILABLE` before downstream content/provider work. Scoped unrelated supported work remains runnable (F8 regression). This limitation is documented in the already published full-resume evidence and is consistent with original AC-12/R4's fail-closed branch. It is not proof that successful dynamic-prompt resume is implemented, and it is not merely a release-verification limit.

Accurate completion wording: **The revised B1 Extract-to-Package implementation is complete for supported configurations. Custom Liquid prompts with dynamic include/render/layout targets remain unsupported for safe resume and fail closed; literal dependencies are fingerprinted. This is a documented functional compatibility restriction, not a missing SPEC-0001/0002/0003 stage-family prerequisite.**

AC-12/R4 pass for the required safe-refusal behavior. Successful resume of these unsupported custom prompts is not implemented and must not be described as passed. Do not claim every custom prompt configuration works or make an unqualified assertion of no functional limitations. If the intended product promise expands to arbitrary dynamic prompt dependencies, that capability would require further shared fingerprinting work and would then be an outstanding functional gap. This review does not silently add that promise or reclassify the limitation as a non-goal through an evidence report.
