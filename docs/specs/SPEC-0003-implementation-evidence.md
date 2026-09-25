# SPEC-0003 B1 implementation evidence

Status: implementation in progress; specification and ADR 025 remain in review.
No approval or release verification is implied. Source issue: #708.

## Baseline and dependencies

Target: PR #884, `spec/708-sectioning-mode-lifecycle`. Published head:
`04250fda6ba187b5712961e21c1dd3504aaedfe6`. Develop:
`737d3314` (includes SDD scaffolding #878). The spec commit was rebased alone;
the original head remains at `backup/spec-0003-before-implementation-20260925`.
The main checkout and its uncommitted drafts were left intact.

#879 and #880 contain specifications, not implemented freshness/preservation.
#886 is a descendant documentation branch, not a CLI implementation prerequisite.
No descendant is merged into this branch. #692 by @KaReeeeeeeeEM is merged;
its runtime mode validator and existing cache eviction/retry are reused unchanged.
#884 has no posted review comments or submitted reviews at inspection.

Current source uses independent YAML writes, destructive pre-run clears, and
separate API and DAG render paths. There is no shared book writer admission.
The implementation adds that admission to the storage boundary and shares it
across supported writers. Until #880 provides protection, existing Sectioning
regeneration must fail closed; a mode change is never replacement permission.
The conservative completion invalidation and unsafe-run rejection are the
documented rollout fallback, not implementation of SPEC-0001 or SPEC-0002.

## Pre-edit acceptance map

Every row starts not run. Final results and commands are recorded below.

| AC | Current behavior / change required | Concrete verification |
|---|---|---|
| 1 | YAML-only save; invalidate derived Sectioning closure | Real DB dynamic → page, all affected step rows absent |
| 2 | No inverse invalidation | Real DB page → dynamic, identical closure |
| 3 | Preserve Extract throughout transition | Snapshot Extract rows, pages and images before/after |
| 4 | No transition preservation contract | All entity versions/pointers and media byte hashes unchanged |
| 5 | Compare effective modes | Same-mode update leaves statuses unchanged |
| 6 | Unrelated save must remain unrelated | Unrelated override update leaves statuses unchanged |
| 7 | No serialized mode save | Held writer and running-step rejection, no mutation |
| 8 | Selector persists immediately | Retained/completed output confirmation component test |
| 9 | No confirmation cancellation | Cancel test counts zero mutation requests |
| 10 | Optimistic selection survives failure | Error test restores authoritative value and displays error |
| 11 | Incomplete query refresh | Success test asserts affected query invalidations |
| 12 | No persisted-data guard | Missing latest value pure validator + runner test |
| 13 | No persisted-data guard | Empty sections pure validator + runner test |
| 14 | Only generation-time validator | Multiple sections pure validator + runner test |
| 15 | Cleanup precedes validation | HTTP/runner failure preserves versions/media; zero rendering calls |
| 16 | No shared guard | Valid single-section fixtures pass pure preflight; other prerequisites explicit |
| 17 | Dynamic accepts multi-section | Dynamic fixture passes unchanged |
| 18 | Historical data unvalidated | Historical malformed/null/non-contiguous persisted fixtures |
| 19 | Separate branches bypass validation | API, queued, targeted, DAG, fixed and reflowable entry tests |
| 20 | New copy needed | Lingui extraction, five locale completeness, lint |
| 21 | No dependency needed | Package/lockfile diff is empty |
| 22 | Raw override writes; invalid mode silently defaults | Global inheritance, override removal, omitted default and invalid input tests |
| 23 | No recoverable YAML/DB publication | Real filesystem/DB fault injection and journal recovery boundaries |
| 24 | Check-then-write races | Independent writer processes, queued mode reload and post-preflight edits |
| 25 | No structured bounded summary | >20 failures, exact total and full structured details, bounded display |
| 26 | #692 merged | Existing cached-invalid eviction and valid reuse tests at transport boundary |

## Verification results

Pending. No criterion is marked accepted by this working evidence map.
