# SPEC-0003 B1 — independent review and refreshed verification

> Historical evidence. The October 12 product amendment supersedes the persisted-mode gates and whole-run publication described here. See the [current contract and complete acceptance audit](spec-0003-oct12-audit.md) and [new independent review](spec-0003-independent-review-2026-10-12.md). These earlier passing results do not certify the revised behavior.

Date: 2026-10-11. Human approval remains pending. This is a fresh behavioral
review of the existing implementation, with regression fixes, not a maintainer
approval or release certification. B2 modes and cross-page merge remain deferred.

## Reviewed tree and dependencies

Starting local head: `d747b1506561dfd4156dadfd5a0afcebc01a7804`. Review fixes:
`1f6389c6`, `cb058983` and `c4f5beb5` (final runtime/test tree). Later delivery documentation
does not change executable behavior. The full specification, #708, existing
PR discussion and review, architecture, guidelines, invariants, ADR 025, and the
supplied roadmap/SDD references were reconciled before changing code. The
26-criterion map and historical evidence were checked against current source.

The existing PR #884 is stacked on actual published SPEC-0002 #880
`373619dd2e7ef7cecf2653cecfda07029401f5e6`, containing SPEC-0001 #879
`a10d3fa0da2766f91d217e8b7ad8f9ce4a8457d5`. Refreshed develop was
`ef31494dc2951b92222c473960fecee2d91f9544`. Published SPEC-0010 #886
`876cc2aefccf86e7b3c01cae3a8c62a40ff5fe08` supplied the extraction admission
adaptation already attributed in the [stack implementation report](spec-0003-stack-implementation.md).
The existing #692 generation validator/cache behavior, by @KaReeeeeeeeEM, was
retained. These other PRs were not changed. No approval or merge is implied.

The remote branch remains `spec/708-sectioning-mode-lifecycle`. The pre-review
local head is recoverable at `backup/spec-0003-before-independent-review-20261011`;
the prior stack/publication backups remain. The published old head `e3737abe`
must be checked with an exact lease when publishing the already-rebased stack.
The PR description and title are intentionally unchanged; delivery is recorded
in a PR comment. See that comment for the published SHA and hosted CI result.

## Findings reproduced and fixed

| Severity | Observable failure | Fix and regression evidence |
|---|---|---|
| High | Targeted fixed-layout rerender called the semantic renderer, replacing positioned HTML and deactivating its tree. | Reuse the actual fixed renderer and atomic publication. Measure the full active window for consistent spread scale, but publish only requested pages. `storyboard-publication.test.ts` reproduced the unexpected semantic call. New `sectioning-targeted-fixed.test.ts` uses real PDF extraction, SQLite/filesystem and HTTP routes, verifies exact history/untouched pages/part windows, and counts zero provider calls. |
| Medium | Fixed Storyboard and batch rerender demanded an unused LLM credential; an unrelated visual-refinement strategy could initialize LLM machinery before the deterministic branch. | Credential admission excludes only fixed Storyboard; Sectioning still requires credentials. Execute fixed rendering before model/visual-refinement setup. Real HTTP regression first returned 400, now succeeds with no provider call. Unsupported section-only/prompt requests fail with retained output. |
| Medium | A failed job retained for display caused immediate admission checks to be skipped. A stale explicit replacement returned 200 before asynchronous rejection. | Only running/cancelling jobs defer to queued execution. `sectioning-existing-book.test.ts` first observed 200, then verifies immediate 409 with the new protected version and no generation or content changes. Execution-time revalidation remains. |
| Medium | Confirmation could survive navigation to a different book and later apply the old book's callback. | Bind the pending action to book identity and discard it on navigation. The hook regression first found the stale dialog, then verifies no mutation and no resurrected confirmation when returning. |
| High | Landing-page mode save could replace unrelated overrides before they loaded, or restore an old value captured while confirmation was open. | Wait for book overrides, preserve the latest cached map at confirmation, and keep the shared config-save barrier. The actual landing component/query-hook tests first observed enabled controls with missing config and a reverted activity setting; both now pass. |
| Medium | Browser mode save cleared completion, but Preview still displayed done based on retained package files. | Package status now reports known mode incompatibility using the same shared preview/export admission rule; sidebar/book overview completion respects it, and config saves refetch it. Real-storage API tests cover not-ready, pending Storyboard and mode mismatch, plus continued availability of compatible warning-bearing output; sidebar regression covers the badge. |

No reproduced finding is left unfixed. These findings are distinct from the
intentional safe refusals and release limits below. No tests were weakened to
match easier behavior, and no numbered acceptance criterion was changed.

## AC-to-evidence matrix

`Passed` is implementation/test evidence, not human acceptance. Local evidence
was rerun on the reviewed runtime tree. Keys:

- **L**: `apps/api/src/services/sectioning-lifecycle.test.ts`.
- **P**: `packages/pipeline/src/__tests__/sectioning-preflight.test.ts`.
- **R**: `apps/api/src/services/sectioning-preflight-runners.test.ts`.
- **U**: `apps/studio/src/hooks/use-sectioning-mode-confirmation.test.tsx` and
  `apps/studio/src/components/pipeline/stages/sectioning/SectioningLandingPage.test.tsx`.
