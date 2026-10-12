# SPEC-0003 B1 continuation audit

> Historical evidence. The October 12 product amendment supersedes the persisted-mode gates and whole-run publication described here. See the [current contract and complete acceptance audit](spec-0003-oct12-audit.md) and [new independent review](spec-0003-independent-review-2026-10-12.md). These earlier passing results do not certify the revised behavior.

Started 2026-10-10 against published PR #884 head `e3737abe`.
Human approval remains pending. This audit does not amend the acceptance criteria.

## Pre-edit acceptance map

The historical reports are hypotheses to verify on the integrated head. `L` means
`apps/api/src/services/sectioning-lifecycle.test.ts`, `R` means
`apps/api/src/services/sectioning-preflight-runners.test.ts`, `P` means
`packages/pipeline/src/__tests__/sectioning-preflight.test.ts`, `U` means
`apps/studio/src/hooks/use-sectioning-mode-confirmation.test.tsx`, `W` means
`packages/storage/src/__tests__/book-writer.test.ts`, and `C` means
`packages/pipeline/src/__tests__/page-sectioning.test.ts`.

| AC | Current source behavior / required work | Concrete verification |
|---|---|---|
| 1 | Effective Dynamic → Page uses derived completion invalidation; retain | L: affected completion closure |
| 2 | Reverse transition uses the same closure; retain | L: Page → Dynamic |
| 3 | Extract is outside the closure; retain | L: unchanged extraction rows/assets |
| 4 | Mode save creates no content versions; retain | L: histories/pointers/media snapshots |
| 5 | Effective equality avoids invalidation; retain | L: same-mode save |
| 6 | Unrelated updates avoid mode invalidation; retain | L and U: adjacent saves |
| 7 | Shared writer plus active work checks; audit recovery reservation race | L/W: HTTP 409, independent process, no writes |
| 8 | Existing dialog covers retained/completed output; retain | U: rendered dialog |
| 9 | Cancel does not submit; retain | U: mutation count |
| 10 | Failure refetches authoritative config; retain | U: conflict and ambiguous response |
| 11 | Query refresh includes current-state indicators; retain | U/L: refetch and read-model state |
| 12 | Missing persisted input blocks By Page; review proposes incompatible amendment | P/R: missing active page, no calls |
| 13 | Empty persisted input blocks By Page; same unresolved amendment | P/R: empty sections |
| 14 | Multi-section input blocks By Page; same unresolved amendment | P/R: multiple sections |
| 15 | Publication buffers then commits atomically; fix active render-tree switching | R/L: cancellation, SQLite abort, unchanged prior tree/HTML |
| 16 | Valid By Page publishes if lifecycle is current; fix fixed → reflowable tree selection | R: successful layouts and downstream resolver |
| 17 | Dynamic permits multiple sections; retain | P/R: positive Dynamic publication |
| 18 | Historical input is checked; unknown lifecycle fails closed | P/L/R: legacy, null, malformed, historical versions |
| 19 | Shared guard exists, but existing-book regeneration/resume is rejected | R: API/queue/targeted/part positives; CLI safe refusal; full chain blocked by absent preservation |
| 20 | Five locales exist; reconcile develop catalog updates | Lingui extraction/compile and Studio lint |
| 21 | No B1 dependency additions required | Diff package manifests/lockfile against develop |
| 22 | Resolver handles inheritance/removal and schema rejection | L: global defaults, removal, invalid value |
| 23 | Mode journal recovers; ordinary anonymous DB mutex fails closed | L/W: fault boundaries and SIGKILL, retained recovery bytes |
| 24 | Execution/publication revalidation exists; include active positioned tree in snapshot | L/R/W/U: queued changes, positioned-tree edits, competing writer and adjacent saves |
| 25 | Structured full count with 20 displayed page identities | P/R: bounded translated failure details |
| 26 | Reuses #692's validator/cache path | C: counted provider transport calls, invalid eviction/retry and valid reuse |

## Published prerequisites and review conflict

- Current develop: `ef31494d`; target base previously `737d3314`.
- SPEC-0001 #879: `a1fc11a2`, four documentation files only. Its usable downstream
  warnings apply to captions/easy-read/translation/speech; Storyboard freshness is
  explicitly excluded. They do not by themselves amend SPEC-0003's mode gate.
