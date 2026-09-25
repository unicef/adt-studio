# SPEC-0009 implementation and acceptance evidence

Implementation target: the published in-review spec in PR #885, under the owner's explicit instruction to implement before approval. Human approval remains pending. Related issue: #618 (informational; stays open).

## Pre-edit acceptance map (2026-09-25)

Baseline: develop `737d3314`; spec remote `95bddc75`; reuse PR #645 `0a988589` (four original commits, attributed with cherry-pick provenance). No review comments or reviews existed on #885/#645 at refresh. #618's Science Standard 5 comment supports generated heading semantics going to Storyboard.

| AC | Current behavior / required change | Concrete verification |
|---|---|---|
| 1 | No routing on develop; adapt rule/category resolver, heading/landmark/table semantics to Storyboard; unknown fallback | Resolver and rendered finding tests |
| 2 | Adapt criterion/section/historical precedence from #645 | Resolver and reviewer summary tests |
| 3 | Sessions have snapshots; legacy UI falls back to mutable active catalog; retain immutable historical ownership | Real filesystem session save/read/reopen; edited catalog and legacy summary fixtures |
| 4 | Adapt optional Zod metadata and reject invalid destinations through HTTP | Schema and real-storage API invalid-request tests |
| 5 | Reuse application capability registry and canonical pipeline labels | Every allowed destination tested for valid page/book route |
| 6 | #645 parses arbitrary href basenames; validate relative hints against active inventory; stored IDs win | Foreign/malformed/ambiguous fixtures, stored ID precedence |
| 7 | #645 only checks original page; resolve unique active section owner, signal missing/retired targets | Moved/deleted/duplicate identity tests and visible notice |
| 8 | Adapt delayed one-shot focus; retain other search and hash state | Destination component tests with deferred data and refetch |
| 9 | Existing Preview guard; routing lacks explicit return context | Route/component tests for context, refresh/back fallback and unsaved edits |
| 10 | Validation currently auto-packages on mount; make validation refresh explicit | No automatic task on entry/return; navigation-only assertions |
| 11 | Existing manual-review separation | Confirmed and incomplete finding component fixtures |
| 12 | Adapt checklist controls; accessible names and five locales | Component accessibility assertions, extract/compile/lint |
| 13 | Renderer safety dependencies unavailable | BLOCKED Phase B; no direct rerender action |
| 14 | No common expected source/render versions and complete admission contract | BLOCKED Phase B; inspect common route/service |
| 15 | No deduplicated accepted-request contract for targeted rerender | BLOCKED Phase B |
| 16 | Common rerender does not establish #731 force-fresh guarantee | BLOCKED Phase B |
| 17 | Complete failure/cancel/version-safe publication not established | BLOCKED Phase B |
| 18 | Navigation must retain existing verdicts; repair success/revalidation loop requires Phase B | Phase A non-mutation assertions; Phase B BLOCKED |
| 19 | Spec explicitly allows Phase A delivery | Scope statement, UI lacks direct rerender, no completion/approval claim |

## Dependency boundary

Refreshed remote #879 `375081fc`, #880 `5eeaab68`, #884 `04250fda`: documentation only. Local concurrent implementation checkouts are unpublished work, not prerequisites to incorporate. The spec stack order is not implementation order; this Phase A branch is rebased directly onto develop with a recoverable `backup/spec-0009-before-implementation-20260925` ref. No descendant branch is merged. PR #645 is reused, not modified or closed.

Narrative constraints: additive optional metadata, no entity/content mutation on navigation, no provider calls, preserve historical assessments and verdicts, no index-based identities, safe legacy fallback, no new dependencies, use existing client/Query and shared routing. CLI/rendering/packaged artifact behavior is outside this Phase A slice. Rollback removes actions without rewriting historical metadata.

## Verification results

