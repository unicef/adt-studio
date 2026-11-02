# Independent SPEC-0003 requirement map

Reviewer is a separate read-only agent. Sources independently read: original AC-1–26; amended SPEC-0003 and ADR025 at c50bea33; full reviews 5486273946 and 5368403884; current SPEC-0002 contracts/evidence and inherited ownership rules. Runtime baseline c50bea33627b1e7b162f5adc746e12648da07aa2; prerequisite 09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89. Parent is sole writer. Historical green evidence is not acceptance.

## My product requirement groups

| Group | Public path / observable requirement | Adversarial verification planned |
|---|---|---|
| G1 Generation validity | API Sectioning / cached provider / fresh CLI generates exactly one section in By Page; saved editing remains unconstrained | Invalid live + cached multi-section outputs retry; unchanged valid transport cache hit; malformed input fails rather than truncating |
| G2 Preferences | Studio selector → config API → YAML/lifecycle → library/stages/output | Effective removal/inheritance, external change, no-op, unrelated save, adjacent config save; no content/history/assets/attempt changes; unknown metadata never forces work |
| G3 Selection | UI rerun confirmation → immediate/queued/combined Sectioning | Default run fills missing only including AI retained; empty/manual/unknown/corrupt not guessed missing; frozen exact IDs and semantic/render/tree versions; duplicates/outside window/stale reject before reset/provider |
| G4 Reset | Consent → writer → one SQLite transaction → retained histories | Deactivate affected active HTML/tree only; failure rollback; crash after reset leaves intentional missing state; prior authored semantic version survives provider failure; no ID retirement before success; neighbors/PDF/images/audio unchanged |
| G5 Saved structure | Sectioning split/add/clone/merge/delete → Storyboard and targeted tasks | Dynamic→Page + reset + split and reverse; old HTML never positional input; manual two-section page not a whole-book gate; fixed historical reset uses semantic tree |
| G6 Incremental publication | Stage runner / per-page API / Studio | First completed page visibly available while slow page pending for fresh and rerun; paired HTML/tree transaction; Skip/failure/cancel keep already-published pages; failed same-layout page retains old output |
| G7 Layout switch | Actual active output layout → fixed/reflowable publication | Actual switch atomic across active window, targets cannot mix layouts; incomplete, missing or stale required page retains all old pairs; first-ever generation incremental; part windows preserve outside |
| G8 Coverage and usability | Targeted section render → reading order/coverage → library/sidebar/stages/preview/export | Missing included section forbids complete claim; reset historical HTML cannot count; usable partial remains accessible; ownerless contradictory output omitted with warning, missing authorship alone not omitted |
| G9 Coordination/recovery | HTTP writer gate / worker snapshot / external process / restart | Stale config/source/version at publication; queued execution reread; same-run TOC exact consent; supported cross-process gate retained; ambiguous SQLite lock never deleted by time |
| G10 Errors/locales | HTTP and SSE codes → Studio translator → five catalogs | Remaining code/params localized; no obsolete mode restrictions; formatted count/page lists bounded without hidden failures |
| G11 Scope/compatibility | CLI refusal, dependency graphs, old readers | No expanded existing-book resume here, B2/auto merge absent; no dependency addition; save/read/current-null and legacy-owner qualification unchanged; inherited manual outputs preserve IDs/options/translations/audio/cache |

## Original criteria disposition (my map)

