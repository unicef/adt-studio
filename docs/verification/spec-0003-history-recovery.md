# SPEC-0003 — verified history recovery work record

Starting head: `0cda806424f9ee603f9edb215b9009d1f354f342`; tested predecessor
runtime: `943322703621e866c797878a6b12e15be376c335`. Local work only. Specification
approval remains pending. The owner endorsed pursuing verified recovery after
the round-four findings; the precise persistence/compatibility choice below is
still awaiting an explicit answer.

## Contract and requirement map before editing runtime

The [round-four matrix](spec-0003-round4-remediation.md) retains all original
AC-1–26 and revised RAC-1–18 mappings. This increment addresses Claude F-R4-1
and the incomplete RAC-4/5/8 paths, while preserving RAC-6/7/12–18. Nothing here
turns earlier failing continuation cases into passes or approved deferrals.

| Requirement | Current behavior | Required change / public boundary | Concrete verification |
|---|---|---|---|
| H1: prove historical identity safety before reset or calls | Healthy-page regeneration can reset, call the provider, then fail on another page's malformed history | Shared identity scan before admitted Sectioning work; immediate API, queued execution, direct runner and supported DAG's Sectioning step. Audit other ID-allocating writers during recovery integration | Malformed neighbor leaves exact raw rows, selected versions, output and assets unchanged; actual Sectioning transport count zero; healthy read/render and no-op Sectioning still work |
| H2: evidence predates damage and belongs to the exact record | No complete independent historical identity record exists | Capture verified original payload/identity evidence for supported writes and an explicit healthy-book checkpoint; bind book, node, item, version and bytes | Wrong book/tuple/hash, missing/changed witness and fabricated content refused; evidence cannot be created from a currently unreadable payload |
| H3: explicit inspect/confirm/recover | No supported recovery action | Studio → shared Zod/API → service → existing writer admission/transaction → read model | Affected versions/evidence shown; default-off confirmation, Cancel, stale snapshot, cross-book navigation, duplicate/retried request |
| H4: preserve damaged evidence and authored identities | Raw history survives failure | Retain exact damaged bytes plus verified evidence and recovery audit; never guess an older version or positional ownership | Byte comparisons of every old record/asset and stable answer/catalog/audio IDs; ambiguous recovery is refused |
| H5: commit/restart/concurrency safety | Shared writer and SQLite transaction mechanisms exist | Reuse them; no separate locks, timeout deletion or freshness authority | Independent processes, crash before/after commit, reader exclusion, concurrent edit, repeat request and next successful write |
| H6: every reader agrees | Storage and several API/part readers directly read node_data | Resolve persistence choice below before implementing repair; include current, historical, raw diagnostics, part import/export, Preview and package | Real HTTP/ZIP and old-build compatibility checks; no stale cached package or old selected-version receipt becomes current silently |
| H7: unrecoverable cases are honest | Generic late pipeline failure | Typed localized early refusal; retain usable output; explain absence of trustworthy evidence | Legacy without witness, corrupt witness, truncated history, malformed but otherwise healthy neighbor; no invented repair success |
| H8: successful recovery completes the promised journey | Exact private fixture restoration succeeds, not a product workflow | Repair through public workflow then fresh explicit Sectioning consent → regeneration → structural edits → Storyboard | Both layouts, active part window, immediate/queued/targeted paths, duplicate/restart, no collateral changes |
| H9: independently verified delivery | Round-four checks cover only the predecessor | Focused then full applicable checks, five locales, packaged runtimes and bounded independent recheck | Record exact heads/commands/results and distinguish known platform issues, unavailable checks and functional defects |

## Pending persistence decision

The bounded independent design review confirms a Storage-only read overlay is
insufficient: several API readers and part import read raw SQLite rows. There are
two reviewable alternatives:

1. Restore only proven original bytes to the exact damaged tuple, retaining the
   damaged bytes and witness in an immutable audit in the same transaction. This
   retains old-reader compatibility but needs an explicit narrow exception to
   AGENTS.md's literal no-overwrite rule. It grants no arbitrary historical editing.
2. Keep the original row unchanged and introduce one effective read projection
   for every semantic reader, with a book-format gate that older apps refuse.
   This preserves raw rows literally but changes the prior compatibility contract.

Neither alternative is assumed authorized by this record. The shared early
admission guard, diagnosis and regression work are independent of that choice.
Recovery cannot reconstruct destroyed information without a verified prior
witness. An older current version or plausible LLM reconstruction is not proof.

## Results

The independent H1 Sectioning guard is implemented; H2–H9 recovery integration is
not implemented. Evidence is under
`.local-docs/spec0003-history-recovery-20261103/` in the main repository (`E`).

- The initial HTTP/direct-runner regressions reproduce admission followed by
  reset and a late provider failure. Their log remains `E/logs/before-history-admission.log`.
  A third, positive-control test initially expected a failed ordinary Storyboard
  attempt, but the existing behavior correctly completed runnable work and kept
  missing-work coverage separate. That expectation was corrected; it was not a
  production defect or a relaxed rejection assertion.
- `pnpm exec vitest run apps/api/src/services/sectioning-existing-book.test.ts apps/api/src/services/sectioning-preflight-runners.test.ts apps/api/src/services/sectioning-targeted-fixed.test.ts packages/storage/src/__tests__/book-storage.test.ts apps/studio/src/lib/sectioning-error.test.ts --maxWorkers=2`:
  **134 tests passed in five files** (108.78s Vitest, 110.50s wrapper). The first
  sandboxed attempt passed 130 and failed four actual HTTP cases solely with
  `listen EPERM: operation not permitted 127.0.0.1`; the same source passed when
  loopback was allowed. Both logs remain; this is an execution restriction, not
  a pre-existing product-failure claim.
- New tests cover immediate replacement, direct execution, ordinary missing-page
  work, queued revalidation, and the no-op/usable-read control. They compare all
  raw node rows and selected pointers, but their generation counters are mocked
  helper counters; the following public probe supplies transport evidence.
- `python3 E/probes/history-policy-public2.py`: actual separate-process API/Studio
  runtime and HTTP request, **409 `HISTORY_REPAIR_REQUIRED`, zero stubbed provider
  transport calls, and identical raw source/render history before/after refusal**.
  Exact restoration of only the private fixture's known original bytes then
  permits generation. That positive control is not a production recovery action.
  `E/results/history-policy-public.json` and `public-admission-media.json` retain
  details: all 26 original image/audio files (8 PNG, 18 WAV) still match after the
  refusal plus positive private control. No paid provider calls were made.
- `pnpm typecheck`, `pnpm lint`, `pnpm --filter @adt/studio extract` and
  `pnpm --filter @adt/studio exec lingui compile --strict` pass. The new diagnostic
  is translated in en, pt-BR, es, fr and sq. Exact wrapper commands/results are
  in `E/results/checks.jsonl`.
- The separate reviewer found no concrete bypass in the scoped H1 source delta.
  It confirmed the API/queued/direct/reset checks and preserved read/no-op access.
  Its review was source-only, with no independently executed tests. It explicitly
  limits the new guard to Sectioning: quiz/glossary provider calls are not newly
  preflighted, and the DAG check precedes Sectioning calls, not earlier
  extraction/metadata/outline calls. Existing-book CLI refusal remains earlier.

No new whole-branch suite, packaging build, full browser recovery journey or
release verification is claimed for this partial checkpoint. Recovery requires
the pending persistence decision, its implementation, then full affected checks
and a bounded independent recheck. The 26+18 full-contract matrix remains
incomplete; the early guard does not make option 2 complete.