Implementation commits after the attributed #645 commits: `bb9a9601` (snapshot ownership and stable inventory), `d248869e` (navigation, return context, draft guard, one-time focus, tests and translations). `fd7011fa` adds regression-tested handling for section output removed before editor arrival. They are local only. No push or merge was performed. The hosted branch still has its original specification head; retargeting its base to develop must accompany the future publication of the rebased branch so the current remote diff does not inherit unrelated SPEC-0003 work.

### Acceptance matrix

“Passed” below is development acceptance for Phase A, not spec approval or release verification.

| AC | Status | Evidence |
|---|---|---|
| 1 | Passed | `validation-fix-routing.test.ts`: rule-over-category, generated heading semantics and safe fallback; automated finding component fixtures. |
| 2 | Passed | Resolver criterion/section/historical/fallback tests; reviewer summary snapshot and override fixtures. |
| 3 | Passed | Real SQLite/filesystem HTTP tests preserve the original session snapshot across competing saves and reopen, with unchanged first version and referenced media; summary tests edit active catalog and reopen legacy sessions. |
| 4 | Passed | Shared optional Zod destination schema; API tests reject invalid checklist and record/result ownership metadata before writing. |
| 5 | Passed | Parameterized test over every allowed destination against the canonical capability registry; book-level Captions and exact Storyboard routes exercised. |
| 6 | Passed | Stored identity beats href; malformed, absolute, encoded/traversal, ambiguous and synthesized-ID fixtures never acquire exact focus. |
| 7 | Passed | Unique moved owner resolves; retired, pruned and duplicate identities fall back; destination tests verify visible notice and no successor focus. |
| 8 | Passed | Sectioning and Storyboard delayed-load/refetch tests; focus query consumed once while other search/hash remain; actual copied-book refresh. |
| 9 | Passed | Actual TanStack memory router and shared unsaved guard: Stay, failed Save & leave, successful save; return/back context and offline resolution; copied-book return flow. |
| 10 | Passed | Entry no longer packages automatically; explicit Refresh Validation still does. Navigation transport assertions and 321 copied-book file hashes unchanged after open/refresh/return. |
| 11 | Passed | Component fixture contains both confirmed and incomplete findings; copied book retains 0 confirmed and 15 manual-review items. |
| 12 | Passed | Keyboard-activated browser link; accessible labels include destination and known page/section; checklist controls, Lingui extraction/compile, all five locales complete. |
| 13 | Blocked | No direct rerender action: active-section support/protection/cost admission not established in common renderer. |
| 14 | Blocked | Common service does not provide the complete stable-identity/expected-version/mode/conflict admission contract. |
| 15 | Blocked | No common accepted-request idempotency/task lifecycle contract established for this entry point. |
| 16 | Blocked | Common force-fresh scoped rerender prerequisite is unavailable. |
| 17 | Blocked | Failure/cancel/version-safe publication and media preservation require common renderer work. |
| 18 | Passed for Phase A; blocked for Phase B | Navigation never writes verdicts; successful rerender/revalidation loop is not implemented or tested. |
| 19 | Passed | No Phase B button, no automatic pass, explicit Phase A-only scope in spec/evidence/PR; #618 remains open. |

### Executed checks

- `pnpm typecheck`: passed.
- `pnpm lint`: passed, 0 errors and 8 unused-suppression warnings; not represented as a clean warning baseline.
- `pnpm build`: passed (root pretest build includes runtime bundles).
- `pnpm --filter @adt/studio extract` and `compile`: passed; 3,619 messages in each of en/es/fr/pt-BR/sq, no missing translations.
- `pnpm --filter @adt/studio build`: passed; bundle-size warning remains.
- Final focused acceptance run: **14 files / 169 tests passed**, including storage, resolver/schema, both destination editors, unsaved guard and return navigation.
- Full suite: **283 files / 3,664 tests passed** with `PATH=/private/tmp/spec0009-tools:$PATH pnpm exec vitest run --no-file-parallelism` (881.83s). The task-local Git launcher resolves the host Xcode-license issue; no test timeout or repository configuration was changed. Full-suite discovery preceded the new empty-Sectioning regression file; the final 169-test acceptance run includes that file and reruns all affected paths after the last fix.
- `git diff --check`: passed. No `lint:invariants` command exists in this checkout; available invariant enforcement is included in types/tests/lint as documented in INVARIANTS.md.

