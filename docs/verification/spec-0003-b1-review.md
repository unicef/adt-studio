# SPEC-0003 B1 implementation review

Reviewed 2026-09-25 from a reviewer perspective against the complete published B1
contract, its narrative requirements and the surrounding application. This is not
an independent human approval. The specification remains in review.

## Reviewed state

- Starting local head: `d9be75df`, branch `spec/708-sectioning-mode-lifecycle`.
- Refreshed develop and PR base: `737d331418d13f930955504e8288ee26ec1b20ba`.
- PR #884 remote head: `04250fda6ba187b5712961e21c1dd3504aaedfe6`, still specification
  only. Its green hosted checks do not validate the local implementation.
- No posted PR comments or submitted reviews were present at refresh.
- Other PRs were inspected read-only; no dependency branch was merged or rewritten.

## Findings and remediation

| Severity | Reproduced behavior | Correction and evidence |
|---|---|---|
| P1 | Clearing Sectioning/translation completion, or merging a processed part into a previously current book, left the lifecycle marker ready. Storyboard admission then accepted output that the existing invalidation path had declared stale. | A shared storage helper revokes readiness before completion/content invalidation. Part merge shares writer admission and calls the same helper before its transaction. Read models mask retained successful completion when readiness is false. Real-storage regressions cover clearing translation completion and importing a processed part; both admission tests failed before the correction. |
| P1 | Fixed-layout rendering could publish after cancellation at step admission, because its asynchronous import was followed by processing/publication without another abort check. | Check cancellation after import and before publication. The real fixed-layout runner regression failed before the correction and verifies that prior rendering versions remain active. |
| P1 | Direct preview packaging and export preparation bypassed the Package stage's stale-state guard. They could report a cached build completed, or rebuild files from retained output, after a mode transition made Sectioning stale. | Reuse `prepareSectioningRun` before preview cache lookup/build and export rebuilding. Export preparation holds writer admission. Project backups skip generation and remain available without web assets; their archives already exclude generated bundles. Real packaging/cache and export regressions failed before the correction and verify unchanged retained output and an available project backup. |
| P2 | An adjacent Studio configuration save left the mode selector enabled. Saving also stopped appearing pending before authoritative queries returned, allowing a stale override map to undo a confirmed change. Settings error handling could restore a mode from an obsolete closure after an ambiguous timeout. | Track book-scoped configuration mutations across hook instances, await query invalidation/refetch, disable the adjacent Activity Detection control, refresh the library list as well as book/detail queries, and read current query-cache state when restoring Settings after failure. Real QueryClient/dialog tests cover adjacent saves, delayed refetch and a committed update whose response was lost. The adjacent-save test failed before the correction. |
| P2 | Cancelling a deferred run before execution still invoked preparation, clearing completion records even though no work should start. | Check the job's abort signal before preparation. A regression confirms that neither preparation nor the runner executes and prior completion is preserved; it failed before the correction. |
| P2 | TaskService emitted `task-start` before writer admission. A rejected task disappeared from server state but never emitted a terminal event, leaving subscribers with a phantom running task. | Emit start only inside admitted execution and handle synchronous executor failure through the promise failure path. The rejected-admission event regression failed before the correction. |
| P2 | Rendering publication did not include lifecycle readiness in its input comparison, so readiness could be revoked after preflight and the buffered output still published. | Include lifecycle state in the publication fingerprint. The regression revokes readiness between preflight and publication and checks retained rendering history; it failed before the correction. |
| P2, mitigated | A process killed inside an ordinary SQLite transaction, without a mode-transition journal, left an anonymous WASM database mutex. Admission removed the dead writer's ownership evidence, then failed with a generic database-lock error. | Preserve the original owner, mutex and SQLite recovery files and return actionable `BOOK_BUSY`. A real SIGKILL regression verifies unchanged recovery bytes. Automatic recovery of this case remains unavailable: without the transition's reader exclusion, the mutex cannot safely be attributed to the dead writer. No timeout-based lock deletion was introduced. |

The suspected busy-project-export response issue did **not** reproduce: export
already rejects before returning its stream. A regression now pins that behavior;
no export production change was made for that suspicion.

Invalidation deliberately writes `sectioningReady: false` before its associated DB
mutation. If the DB mutation fails, the book can remain conservatively stale while
its content/history remain intact. This is safer than falsely current output and
does not turn the mode-transition journal into a general content transaction log.
The mode-transition path itself retains its existing journal/recovery protocol.

## Verification

