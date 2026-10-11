# SPEC-0012 continuation: force-fresh prerequisite — 26 September 2026

> Historical snapshot. The [12 October full continuation](../verification/spec-0012-full-continuation.md)
> supersedes its completion estimates and missing-dependency statements.

The previous 35% estimate described the delivered read-only synchronization
slice. It was not a hard implementation ceiling. Rechecking the remaining work
identified an independently implementable prerequisite: issue #731's cache-read
bypass with fresh write-through. It is now implemented in the shared LLM client
and the existing explicit rerender service. No targeted synchronization repair
action has been enabled, and automatic synchronized Save remains unimplemented.

Estimated overall functional completion is now **about 40%**. Using the review's
same weighting gives 39/100: classifier/identity 18/20, persistent read behavior
10/15, synchronized save/publication 0/35, targeted repair prerequisites 4/20,
and Studio integration 7/10. This estimate is approximate; no complete acceptance
criterion is claimed passed solely because this prerequisite is implemented.

## Implemented behavior

- `GenerateObjectOptions.forceFresh` bypasses both current and eligible legacy
  cache reads on every attempt, without changing the ordinary cache key.
- The same option on `createLLMModel` supplies a default to every call on that
  instance. Explicit rerender's existing resolver enables it for rendering,
  activity-answer and visual-review model instances without adding a separate
  cache or duplicating pipeline code. Ordinary pipeline generation is unchanged.
- Accepted fresh output writes through. A successful validation retry updates
  both its retry key and the original request key, so the next ordinary call
  with identical inputs receives the accepted fresh output.
- Provider failure, external cancellation and rejected fresh output preserve
  the previous cache entries. Validation-cleaned results are published after
  validation. Cancellation is checked before fresh transport and publication.
- Real rerender testing exposed existing unconditional downstream deletion in
  `finally`: even a failed provider call deleted translations and completion.
  Cleanup now runs only after a rendering version was committed, and the storage
  connection closes even when cleanup fails. This fixes the failure path;
  successful rerender still has the old broad invalidation behavior, which must
  be replaced through shared scoped invalidation before AC-15 can pass.

These are shared client/service changes, not a replacement for expected-version
checks, stable-ID repair admission, protection decisions or atomic content and
metadata publication. Force-fresh requests incur provider calls as explicitly
requested by the existing rerender action; they do not automatically run on Save.

## Verification

Nine shared-client tests use real filesystem cache files, the actual OpenAI
adapter/SDK and a stubbed HTTP `fetch` boundary. Assertions count HTTP requests,
not calls to a mocked rendering or cache helper. They cover repeated fresh
requests, ordinary reuse, unrelated keys, legacy entries, model defaults,
per-call overrides, validation retries/cleaned output, provider failure and
cancellation. The first eight failed before the client implementation.

Three service integration cases run real storage, prompt rendering, pipeline
rendering and the shared LLM client with only HTTP stubbed. Repeated empty and
identical nonempty instructions each make two transport calls, persist new
renderings, preserve the neighboring HTML and source version, and retain the
fresh cache output. A failed request preserves source, rendering, the manual
translation fixture and completion rows. That last case reproduced deletion
before the service cleanup correction. An earlier fixture attempt had an invalid
page-image identity; it was corrected before the behavioral reproduction.

| Check | Result |
|---|---|
| Focused client/cache and existing/new page-edit service tests | 62 tests / 5 files passed. |
| Full repository tests and pretest build | `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test --maxWorkers=4 --testTimeout=60000`: 3,714 tests / 283 files passed in 220.08 seconds. |
| Typecheck, lint, API/Electron API bundles | Passed. Lint: 0 errors, the same 8 unchanged-file warnings. |
| Studio changes | None; no user-visible strings or catalog changes. Prior review's UI/localization evidence remains applicable. |

Logs are in adjacent `tmp/spec-0012-evidence/fresh-*.log`. No real provider charges,
packaged Desktop launch, Docker build, or release verification are claimed.
Visual-review/browser and real activity-answer acceptance were not rerun for this
continuation; freshness for those subcalls follows the shared model default and
the existing resolver wiring. Their full protected repair lifecycle remains open.
Implementation commit: `e4ae9710`; no push or merge. Only explanatory comments
changed during the full run; runtime behavior and tests remained unchanged.

## Remaining blockers and next implementation sequence

1. SPEC-0001 / #879 still contains documentation only at `375081fc`. Implement
   its shared scoped, non-destructive downstream invalidation/freshness behavior.
2. SPEC-0002 / #880 still contains documentation only at `5eeaab68`. Establish
   compatible provenance and review/replacement semantics. Unknown Storyboard
   origin must remain protected; reconcile its missing-origin-as-AI rule and
   Storyboard full-rerun exclusion explicitly.
3. SPEC-0003 / #884's local worktree is now clean at `e3737abe`, with committed
   writer/mode review corrections and verification evidence. Its evidence still
   calls itself the B1 safe slice and protects existing unknown/manual work by
   refusing unsafe regeneration. Integrate a pinned compatible revision when
   save/repair publication can consume the other shared contracts. This is not
   an approval/merge wait and not an absence of local implementation.
4. Finish SPEC-0012's own atomic-save integration: expected source/render versions,
   server-owned classification/provenance, no-op deduplication, rollback/conflict
   behavior with retained drafts, authoritative responses and Studio refresh.
5. Add targeted repair using shared admission/protection/mode checks and the now
   implemented force-fresh policy. Verify cancellation, stale IDs, concurrent
   writers, unaffected scopes and representative packaged output.

Issue #731's cache policy is no longer an absent-code blocker in this branch.
It remains unpushed and is referenced informationally, not closed. No sibling
implementation worktree was modified or imported. Completing #580 still requires
shared scoped invalidation, and product acceptance of the fixed-layout B1
limitation remains pending.

## Acceptance delta

The [18-row review matrix](SPEC-0012-independent-review.md#original-acceptance-criteria--evidence)
still applies, with these updates:

| AC | Status | New evidence / remaining gap |
|---|---|---|
| 12 | Blocked | Fresh client cancellation preserves cache; failed existing rerender preserves fixture content/completion. Full queued/cancelled/verified repair lifecycle is still missing. |
| 13 | Blocked — cache prerequisite passed | Shared force-fresh transport/write-through behavior and existing rerender wiring verified. Stable-ID, protection and mode integration still required for targeted repair. |
| 15 | Blocked | Failed rerender no longer deletes downstream data. Successful saves/rerenders still need shared scoped non-destructive invalidation. |
| 18 | Passed — reporting | Partial scope and the updated estimate are explicit; no approval, release or issue closure claim. |

The large remaining portion is synchronized publication and protected repair,
not additional classifier unit tests. Confidence remains high (about 8/10) for
the bounded implemented behavior; the full specification is not ready to claim.