- SPEC-0002 #880: `d2348233`, specification only (stacked on an older SPEC-0001).
  Unknown authorship is now protected in the proposal, but the shared preservation
  foundation and Sectioning replacement implementation are absent.
- SPEC-0010 #886: `876cc2ae`, published safe extraction/reuse implementation. Its
  downstream executor still returns `UNSAFE_RESUME_UNAVAILABLE`; verified
  extraction alone cannot enable AC-19. Inspect and adapt applicable shared writer
  fixes with attribution; do not duplicate its extraction subsystem here.
- SPEC-0012 #888: `b850875c`, published specification only. Local unpublished work
  in other checkouts is not a dependency.
- Reuses merged #692 by @KaReeeeeeeeEM; no modifications to that PR.

[The September 30 review](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5368403884)
proposes warnings/page skips instead of AC-12–16 rejection, informational lifecycle
metadata, per-page publication, no preview/export lifecycle gate and an in-process
lock. Those are material changes to the published contract, especially supported
cross-process admission. The current task explicitly requests the published spec,
incompatible-output protection and recovery evidence. Clarification was requested;
no amendment or approval is inferred from the review. Fixes that are correct under
both contracts can proceed independently.

The target's original head is preserved as
`backup/spec-0003-before-b1-continuation-20261010`. The primary checkout and other
implementation checkouts are untouched. No push, replacement PR or merge is
authorized by this continuation.

## Final integrated evidence (2026-10-10)

**Only the conservative B1 slice is implemented. Full AC-19 and the requested
successful existing-book chain remain blocked.** The 25 passing rows below are
bounded development evidence, not a completion percentage or human acceptance.

Runtime/test head: `1d51740caff0226552067a61584816ba4f007664`, rebased onto develop
`ef31494dc2951b92222c473960fecee2d91f9544`. Documentation follows in a separate
commit. Local alias: `spec/SPEC-0003-708-sectioning-mode-lifecycle`; remote name
unchanged. Final remote refresh still found `e3737abe6bd32e09302571a8f3de153cff37a365`.
Nothing from this continuation is pushed; the PR's hosted diff still predates this
rebase and these fixes.

### Corrections and attribution

- `339ecc1b`: adapted the orphaned recovery-reservation guard from published
  SPEC-0010/#886 `876cc2ae`. A reservation without a writer owner is not evidence
  that recovery finished. The new independent-process regression failed before
  the guard and passes without deleting recovery evidence.
- `1d51740c`: fixed layout changes that left a positioned tree active beside new
  semantic HTML. Reflowable publication appends a null positioned-tree version
  in the same SQLite transaction as replacement HTML. Old trees/HTML remain in
  history. The reader selects the newly published semantic tree; config saves
  alone do not switch it.
- Publication now compares active positioned-tree versions and rejects an
  incomplete requested page batch (including a fixed-layout page lacking a
  viewport). Whole-page replacement is required when a targeted semantic section
  would otherwise mix with retained positioned HTML. Cancellation, conflicts and
  transaction failure preserve both prior components.
- Three layout/stale-tree regressions and the recovery-reservation regression
  reproduced failures before correction. A first fixture draft lacked required
  colors and was corrected before recording the meaningful layout reproduction.
  One queue-test expectation assumed completed jobs remained active; it was
  corrected to assert two completion events, an empty queue and no active job.
  Production queue semantics were unchanged.
- #692 by @KaReeeeeeeeEM remains the generation/cache implementation. Its code is
  reused, not duplicated. #886's full extraction subsystem was not copied:
  published downstream resume still intentionally refuses unsafe work.

### All 26 acceptance criteria

Suite keys L/R/P/U/W/C are defined above. **S** is
`apps/api/src/services/storyboard-publication.test.ts`; **W2** is
`packages/storage/src/__tests__/book-writer-recovery.test.ts`; **E** is
`apps/api/src/services/export-service.test.ts`. The complete repository suite
includes the packaging, page-edit, storage, identity and pipeline invariant tests.

