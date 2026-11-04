# SPEC-0003 — verified history recovery work record

Starting head: `0cda806424f9ee603f9edb215b9009d1f354f342`; tested predecessor
runtime: `943322703621e866c797878a6b12e15be376c335`. Local work only. Specification
approval remains pending. The owner endorsed pursuing verified recovery after
the round-four findings; the owner subsequently authorized the narrow exact-byte restoration exception.
It does not authorize arbitrary historical edits or specification approval.

**2026-11-04 amendment:** the owner delegated the F-2 compatibility decision.
Readable, previously untracked identity history is now captured once on first
open, atomically with tracking installation. This supersedes this historical
record's explicit-only/GET-does-not-capture wording for that initial migration.
Existing proof and tracked changes are never silently replaced; subsequent
checkpoints, repair and regeneration retain their explicit consent. See the
[acceptance record](spec-0003-recovery-acceptance-2026-11-04.md) for current evidence
and the exact older-writer limitations.

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

## Authorized persistence decision (implementation in progress)

The owner accepted the verified exact-byte restoration exception in this chat.
A recovery transaction may restore only a pre-existing, verified original payload
to its exact damaged node/item/version. It must retain the SQLite storage type and
raw damaged bytes, the witness, and the recovery receipt in append-only audit
records in the same transaction. No guessed reconstruction, arbitrary historical
editing, deleted-history repair, or automatic regeneration is authorized.

Witnesses bind book identity, tuple, insertion incarnation, storage type and byte
hash. SQLite triggers retain insertion/deletion/update continuity for direct and
older writers too. A reused tuple cannot inherit an earlier witness. New supported
writes capture evidence in their transaction; explicit checkpoints capture only
currently readable, noncontradictory legacy records. GET creates no evidence.
Known retired records remain available to the existing ID reservation factories
through verified original witnesses; these are not current content or a new ID
allocator. Unexpected missing records or unverifiable retired evidence fail safe.

Repair preserves original versions and authorship. If the damaged version was
selected, append a byte-equivalent new current version after restoring the
historical original: this rejects editors with pre-recovery numeric baseVersion.
A repaired unselected version never becomes current. A versioned recovery receipt
also changes existing admission/package proofs; repair does not mark generation
complete or accept downstream freshness. Fresh replacement consent is required.

The same schema-14 raw readers continue seeing the restored original bytes; no
new read projection or schema-version change is needed. Older writes that have no
witness remain readable but are not automatically recoverable. No witness may be
manufactured retroactively from an already damaged record. This applies only to
the identity-bearing history nodes used by the shared allocation factories.

## Results

The following H1 results describe the earlier checkpoint, before the recovery
implementation below. Evidence is under
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
release verification is claimed for this partial checkpoint. At that checkpoint recovery still required a persistence decision and implementation.
The owner has since authorized the narrow exception above. These historical H1
checks alone do not establish acceptance of the subsequent recovery implementation.


## Recovery candidate: current local work

The authorized recovery path is now implemented in storage, shared schemas, API
and Studio, with no new dependency, schema-version increment, writer protocol,
ID allocator, or freshness authority. New identity-bearing writes and part
imports capture witnesses in their transaction; the explicit checkpoint records
only readable, noncontradictory legacy versions. The existing allocation factories
reserve identities from extant history plus verified retired witnesses. Recovery
uses the existing shared writer admission and one SQLite transaction. It records
the damaged storage type/bytes, proof and receipt, restores only the verified exact
original, advances an affected selected version, and writes a versioned recovery
receipt consumed by existing consent/package fingerprints. It starts no pipeline.

The implementation also handles normal older/direct SQL writers: insertion,
deletion or update changes record continuity, so an earlier incarnation cannot
restore a reused tuple. Evidence rejects UPDATE, DELETE and INSERT OR REPLACE.
Unverifiable, missing or already-damaged unwitnessed legacy history still cannot be
reconstructed. This is the owner-authorized safe refusal, not a claim of universal
repair or an allocation bypass.

Current evidence is in `.local-docs/spec0003-verified-recovery-20261103/` (`R`).
These are incremental results, not a final frozen-head acceptance report:

- `storage-focused`: 54 passed, one regression found in the new extraction cleanup
  ordering. The change was corrected so image cleanup failure still retains DB
  rows; history is preflighted before either operation.
- `storage-ui`: 61 passed in three files after that correction (see exact totals
  in its log). Public recovery API cases subsequently passed for fixed/reflowable,
  whole-book/part-window flows: recovery → old draft/consent refusal → fresh
  Sectioning → split → Storyboard, with original image and neighbor preservation.
- `affected`: 223 passed, 16 platform skips, one harness assertion failed because
  the child had opened a connection without holding a SQLite read transaction.
  The test now starts and reads an actual deferred transaction. No lock deletion
  or production admission change was made to satisfy it.
- `recovery-final`: **47 passed** in three files, including three independent
  process-death boundaries (after restoration, before commit, after commit),
  atomic rollback/receipt replay and a live independent reader transaction.
  UI tests cover default-off/Cancel, exact snapshot consent, cross-book navigation,
  delayed responses and duplicate/retried requests.
- Root typecheck and Studio lint pass. Changed strings have translations in all
  five locales. Strict compilation initially caught one obsolete untranslated
  draft message; that unused entry was removed, and compilation passed. The final checkpoint-label addition also passed extraction and strict
  compilation. Runtime and Desktop typechecks pass.

- `browser3`: all four actual-browser journeys pass (fixed/reflowable, whole book/
  part window). Each exercises explicit checkpoint, physical-damage simulation,
  zero-call pre-reset refusal, default-off recovery/Cancel, verified repair,
  stale prior consent refusal, informational preference change, fresh explicit
  Sectioning, split/clone/merge/delete plus saved-tree add, Storyboard and Preview.
  Each makes one real stubbed Sectioning transport call after consent; templates
  render Storyboard without an LLM. All original history rows and all 26 media
  files per fixture remain unchanged. The first two attempts are retained as
  harness failures: a probe raced a live reader, then used a button selector for
  the existing radio control. No product change was made for either failure.
- Final extraction reports **4,573 entries per locale, zero missing**. Strict
  compilation, root/runtime/Desktop typechecks and Studio lint pass.

The full branch suite, compatibility,
Docker/Desktop checks and the two requested independent whole-contract reviews
are in progress or pending. No completion, final review readiness or publication
is claimed by this candidate record. The final 26-original/18-revised matrix must
be refreshed from their results.
