# SPEC-0003 — recovery simplifications 1 and 2, 2026-11-04

Bounded local follow-up to the [final dual review](spec-0003-final-dual-review-2026-11-04.md). The owner authorized only recommendations 1 and 2 from the subsequent complexity review. No contract amendment or scope expansion was made.

Base: `7a93720d59a01f1e61ed51f519536070d607115b`. Tested runtime candidate: `6fb147d51438c920d0afc568d14c3ee859295e79`. Prerequisite `4b9e40cc185cdbceb3ef248248e440c08f25fa82` remains an ancestor. Root is the sole implementation writer. No push, GitHub mutation, publication or release is claimed.

## Authorized change

1. Checkpoint execution consumes the exact unwitnessed-record list already produced by full inspection inside the same transaction. Per-record capture still verifies continuity. Page retirement selects its item in parameterized SQL; an undefined item still selects the full identity history. The checks before filesystem deletion and inside database clearing remain separate and unchanged.
2. Repair uses the shared `readCurrentNodeRow(..., { includeInvalidated: true })` for version selection. Original/damaged SQLite type and exact bytes still come from `readHistoryBytes`; the shared helper's normalized payload is never used as restoration evidence.

Production changes are confined to `packages/storage/src/history-evidence.ts` and `packages/storage/src/history-recovery.ts`. One existing regression file adds eight cases: mixed existing/unwitnessed/null checkpoint history and refusal; older/absent/dangling quiz selection with SQL-null/JSON-null damage; quoted-page retirement beside unreadable history.

Suggestions 3-5 (verification consolidation, frozen format restructuring, required storage capability) were not implemented. Schemas, persisted SQL/triggers, first-open capture, lock/admission, witness verification, repair permits, audit/receipt/replay, consent snapshots, allocator policy and UI are unchanged. The all-26-original/all-18-revised mapping and exact exclusions in the previous acceptance record remain authoritative; this increment supplies bounded preservation evidence for the affected recovery/compatibility paths, not a new whole-contract certification.

## Verification

Exact commands, exit statuses, timing and logs: [root command ledger](../../../../.local-docs/spec0003-simplifications12-20261104/COMMANDS.md) and [checks.jsonl](../../../../.local-docs/spec0003-simplifications12-20261104/results/checks.jsonl).

| Check | Result |
|---|---|
| Eight new behavioral cases against the unchanged base production source | 8 passed; 21 unrelated title-filter skips. This is an equivalence baseline, not an expected failing regression. |
| `pnpm typecheck` after refactor | Passed; refreshed compiled storage used by process-death tests. |
| Eight affected files via `pnpm exec vitest run ... --maxWorkers=2` | 183 passed; 4 loopback HTTP cases failed solely with sandbox `listen EPERM 127.0.0.1`. |
| Approved rerun of those four HTTP cases | 4 passed; 64 unrelated title-filter skips. All 187 distinct selected tests passed across the original run and bounded retry. Original failure retained. |
| Independent bounded recheck | FINAL, no confirmed defect or weakened guarantee. 39 focused tests passed with no skips; 40 distinct independent checks passed (39 behavior probes and one source/build provenance check), plus a baseline absence control. |
| Custody | Owner draft SHA256 `ee0f3e2c78365841c337aaca7efcd3d9edc83940bd01780af7c84e278aba2861` unchanged; owner tmp preserved. Root claim released before reviewer workloads. |

The affected suite covers history repair/checkpoint/first-open/continuity, book storage/current readers, shared database admission, part import, Sectioning HTTP behavior, and direct reset readers. Existing process-death and damage/audit/replay controls ran in that selection. No full suite, browser journey, Docker/Desktop build, external LMS, hosted CI, paid-provider or release rerun is claimed for this small refactor. The previous full-suite/platform evidence remains attributed to its actual runtime heads. Known hardened Electron and cross-origin SCORM findings remain open and are not accepted deferrals.

## Independent disposition

[Independent report](../../../../.local-docs/spec0003-simplifications12-20261104-recheck/REPORT.md), [exact commands](../../../../.local-docs/spec0003-simplifications12-20261104-recheck/COMMANDS.md), and [final status](../../../../.local-docs/spec0003-simplifications12-20261104-recheck/STATUS.json) are final at the exact runtime candidate above. The reviewer derived requirements from the amended spec before consulting root conclusions and made no source or Git changes.

The independent probes verified checkpoint subset capture, global-proof refusal, stale/replay behavior, exact empty/quoted/whole-book retirement scope, refusal before media deletion, 24 selected-repair combinations, two retired/null-current repairs, exact damaged SQLite type/bytes in audit, and four actual retained older-runtime deletion/clear cases. Source/build provenance was checked for the directly exercised candidate and retained older modules. This does not broaden the prior older-runtime compatibility promise.

Two initial retired/null probe assertions expected `undefined` for an absent database row; both base and candidate return `null`. A separate baseline control confirmed the unchanged behavior. The corrected assertion checks that no extra version exists, and both affected cases passed on a bounded rerun. The initial failed scripts/results are retained. This was a probe expectation error; no production correction or defect deferral was required. Reviewer test totals overlap root tests and are not added into a synthetic coverage total.

All authorized work for simplifications 1 and 2 is complete. Root and reviewer workloads have finished and each released its own shared claim. Confidence is high for final human review of this bounded refactor, with the previous exact contract, approval and platform limitations unchanged. No further review loop or recurring automation was created; the chat remains available.