| Original | Revised disposition | Groups |
|---|---|---|
| AC1 | Superseded: Dynamic→Page informational only, not downstream invalidation | G2 |
| AC2 | Superseded: Page→Dynamic informational only | G2 |
| AC3 | Preserve Extract completion/data | G2,G4 |
| AC4 | Preserve every version/media byte on preference change; reset deactivates versionedly | G2,G4 |
| AC5 | No-op effective preference no invalidation | G2 |
| AC6 | Unrelated/cosmetic save no mode invalidation, inherited freshness remains scoped | G2,G11 |
| AC7 | Refined: shared write/version safety, not new redundant lock | G9 |
| AC8 | Refined: preference dialog describes preference; destructive active reset belongs to explicit regeneration consent | G2,G3,G4 |
| AC9 | Cancel preference/reset sends no mutation | G2,G3 |
| AC10 | Failure reconciles persisted state; confirmation race cannot discard adjacent save | G2,G9 |
| AC11 | Views refreshed consistently without false completion/usability coupling | G2,G8 |
| AC12 | Superseded: missing page reported/skipped individually | G6 |
| AC13 | Superseded: zero saved sections not a cardinality blocker | G5,G8 |
| AC14 | Superseded: multiple saved sections render normally | G5 |
| AC15 | Refined: invalid page retains its old output; unrelated pages run; true input/conflict rejection preserves data | G6,G9 |
| AC16 | Superseded: any valid saved tree renders; exactly-one generation remains | G1,G5 |
| AC17 | Preserve Dynamic multi-section editing/rendering | G5 |
| AC18 | Superseded: historical mode metadata never initialization gate; integrity/ownership checks remain | G2,G8 |
| AC19 | Refined: API/queued/targeted/combined fixed/reflowable parity; expanded existing CLI deferred | G3,G6,G7,G11 |
| AC20 | Five-locale UI plus HTTP/SSE localization | G10 |
| AC21 | No dependencies | G11 |
| AC22 | Effective override/default/invalid input correctness | G2 |
| AC23 | Refined: cross-file config journal recovery, separately atomic DB reset, no invented done state | G2,G4,G9 |
| AC24 | Revalidation prevents stale publication in page or book transaction | G6,G7,G9 |
| AC25 | Refined: bounded informational missing/corrupt reports; no hard cardinality error | G6,G10 |
| AC26 | Keep #692 cache validation/retry and valid reuse | G1 |

## Nine consolidated scenarios

1 G1; 2 G5; 3 G6; 4 G6+G7; 5 G3+G4+G5; 6 G2+G6; 7 G8; 8 G3; 9 G4+G9+G10. Each requires observable public-path evidence, not helper counts or old-contract tests.

## Current status

Baseline runtime is intentionally known old behavior; do not mark amended acceptance passed until frozen implementation recheck. Independent expected-behavior probes/logs follow in this directory. No broad suite run concurrently with author; no tracked file edits or Git mutations.

Harness note: immutable archived c50 source has the parent-identified duplicate isProtectedContent import in pipeline-dag.ts. Removed exactly the first duplicate import in the /private/tmp archive only so probes can execute; no runtime semantic change. This is c50 plus syntax-only harness correction, not byte-identical c50 build evidence.

## Final independent disposition

The original map above was constructed before implementation corrections. Every group and original-AC disposition was rechecked against the amended specification and runtime `c23f185928be91f7c7ca033c4e3fa61e9f137f0b`. See [independent report](spec-0003-independent-review-2026-10-12.md) for the 18 revised-contract evidence rows, all resolved findings and 214 passing focused executions. Original superseded gate criteria remain superseded, not retroactively marked satisfied. Full repository/CI/platform evidence and human approval remain distinct.


### F8 final UI boundary recheck

The c23 API/runtime results did not cover the component's old attempt-based readiness decisions. The author found that edge in browser acceptance; the independent reviewer reproduced it in actual c23 components. At `5a9f9b48a21ca9a5e6dd8d0ec3752e914393d28f`, 43 affected UI tests pass, including 11 independent controls. G2/G6/G8 and original AC11/18/19 mappings now explicitly include absent attempt rows, cancellation with complete retained coverage, loading-safe stage selection, complete/partial older trees and preserved empty trees. Attempt state remains distinct from saved-output coverage and source freshness. Backend/storage code is unchanged from c23; see final report for evidence provenance and limits.