| AC | Status | Current integrated evidence |
|---|---|---|
| 1 | Passed | L: Dynamic → By Page invalidates the PIPELINE-derived Sectioning/downstream completion closure. |
| 2 | Passed | L: By Page → Dynamic invalidates the same closure. |
| 3 | Passed | L: Extract completion, source-page/image rows and bytes remain unchanged. |
| 4 | Passed | L/E: mode changes retain every seeded version, active identity and referenced media byte; project archive remains available. |
| 5 | Passed | L: unchanged effective mode causes no invalidation. |
| 6 | Passed | L/U: unrelated edits preserve completion; adjacent saves cannot overlap a mode save/refetch. |
| 7 | Passed | L/W: active tasks/steps and independent writers return BOOK_BUSY without mutation or phantom task-start events. |
| 8 | Passed | U and fresh Studio smoke: retained output opens the confirmation dialog. |
| 9 | Passed | U counts zero mutation calls; fresh Studio Cancel keeps Dynamic and done state. |
| 10 | Passed | U: rejected and ambiguously committed responses restore/refetch the authoritative value and show the error. |
| 11 | Passed | U/L and fresh Studio smoke: config/status/page queries refresh; confirmed By Page retains visible Storyboard with a stale notice. |
| 12 | Passed | P/R: missing active-page output rejects before rendering. |
| 13 | Passed | P: zero sections reject. |
| 14 | Passed | P/R: multiple sections reject in By Page, including fixed layout. |
| 15 | Passed | R/L/S: preflight makes zero render calls; cancellation and real SQLite publication abort retain prior HTML/tree/history. |
| 16 | Passed | R/S: current valid By Page publishes fixed and reflowable output; part-window output excludes unaffected pages. Other prerequisites remain explicit. |
| 17 | Passed | P plus existing stage/page-edit suites: Dynamic continues to accept multiple sections. |
| 18 | Passed | P/L/R: malformed, null, historical and imported input is checked; unknown lifecycle is not treated as current. |
| 19 | Blocked | Positive API/queued/targeted/layout/part publication passes (R/S). Real CLI and DAG preserve existing books by rejection. Successful protected Sectioning regeneration → preflight → Storyboard and downstream resume remain unavailable. |
| 20 | Passed | Extract + strict compile: 3,629 messages, zero missing in all five locales; lint has zero errors. No new Studio strings in this continuation. |
| 21 | Passed | No package manifest or lockfile difference against develop. Dependencies were installed from develop's existing frozen lockfile. |
| 22 | Passed | L: inheritance, override removal, omitted default and invalid values; empty override YAML remains durable. |
| 23 | Passed | L/W/W2: journal-boundary failures/restarts retain coherent status; orphan recovery reservation fails closed. Ordinary anonymous SQLite mutex recovery remains deliberately blocked. |
| 24 | Passed | L/R/U/S: execution-time reload, competing writers, adjacent saves, rollback/version/source/config/lifecycle and positioned-tree conflicts cannot publish obsolete buffered output. |
| 25 | Passed | P/R: exact full count/structured failures, at most 20 displayed identities; translated HTTP/SSE presentation. |
| 26 | Passed | C: real LLM client/cache with counted stub transport calls proves invalid-cache eviction/retry and valid reuse; #692 retained. |

### Commands and verification limits

Commands ran in the isolated checkout with
`DEVELOPER_DIR=/Library/Developer/CommandLineTools` where Git/toolchain access
was required. No global Vitest timeout override was used.

