# SPEC-0003 shared SQLite reader admission — 2 November 2026

Local implementation and proof-boundary record. The independent live/dead-reader
recheck, exact-head full suite, actual Studio visibility and Linux admission checks
now pass; see the [final audit](spec-0003-final-audit-2026-11-02.md).
Standard combined Docker packaging/runtime remains unverified because its VM disk
is full. This is not specification approval or release certification.

## Reproduction and authorized correction

An independent reviewer paused a real HTTP page GET inside WASM SQLite's filesystem
read callback, after SQLite acquired its anonymous directory mutex. An independent
startup process acquired the writer lease, removed that live mutex and updated/read
the database before the reader resumed. The reader later returned HTTP 200. This
proves overlapping entry, not observed corruption. The private original fixture,
JSON result, source hashes and report remain under
`/private/tmp/spec0003-develop-integration-20261102-qxccq5e1/reviews/independent/reader-mutex/`.

The owner explicitly selected extension of shared admission to all readers, rather
than a blanket refusal of mutex recovery. The amended SPEC-0003/ADR025 records this
correction to Note 7 B6's insufficient no-live-writer assumption. The prerequisite's
actual approval remains unchanged; SPEC-0003 approval is still pending.

## One protocol and its proof boundary

- All three production SQLite constructor paths now use `database-admission.ts`:
  normal/migrating storage, nonmigrating schema reads and extraction inventory.
- The existing `.book-writer.json` process lease remains the sole admission record.
  Every connection pins it until the connection and outstanding statements close.
- Same-process handles borrow that lease without gaining AsyncLocalStorage writer
  authority. Each writer invocation has its own active scope. A settled callback
  cannot acquire authority from a surviving reader pin or a later writer.
- The existing recovery reservation serializes every owner publication, fresh or
  recovered. A delayed reaper rechecks the exact token and process-death proof under
  its reservation. It cannot displace a newer live owner. Unknown/orphan reservations
  remain exclusive; no timeout authorizes deletion or admission.
- Exact database basenames are persisted and fsynced before SQLite construction.
  Unknown mutexes cannot gain provenance by first stamping a fresh lease. Recovery
  preflights every candidate and removes only empty real directories registered by
  a proven-dead coordinated owner. WAL/journal/data files stay for SQLite recovery.
- Symlink/hardlinked database or owner evidence, dangling mutex/reservation paths,
  unknown mutexes, partial records and ambiguous Linux identity remain fail closed.
  Local borrowers recheck the current owner token and registered filenames.
- Successful `close_v2` alone is insufficient: the wrapper finalizes tracked
  statements first. Failed finalization retains the pin. Resuming an iterator after
  close cannot use a finalized SQLite pointer.
- Startup performs no separate mutex deletion. Doctor describes an unverified mutex
  without instructing the user to remove it. Extraction preserves `BOOK_BUSY` rather
  than presenting admission failure as corrupted assets or a legacy book.

The Linux incarnation, namespace, default Docker isolation/container evidence and
conservative legacy predicates are retained. New capability fields do not certify
concurrent use by older builds or raw SQLite clients that ignore admission. That
mixed-version concurrency remains unsupported; old-build readability is tested on
isolated copies. Existing book data/schema is not migrated by this lease extension.

## Fresh checkpoint evidence

Build passed. The focused command was:

```sh
pnpm exec vitest run \
  packages/storage/src/__tests__/database-admission.test.ts \
  packages/storage/src/__tests__/book-writer.test.ts \
  packages/storage/src/__tests__/book-writer-recovery.test.ts \
  packages/storage/src/__tests__/sectioning-book-writer.test.ts \
  packages/pipeline/src/__tests__/book-doctor.test.ts --maxWorkers=2
```

Result: **5 files passed, 50 tests passed, 16 Linux-only cases skipped on macOS**.
The tests use real filesystem/SQLite and independent processes. They cover live
readers/startup, killed coordinated reader rollback, next successful operation,
local visibility without unrelated writer authority, stale async contexts, last
statement closure, aliases/dangling paths, short capability writes, changed local
owner evidence, all-candidate preflight, delayed reaper/new owner, orphan reservation,
ordinary writer crash with coordinated versus legacy evidence and six contenders.

These totals do not substitute for the original paused-HTTP independent recheck,
slow-page actual Studio visibility, Linux/Docker restart tests, full tests,
packaged runtime checks or the final acceptance matrices. The frozen `f66613ea` full suite passes 6,255 tests; the Linux dependency-overlay
run passes all 67 admission/doctor cases, including the 16 skipped on Darwin.
Independent real paused-reader and killed-reader rechecks pass on Darwin; bundled
Desktop API generation/export/restart passes. The standard combined Docker app
build failed from full VM disk, so its current-image runtime/restart is not run.
These later results supersede the pending checkpoint without broadening its proof
boundary; exact commands, provenance and limits are in the final audit.