Initial full run exposed a missing router mock in the existing Sectioning tests; fixed and all four reran successfully. A subsequent full parallel run had 3,626 passing and 25 failing tests: 22 Git-script failures from the temporary Git launcher configuration and three timeouts (books export, stage-runner speech cache, fixed-layout reference width). These were resolved in the final serial full run with the corrected Git launcher. Other initial failures included Git-dependent script tests blocked by the host Xcode Git license and tests timing out under concurrent load. A task-local launcher now uses the bundled working Git without changing host configuration. Untouched develop `737d3314` was independently installed/built: 256/257 tests across the affected API/package/script subset passed; one export-webpub ASCII-title test timed out at its 15s limit. That establishes baseline timeout sensitivity, not proof that every distinct timeout is pre-existing. No timeout threshold was changed in repository code.

### Representative-book acceptance

Used an isolated copy of `momograde1`, never the original book. Through the running API and Studio, selected the Visual & sensory cues filter, opened page 1's `pg005_sec001` finding by keyboard in Storyboard, refreshed the editor and returned to Validation. Stable section focus was consumed; the return banner survived refresh; the original filter and assessment (`2026-07-28T13:56:57.215Z`) remained visible with 0 confirmed violations and 15 manual-review items. All 321 copied-book files remained byte-identical; none were added. No POST/PUT/DELETE occurred during navigation. This verifies navigation and persistence preservation, not rendering fidelity or a new accessibility audit.

### Outstanding decisions and verification limits

- Product review must still ratify ownership defaults; the implementation follows the published Storyboard heading/landmark choice. The user authorized implementation before approval, not fabricated approval.
- Phase B needs concrete implemented and tested common renderer dependencies. Local unpublished work in other branches is not used to bypass that gate.
- No provider generation, edit/rerender/revalidation loop, packaged Desktop installer, Docker image, release verification or hosted CI at these local commits was run. The shared Desktop-close registration is reused but native close interaction was not exercised.
- Browser acceptance used an existing assessment on one copied book, not the complete representative acceptance set. Transport mocks cover the unsaved failure flow; real storage integration covers snapshot/version/media preservation.
- **Only Phase A is delivered. Full SPEC-0009 and #618 are not complete.** Rollback removes entry actions and leaves historical metadata readable; no data migration or new dependency is required.


## Confidence follow-up (2026-09-25)

A further review reproduced two Phase A defects with six failing regression cases before the fixes:

- A slow inventory response could redirect a user after they had already left Validation; a late failure could also display an irrelevant error. Navigation now checks the originating router location and invalidates requests when the originating view unmounts or changes book. In-flight admission uses a synchronous request token.
- Unknown identifiers matching inherited JavaScript property names (`constructor`, `__proto__`, `toString`, `hasOwnProperty`) could resolve to an object/function instead of a supported destination. Ownership maps now read only their own properties, preserving the documented category/Storyboard fallback.

Additional acceptance checks cover restoring return context from a freshly loaded serialized destination URL, a replaced assessment, a deleted source reviewer session, and late failures after unmount. They retain existing review verdicts.

After these frontend-only fixes: `pnpm exec vitest run --project studio --maxWorkers=2` passed **83 files / 527 tests**; `pnpm typecheck`, `pnpm lint` (0 errors, the same 8 warnings), `pnpm --filter @adt/studio build`, and `git diff --check` passed. No user-visible strings changed. The earlier 3,664-test full-repository result remains evidence for the earlier implementation revision; it was not rerun for this follow-up. Backend persistence and renderer code did not change. No new browser, packaged Desktop, Docker, provider or Phase B acceptance is claimed. All changes remain local and unpushed.