See [the AC-to-evidence matrix](spec-0003-b1.md#verification-results) for every
numbered criterion. Review regressions strengthen AC-7, AC-10–11, AC-15, AC-23–24
and the narrative preservation, cancellation and existing-system requirements.

- Initial failing reproductions: adjacent Studio save; rejected-task event;
  lifecycle change after preflight; cancellation before preparation; completion
  invalidation; part merge; fixed-layout cancellation.
  Preview cache acceptance and stale export rebuilding also failed their new
  regressions before correction.
- Intermediate focused verification: 6 files / 130 tests passed.
- Additional writer/runner/Studio verification: 3 files / 25 tests passed.
- The first full review run passed 282 files / 3,678 tests before the final
  packaging/export guard was added. The later output-focused run passed 79 tests
  and timed out one sign-language packaging test at its existing 20-second limit;
  that exact test passed in isolation (16 seconds of test execution). This is
  recorded as load sensitivity, not asserted to be a pre-existing failure.
- The final macOS arm64 unpacked Desktop build passed. A smoke test ran its actual
  packaged API bundle under Node 22 with `ADT_ENVIRONMENT=electron`, loopback only
  and a disposable synthetic book. It verified mode publication, stale read
  models, packaging rejection, independent writer rejection, project archive
  download and unchanged rendering versions/media. It did not launch the
  Electron GUI or utility process.
- Final full verification: `PATH=/Library/Developer/CommandLineTools/usr/bin:$PATH pnpm test --maxWorkers 2`
  passed **282 files / 3,680 tests**, including the pretest build, on the final
  runtime and test changes (214 seconds). Typecheck, runtime typecheck, lint and
  Lingui extraction also passed; lint reports eight unused-suppression warnings.
  An earlier final run was stopped after finding an obsolete route assertion that
  expected project backups to require web assets. That assertion now checks the
  generated ADT format; both the focused route test and the full suite passed.
- Final repository and Desktop results are recorded in the companion evidence
  report. Logs are retained under the primary checkout's
  `tmp/spec-0003-evidence/review-*.log`.
- Tests use real SQLite/filesystem persistence and independent child processes
  for recovery; Studio tests exercise the real mutation/query lifecycle. No
  representative partner-book/provider acceptance or new interactive browser
  acceptance is implied by these tests.

## Completion and confidence

**Approximately 80% of the requested B1 behavior is implemented**, using a
functional estimate rather than equal weighting of checklist items. The lifecycle,
preflight, admission, recovery, rendering publication and confirmation mechanisms
are present. The missing existing-book regeneration/resume workflow is a major
part of the user benefit, so 25 locally supported ACs out of 26 must not be reported
as 96% product completion. B2 modes and cross-page merge were excluded from this
task and are not included in the estimate.

Confidence is **high for the tested conservative B1 slice**, and **moderate for
unrestricted end-to-end rollout**. The
remaining workflows, general crash recovery, representative-book acceptance and
platform verification prevent a full-spec or release-ready claim. This is a
qualitative engineering assessment, not a statistical probability of correctness.

## Blockers and coordination

| Dependency/gap | Refreshed evidence | Consequence |
|---|---|---|
| SPEC-0002 / PR #880 | `5eeaab68665f594f828dcf448b30e52dc109ba7a`; published diff contains only its specification. | Main functional blocker: manual/unknown-origin provenance and preservation-safe Sectioning regeneration are unavailable. Existing Sectioning history must remain protected by rejection. |
| SPEC-0010 / PR #886; issue #810 | `d906d7f3aa39b8dc6b57b36c1971221cf16e4966`; published diff is documentation despite the partial-implementation title. | Existing-book CLI extraction/resume needs integrated admission/reuse and preservation. Current safe rejection is not the complete successful resume workflow. Local work in another task, if present, is not integrated evidence. |
| General interrupted-writer recovery | Reproduced by SIGKILL during an ordinary SQLite transaction without a mode journal. | Automatic recovery requires a safe ownership/reader-coordination design. This branch retains evidence and blocks for inspection. This is a separate engineering gap, not falsely attributed to an implemented spec. |
| SPEC-0001 / PR #879 | `375081fc3ba84b185861c7977623ae2d589eb34a`; documentation only. | Richer freshness remains unimplemented, but is **not a hard B1 blocker** because conservative completion invalidation is explicitly allowed. |
| SPEC-0012 / PR #888; issues #515/#580 | `b850875cad8744ad49a0d4adf25422bae599e28e`; published diff is documentation. | Future synchronization must respect this readiness/preflight boundary. It is coordination work, not a prerequisite for the already implemented conservative slice. |
| Review and release evidence | Spec/ADR decisions remain pending; no implementation push. | Human ratification, hosted CI for the implementation, representative-book acceptance, packaged-app launch and platform/release checks remain outstanding. Approval sequencing did not prevent the authorized implementation. |

The merged #692 generation/cache validator remains reused. No B2 implementation,
new package dependency, spec approval, issue closure, push or merge is implied.
