# SPEC-0010 downstream integration requirements

Status: integrated implementation under verification; human review remains pending.
The authoritative contract is [SPEC-0010](SPEC-0010-safe-cli-reruns.md), reconciled
with the October 12 SPEC-0003 product decisions. The [original requirement map](../verification/spec-0010-oct12-integration.md)
records every AC and R1–R10 before runtime edits. Historical refusal-only and
mode-gate reports are retained in Git history and the dated verification documents;
they do not describe the current execution path or establish fresh acceptance.

## Shared execution and truthful outcomes

API, queued work and CLI/DAG use the same stage executor under the shared book
writer. Direct extraction enforces the same extraction admission boundary.
Extraction reuse never authorizes downstream overwrites. Generated Extract steps,
missing-only Sectioning, Storyboard, quizzes, glossary, TOC, catalog consumers and
packaging each use the shared freshness/protection and publication policies.

Full resume returns completed, reused, skipped or blocked scopes. Required
unresolved work is incomplete and exits nonzero. An ordinary single-stage attempt
may finish with retained usable warnings under SPEC-0001; its resume summary still
reports incomplete freshness. Neither attempt success nor a manifest establishes
book completion. Unsupported capabilities alone use `UNSAFE_RESUME_UNAVAILABLE`;
missing content uses its concrete input/coverage error and preserves unrelated
successful page commits.

Review decisions carry the selected stored-owner revision as well as input and
content hashes. A new version with identical bytes invalidates old consent. Bulk
Keep validates every decision against one snapshot and publishes atomically.
Per-item authored quiz/glossary replacement uses the existing version-bound editor,
not consent to regenerate the collection's eligible AI portion. Keep preserves
authorship and cannot make missing or unusable content complete.

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

## Reconciled contract

Unknown authorship is protected. Every requested output family has a shared
policy; unsupported prompt/resource capabilities fail closed. Entry-path parity
uses the same executor rather than a second CLI scheduler. SPEC-0003's saved tree,
missing-only Sectioning, exact reset and incremental Storyboard publication replace
older lifecycle/cardinality gates. Actual layout switches alone publish the full
active window atomically. These are implementation clarifications authorized by
the owner; they do not imply formal approval of any specification.

## Integration acceptance map

The rows below preserve the original integration scenarios. Fresh results belong
in the dated integration/acceptance evidence. Admission-only tests are not
substitutes: use real filesystem/SQLite storage and stub external transports.

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
| R9 / 8,12 | Sectioning/layout/Storyboard dependencies | Saved-tree and extraction capability checks identify genuine missing inputs; preference alone does not gate rendering; supported publication retains stable references, version history and physical assets; verify resulting read model/export. |
| R10 / 12,13 | Explicit replacement/acceptance decision | Only authorized scopes and versions change; concurrent edit invalidates the decision; retained histories/media remain recoverable. |

Enable successful resume only for fully supported requested work. Keep
`UNSAFE_RESUME_UNAVAILABLE` for uncovered work and keep the specification marked
partial until the full promised scope and this integration evidence are present.