| Check | Result |
|---|---|
| Baseline `pnpm test --maxWorkers 2` on original runtime `e3737abe` | Passed: 282 files / 3,680 tests, including build. |
| Integrated `pnpm test --maxWorkers 2` | Passed: 297 files / 3,858 tests, including pretest build, 231 seconds. |
| New publication/recovery tests | Passed: 2 files / 12 tests after meaningful failing reproductions. |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm build` | Passed; also passed through full-suite pretest. |
| `pnpm lint` | Zero errors, eight unused-suppression warnings. No fresh baseline lint comparison is claimed. |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio compile --strict` | Passed: 3,629 messages per locale, zero missing translations; catalogs unchanged by extraction. |
| `pnpm --filter @adt/desktop build:unpack` | Passed: macOS arm64 unpacked app, ad-hoc signature, notarization skipped. |
| Actual newly built Desktop API bundle under Node 22 in Electron mode | Passed: loopback HTTP mode transition, stale read model, packaging rejection, independent writer 409, project archive and retained versions/media. No Electron GUI/utility-process launch. |
| Current Studio + API browser acceptance | Passed on a disposable synthetic book: confirm/cancel, persisted By Page, refreshed completion state and visible retained stale Storyboard. No provider calls or successful protected regeneration claimed. |
| `pnpm lint:invariants` | Not run: command unavailable; storage/pipeline invariant tests ran in the full suite. |
| Docker runtime/build | Blocked: daemon unavailable, including after an unsandboxed connection check. |
| Hosted CI for local continuation | Not run: no push authorized. Published-head CI below is separate evidence. |
| Representative partner books, paid-provider acceptance, Windows/Linux installers, installed Electron launch, signed/notarized release, OS power loss, upgrade/downgrade | Not run. |

Fresh hosted status: published #884 `e3737abe` has a successful
[CI run](https://github.com/unicef/adt-studio/actions/runs/36195031032);
published #886 `876cc2ae` has a successful
[CI run](https://github.com/unicef/adt-studio/actions/runs/36197207714).
Neither run certifies this local integrated head.

Logs and disposable browser fixture are retained outside the PR diff at
`tmp/spec-0003-evidence/continuation-20261010/` in the primary checkout, including
`baseline-test.log`, `layout-red.log`, `recovery-red.log`,
`publication-green.log`, `full-test.log`, `desktop.log`,
`packaged-api.log` and `ui-retained-storyboard.png`.

### Remaining functional work and decisions

1. **Protected existing-book regeneration is unavailable.** Published SPEC-0001
   and SPEC-0002 still contain no runtime preservation foundation. SPEC-0002's
   refreshed PR body describes local, unpushed schema/helper work only; it is not
   a production prerequisite available to this branch. A retained manual or
   unknown-origin multi-section page cannot be kept as current in By Page or
   automatically collapsed/overwritten. It needs a named, explicitly confirmed,
   version-bound whole-page replacement through the shared preservation path.
   That operation is not shipped here. The rejection remains in place.
2. **The requested full chain is not demonstrated.** Mode change → retained stale
   output passes. Valid persisted preflight → Storyboard publication passes on
   explicitly current fixtures. The intervening protected regeneration and
   existing-book CLI/DAG resume do not exist; seeding current test fixtures is
   not evidence that they do. #886's actual published safe extraction/reuse
   implementation still returns `UNSAFE_RESUME_UNAVAILABLE` before downstream
   mutation. Only its applicable writer correction is integrated here.
3. **General interrupted-write recovery remains fail-closed.** A SIGKILL in an
   ordinary SQLite transaction can leave an anonymous mutex. Owner, reservation
   and SQLite recovery files are preserved. No timeout or guessed ownership
   permits their deletion. Automatic recovery requires provable ownership and
   reader coordination.
4. **Retained history is not automatic paired rollback.** Successful current
   publication now pairs the render tree and HTML atomically. The existing
   version-restore route moves a single node pointer and does not restore a
   historical HTML/tree pair. Cross-layout historical restore and full
   provenance-aware repair remain a functional integration gap; this change
   must not be described as delivering that workflow.
5. **Review amendments remain unresolved.** The September 30 proposal would
   replace strict preflight with page skips/warnings, remove lifecycle gates and
   change cross-process admission. No response to the clarification was received,
   so this continuation retains the user's explicitly selected published spec.
   No acceptance criterion or approval was changed. Revised SPEC-0001's usable
   captions/easy-read/translation/speech warnings do not establish compatibility
   of a Sectioning tree with the selected mode.
6. Human review of the journal/admission design and B1/B2 scope remains pending.
   The spec/INDEX stay in review, approvers empty, ADR 025 proposed. B2 modes and
   cross-page merge are outside the task.

The full diff was reviewed against all 26 criteria, preservation and rollout
requirements. Final dependency refs did not move. The final delivery updates only
PR #884 metadata and requests elasticsounds review; it does not publish local
commits, amend sibling PRs or merge anything.