- **W**: `packages/storage/src/__tests__/book-writer.test.ts`,
  `sectioning-book-writer.test.ts`, `book-writer-recovery.test.ts`.
- **S**: `apps/api/src/services/storyboard-publication.test.ts`.
- **E**: `apps/api/src/services/sectioning-existing-book.test.ts`.
- **F**: `apps/api/src/services/sectioning-targeted-fixed.test.ts`.
- **D**: `packages/pipeline/src/__tests__/sectioning-resume.test.ts`.
- **X**: `packages/pipeline/src/__tests__/extraction-admission.test.ts`.
- **C**: `packages/pipeline/src/__tests__/page-sectioning.test.ts`.

| AC | Status | Refreshed evidence |
|---|---|---|
| 1 | Passed | L/E: Dynamic → By Page invalidates the DAG-derived downstream completion closure. |
| 2 | Passed | L: reverse transition invalidates the same closure. |
| 3 | Passed | L/E: Extract completion, source pages and asset bytes remain. |
| 4 | Passed | L/E/S/F: previous versions, stable IDs, HTML, positioned trees and referenced assets remain; replacement appends history. |
| 5 | Passed | L: unchanged effective mode does not invalidate. |
| 6 | Passed | L/U: unrelated/adjacent saves, unloaded overrides and confirmation-time refresh preserve independent fields. |
| 7 | Passed | L/W: active steps/tasks and competing processes reject with BOOK_BUSY before writes; admission spans deferred work. |
| 8 | Passed | U: retained output triggers confirmation even after completion is cleared. |
| 9 | Passed | U: cancel/navigation sends no mutation; returning does not revive the old confirmation. |
| 10 | Passed | U: failed/ambiguous save refetches authoritative selection and surfaces error. |
| 11 | Passed | U plus package route/sidebar tests and browser acceptance: config/debug/status/page/package state refresh; retained incompatible output does not claim Preview/Validation completion. |
| 12 | Passed | P/R: missing current Sectioning rejects before rendering. |
| 13 | Passed | P/R: empty Sectioning rejects. |
| 14 | Passed | P/R/E/F: multiple sections reject, including an unselected page; incompatible protected pages require explicit replacement. |
| 15 | Passed | R/S/E/F/D: rejected attempts leave histories/assets unchanged and call no renderer/provider; real transport counts at the boundary. |
| 16 | Passed | E/F/D: valid persisted one-section pages publish through fixed and reflowable paths. |
| 17 | Passed | P/R: Dynamic accepts multiple sections. |
| 18 | Passed | P/R/X: historical, malformed/null data and unknown provenance fail safely without an observed save. |
| 19 | Passed within documented safe scope | E/F/D: immediate HTTP, queued stage, background targeted tasks, whole/batch target, fixed/reflowable, active part window, real DAG and CLI child process. Unverified/unscoped existing-book CLI resume remains a documented safe refusal. |
| 20 | Passed | Five complete Lingui catalogs; extraction, strict compile and Studio lint. Visual review of every locale is not claimed. |
| 21 | Passed | No manifest or lockfile additions relative to SPEC-0002. |
| 22 | Passed | L: effective inheritance, override removal, default Dynamic and invalid mode with no writes. |
| 23 | Passed for fail-safe contract | L/W: real file/DB fault injection, journal-boundary exits, ordinary transaction SIGKILL, restart and orphan evidence. Unprovable anonymous SQLite mutex recovery remains blocked, retaining evidence. |
| 24 | Passed | L/W/S/E/F/D: writer races, stale protected versions, execution-time input revalidation, cancellation, partial batch and transaction failure retain prior output. |
| 25 | Passed | P/R/U: full error count, at most 20 page identities, malformed/null input and bounded translated summary. |
| 26 | Passed | C: invalid cached multi-section response evicted/retried; valid cache reused; actual stub transport calls counted. |

## Verification commands and results

The baseline full suite was run before review edits: **325 files / 4,054 tests
passed**, 267.29 seconds. Logs for reproducible before-fix failures and corrected
runs are retained locally under `/private/tmp/spec3-independent-*`. Node
22.23.2 / pnpm 10.32.1 matches the CI Node major; git commands use
`DEVELOPER_DIR=/Library/Developer/CommandLineTools` on this machine.

