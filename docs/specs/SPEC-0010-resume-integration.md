# SPEC-0010 downstream integration requirements

Status: proposed coordination requirements; human review remains pending.
This document clarifies the handoff required by SPEC-0010, not an implemented
planner API or an approval/amendment of SPEC-0001/0002/0003. It does not change
their acceptance criteria. The dependency assessment is based on the heads
recorded in [the independent review](../verification/spec-0010-review.md).

## Admission reporting delivered now

AC-12/13 require honest reporting when safe execution is unavailable. Verified
extraction followed by refusal now produces an admission-only result: extraction
is verified reusable, downstream execution is blocked, no output was generated
and no content was changed by this attempt. Current/stale/protected scopes are
**not assessed**, not zero. This result does not claim pipeline completion.

HTTP retains status 409, `code: UNSAFE_RESUME_UNAVAILABLE` and the existing
`error` text, adding `summary` validated by `ExtractionResumeBlockedSummary` in
`@adt/types`. The CLI prints the same facts and exits 1. Other admission failures
carry no reuse summary. Studio's existing translated guidance remains accurate;
queued jobs retain their existing error contract.

Verification: the real HTTP route checks the structured response and absence of
transport/content writes; the actual CLI subprocess checks the summary, exit
code, unchanged book bytes and an intercepted fetch boundary. Changed source or
damaged snapshot cases must never report verified reuse. This improves AC-13's
refusal path; successful resume under AC-12/13 remains blocked.

## Required shared handoff

These are semantic requirements for the shared services, not a second scheduler
or a new persistence system. Define eventual public types as Zod schemas in
`@adt/types`, derive stage/step identities from `PIPELINE`, and reuse existing
storage, writer, freshness, preservation and rendering mechanisms.

| Handoff | Required information and behavior | Owner |
|---|---|---|
| Requested work | Requested stage/step scope and effective configuration, with prerequisites derived from `PIPELINE`; distinguish extraction reuse from the remaining generated steps within Extract. | SPEC-0010 calling shared execution |
| Read-only planning | A common plan for API and CLI, identifying each required scope, proven input fingerprint/version, current/stale/unknown freshness, provenance/protection and reason for its disposition. Missing capability is explicit; it is never interpreted as current or eligible. | SPEC-0001/0002 |
| Protection | Manual or unknown-origin work is retained unless an explicit, version-bound replacement decision authorizes the relevant scope. Referenced media, stable identities and all historical versions survive ordinary resume. | SPEC-0002, coordinated with SPEC-0001 |
| Rendering admission | Apply the common Sectioning/rendering preflight for each applicable scope, including protected structures and layout transitions. Unsupported transitions stay blocked. | SPEC-0003 |
| Execution and publication | Run eligible work under the same book writer; revalidate planned inputs and expected versions before publication. Append versions and merge retained scopes atomically using established services. No pre-run clear or bypass of protection is permitted. | Shared execution/storage services |
| Outcome | Report completed, reused, skipped and blocked work with explicit reasons and unresolved protected scopes. Cancellation/failure reports only durably published work. Unknown or unassessed scopes never count as reused; unresolved required work exits nonzero. | Shared result, presented by SPEC-0010/API |

SPEC-0010 must retain the writer between extraction validation and the shared
plan/execution handoff. If a supported path releases it while waiting for a user
decision, reacquire and revalidate both extraction and planned input versions.
A queued request must likewise be reassessed when it actually starts. Do not
persist a claim of completed work merely because admission succeeded.

## Proposed amendments needing reconciliation

1. **Legacy provenance:** replace SPEC-0002's missing-`source` means AI rule for
   ordinary resume with protected unknown provenance, consistent with
   SPEC-0001/0010. Example: an older hand-corrected translation without a tag
   cannot safely be selected for automatic regeneration. An explicit adoption
   or replacement decision needs its own version-bound policy; no silent backfill.
2. **Coverage:** assign freshness and preservation policy to every scope that a
   requested full run can reach, including Storyboard and the output families
   excluded from SPEC-0001's section-level V1 scope. This does not mandate
   section-level granularity everywhere: conservative book/page scopes may be
   acceptable if they prove currentness and preserve manual work. Otherwise
   report the scope as blocked. SPEC-0002's Storyboard exclusion needs an explicit
   owner/design before automatic Storyboard regeneration can be enabled.
3. **Entry-path parity:** require the same planning, protection and publication
   decisions for API, CLI, queued and direct full-run paths. UI-only preservation
   or a CLI implementation of separate rules cannot satisfy this handoff.

These proposals identify the decisions needed; this branch does not silently
resolve them by weakening another spec or treating its proposal as approved.

## Integration acceptance map

The rows below are **not run / blocked by shared implementation**. Existing
admission tests are not substitutes. Execute against the real shared planner and
real filesystem/SQLite storage; use stubs only at external transport boundaries.

| ID / AC | Scenario | Required observable evidence |
|---|---|---|
| R1 / 12,13,14 | All requested scopes proven current | Actual CLI and HTTP reuse succeed; transport count is zero; no new content versions or asset changes; result distinguishes reused extraction and downstream scopes. |
| R2 / 8,12,13,14 | One eligible stale scope among current scopes | Only consuming scopes run; transport counts match required work and valid cache hits; unrelated rows, histories and media remain unchanged. |
| R3 / 8,12,13 | Manual and unknown-origin outputs coexist with stale AI output | Protected work survives byte-for-byte; no provider inputs request its replacement; required unresolved scopes are named and CLI exits nonzero. |
| R4 / 10,12 | Requested stage lacks freshness, preservation or rendering capability | Refuse before content writes/provider calls, including generated Extract steps; no legacy full-run fallback. |
| R5 / 8,11,12 | Concurrent writer or edit between plan and commit | Competing processes cannot both publish; stale expected versions reject without lost edits, ID reminting or media deletion; no dead-owner recovery steals a live lease. |
| R6 / 7,8,12,13 | Partial provider failure, cancellation, process termination and restart | Retain history/media and durably completed scopes; report partial result honestly; next run reassesses persisted state without assuming completion or duplicating completed work. |
| R7 / 10,11,13 | Duplicate queued requests | Second request replans after its predecessor; no unnecessary provider call or duplicate version; API and CLI decisions agree. |
| R8 / 12,14 | Invalid cache entry, valid cache entry and retry | Count actual stubbed transport calls, validate cache output, preserve ordered-input keys; never reuse invalid output or clear unrelated cache entries. |
| R9 / 8,12 | Sectioning/layout/Storyboard dependencies | Shared rendering preflight blocks unsupported transitions; supported publication retains stable references, version history and physical assets; verify resulting read model/export. |
| R10 / 12,13 | Explicit replacement/acceptance decision | Only authorized scopes and versions change; concurrent edit invalidates the decision; retained histories/media remain recoverable. |

Enable successful resume only for fully supported requested work. Keep
`UNSAFE_RESUME_UNAVAILABLE` for uncovered work and keep the specification marked
partial until the full promised scope and this integration evidence are present.