| Check | Final reviewed runtime result |
|---|---|
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test --maxWorkers 2` | **327 files / 4,071 tests passed**, 288.90 seconds; 17 additional regressions over the baseline. |
| `pnpm build` | Passed as the full-suite pretest (TypeScript and runtime assets). |
| `pnpm typecheck` | Passed. |
| `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed, zero errors and eight unused-suppression warnings. No claim that warnings were independently baselined. |
| `pnpm --filter @adt/studio extract` | Passed, 3,682 messages per locale, zero missing translations, no catalog diff. |
| `pnpm --filter @adt/studio compile --strict` | Passed. |
| `pnpm --filter @adt/desktop build:unpack` | Passed, macOS arm64, ad-hoc signature; notarization skipped. |
| Packaged Desktop API in Electron `utilityProcess` | Passed: actual rebuilt bundle starts, health 200, persisted stale mode state and preview 409. |
| `docker build --target app -t adt-studio:spec3-independent-final .` | Passed. Image `sha256:ba9aade60f23f8122b70452a78692e3c4974d573a353f777a427c8db14173578`; real nginx/API/renderer acceptance in both layouts passed. |
| Browser | Final image: confirmation, persisted mode, retained-output warning, Extract preserved and downstream completion cleared, including Preview. Component tests cover cancellation, failure, navigation and adjacent config saves. |
| `git diff --check`; dependency diff against SPEC-0002 | Passed; no package/lockfile additions. |
| Hosted CI | Recorded in the delivery comment with the exact published SHA/run. This file records pre-publication local evidence; earlier `e3737abe` CI does not certify this stack. |

Final command logs use `/private/tmp/spec3-independent-final2-*`. The previous
full run also passed 327 files / 4,067 tests before browser acceptance exposed
the retained-package badge issue. The final run includes its four regressions.
Focused read-model tests passed 21 cases; the initial sidebar assertion needed
to use the existing mocked link's accessible label rather than its absent link
role. API regressions and the browser independently reproduced the actual issue.

There is no configured standalone invariant-check command. Writer, history,
identity, cache and publication invariant suites run in the repository tests.
No missing check is reported as successful.

## Runtime acceptance and remaining limits

Fresh disposable Raven PDF books were run through the final Docker `app`
image. Both fixed-layout and reflowable flows proved:

1. Mode change retains all Sectioning/rendering/positioned-tree histories,
   original PDF, source pages and image hashes, but marks completion stale.
2. Incompatible preview returns 409; export fails safely; package status reports
   mode incompatibility. Ordinary protected regeneration rejects with zero
   provider calls and unchanged histories.
3. Exact-version explicit replacement succeeds, persisted one-section preflight
   passes, Storyboard publishes, and `storyboardPending` becomes false.
4. Targeted rerender succeeds with the selected renderer. The fixed tree remains
   active for fixed output; reflowable output deactivates it transactionally.
   Semantic histories remain unchanged and no additional provider call occurs.
5. Preview returns 200 and Web Publication export completes. Each entire flow
   makes **one actual stubbed OpenAI transport call**. The fixed archive has
   72 entries / 7,013,031 bytes; reflowable has 58 / 6,758,207. Both manifests'
   reading-order targets exist in the archive.

Real API/CLI suites additionally exercise actual part windows, queued execution,
reflowable extraction, cancellation, stale versions and crash/restart safety.
The runtime harness initially waited for `active.status`, but the public JSON
endpoint returns top-level `status`; correcting the harness completed both
flows. The first Electron harness used the filtered package working directory;
rerunning it from the intended repository root completed the smoke test. These
were harness corrections, not production failures dismissed as pre-existing.

Browser acceptance on the final image then deliberately changed the accepted
fixed book back to Dynamic. Extract stayed complete, prior output remained,
Sectioning/Storyboard/Preview became incomplete, and the retained-output warning
appeared. The [screenshot](assets/spec-0003-mode-status.jpg) records that final
UI state. The fixture was left stale intentionally after this check; the export
acceptance above records the successful preceding publication. Temporary
containers and the browser tab are stopped/closed after verification; fixtures,
archives and transport evidence remain in the isolated checkout's
`tmp/spec3-independent-final/` and `tmp/spec3-independent-runtime/`.

The B1 workflow is implemented using the shared SPEC-0001/0002 preservation and
SPEC-0010 admission mechanisms. It is **the B1 increment with the specified safe
fallbacks**, not all future SPEC-0003/B2 scope. Manual/unknown incompatible pages
are protected until exact-version explicit replacement. Changing mode retains
stale output; Sectioning alone cannot clear Storyboard's publication barrier.
Mode-incompatible preview/export refuses, while compatible downstream freshness
warnings remain usable under revised SPEC-0001.

Functional boundaries remain separate from release verification:

- Full generic CLI resume, unsafe re-extraction and legacy CLI books without a
  verified extraction identity remain safely rejected. Broader SPEC-0010 work
  is not claimed here; verified bounded Sectioning–Storyboard resume succeeds.
- An anonymous SQLite mutex left by an ordinary transaction crash cannot be
  deleted safely merely because the transition writer died. Without provable
  ownership and reader coordination, the operation fails BOOK_BUSY and retains
  the lock, journal and database. There is no timeout deletion or guessed repair.
- The September 30 review proposes warnings/skipping and informational lifecycle
  semantics that differ materially from the published strict contract. This
  implementation follows the user's explicit published-spec instruction.
  Ratifying those amendments, B1/B2 spec identity and ADR 025 remains a human
  review decision; approval metadata stays unchanged.
- Not run: live paid provider, partner-book corpus, real power-loss durability,
  network filesystem, Windows/Linux Desktop GUI, signed installers, notarization,
  release workflow and visual QA in all five locales. Local packaged runtime
  checks and hosted CI do not certify those release conditions.
