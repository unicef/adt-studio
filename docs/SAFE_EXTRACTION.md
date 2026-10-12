# Safe extraction and CLI reruns (B1)

Implementation acceptance is being refreshed against revised SPEC-0003. See the
[authorized contract](specs/SPEC-0010-safe-cli-reruns.md) and
[integration evidence](verification/spec-0010-oct12-integration.md). Human approval
remains pending; historical CI does not certify the integrated branch.

The command remains `pnpm pipeline <label> <pdf-file> [options]`. Extracting into
a new destination is supported. A same-label run first verifies the PDF bytes,
effective extraction settings, contract version, original page records, metadata
versions and asset hashes. It does not overwrite the source, clear history,
retire IDs, detach media or discard LLM caches.

Full initial runs and same-label resumes now share the API stage executors and
SPEC-0001/0002 output evidence, selection and protection policies. This extends
those shared policies in SPEC-0010 for generated Extract, page-level Sectioning
and Storyboard, book-level quiz/glossary/TOC generation, and packaging. The stack
is SPEC-0001 → SPEC-0002 → SPEC-0003 → SPEC-0010; pending review does not imply a
missing implementation prerequisite. Human specification approval remains pending.

Direct `extractPDF` returns `reused` after verification. Ordinary full CLI runs
and API `fromStage: extract` use the preservation-aware planner automatically.
Scoped CLI ranges and HTTP `resume: true` use the same policy. The writer remains
held from admission through publication, including queued execution-time checks.
Current output is reused; successful completion flags alone establish no freshness.

```sh
pnpm pipeline my-book /path/to/unchanged.pdf --books-dir /path/to/books \
  --from-stage translate --to-stage speech
```

Use `--output-scope /path/to/decisions.json` for the shared `OutputRunScope` JSON
(selection, skip, retry, and input/content/revision-bound replacement decisions).
Protected/unknown content is retained by default. A stale replacement decision
fails before generation. Current output causes no provider call or new content
version. The CLI prints a `catalog-resume` summary with completed, reused, skipped
and blocked identities; required unresolved output exits 1. A usable upstream
freshness warning does not prohibit generation or export, but remains visible in
the result. A Sectioning preference change is informational. Only an actual rendering-layout
switch requires whole-active-window publication; saved section counts never gate rendering.

The HTTP stage endpoint accepts `resume: true` for downstream ranges. Queued
requests revalidate extraction and replan when they execute. SSE completion,
error and cancellation events carry the summary; JSON stage/step status also
exposes the last result in this server session. After restart, the shared catalog
reassesses persisted outputs. Existing Studio output review controls show the
new generation units and offer the same guarded Keep/replacement decisions.
Ordinary single-stage attempts can finish with usable retained freshness warnings;
their summary remains incomplete. Explicit resume and multi-stage/full runs remain
nonzero when required output is unresolved.
A full-run summary distinguishes newly created extraction from verified reuse.

Unknown or changed page/document content evidence remains protected even when a
legacy `source` field says AI. Quiz and glossary collection plans separately assess
eligible AI units and protected manual/unknown units; a protected neighbor does
not freeze eligible generation. A required protected, missing or incompatible scope makes the run
incomplete; a skipped unresolved scope is not success. Explicit replacement is
bound to reviewed content, effective inputs and the exact stored owner revision
returned by `GET /books/:label/outputs`. Old decisions without that revision must
be refreshed. Bulk Keep validates the entire batch before evidence writes advance
shared collection versions. Keep cannot supply missing inputs or coverage.

Ordinary Sectioning fills only missing records and retains all existing saved
trees, including deliberately empty trees. To replace it, use the default-off
Sectioning confirmation or `--protected-replacements` with exact semantic, HTML
and tree versions. The shared reset commits inactive rendering versions before
generation. Failure or cancellation afterwards preserves that reset and history;
it never resurrects the old active Storyboard.

Generation publishes through the shared Storage interface after input/content
revalidation. Ordinary Storyboard commits each successful page's HTML/tree pair
immediately, so earlier pages survive later failure, Skip or cancellation. A failed
same-layout page retains its prior usable output. An actual layout switch alone
uses all-success publication over the active window. Explicit Sectioning reset is
already committed before generation, as described above. Book-level generation units
may rerun their own unit when relevant inputs change; normal ordered-input caches
still avoid duplicate requests. Other current units and retained pages are not
rewritten. A book-level quiz/glossary regeneration decision covers eligible AI content only;
it does not authorize deleting protected terms/questions. Use the version-guarded
item editor for a protected replacement, then Keep the resulting authored output
if accepting it for continuation. Glossary drafts retain their opening version and
survive stale-save conflicts. All earlier versions and retired identities survive.

Packaging builds a real bundle in a book-local attempt directory. File inventories
and byte-based input fingerprints invalidate missing or corrupted artifacts.
Publication retains the previous bundle and a durable rename journal; a subsequent
admitted writer recovers an interrupted switch. Readers refuse unresolved switches.
Old bundle generations and failed attempts remain in the book as recoverable assets.
No timeout-based deletion of an anonymous SQLite mutex is introduced.

`UNSAFE_RESUME_UNAVAILABLE` remains the fail-closed fallback when a requested
capability is unsupported. Custom Liquid prompts with dynamic include/render/layout
targets cannot yet establish a safe dependency fingerprint and are refused; use
literal targets for resumable prompts. Unrelated supported scopes remain runnable.
Missing rendering/coverage instead reports the actual
missing input or incomplete result, allowing unrelated runnable pages to publish. Its admission-only
summary never claims completed downstream work. Invalid source or asset failures
never report verified reuse. See [revised-stack acceptance](verification/spec-0010-oct12-acceptance.md).

## New-source workflow

For changed PDFs, extraction options, missing original assets, unknown legacy
provenance or an interrupted attempt, choose a fresh label yourself:

```sh
pnpm pipeline my-new-label /path/to/source.pdf --books-dir /path/to/books
```

Keep the old directory. It contains its source, versions, uploaded recordings,
video assignments and caches. The new book is independent; no identities or edits
are transferred by page position. Existing legacy books remain editable. This
release does not backfill provenance or offer an in-place force/reset command.

## Provenance and interruption

`extraction.json` is book-local application provenance. An `extracting` attempt
is written atomically before copying source bytes or writing extraction content.
Extraction reads the stored source snapshot. A completed manifest is published
only after the expected nonempty page set, image files, original metadata
versions and source snapshot have been validated and flushed. Later editor
versions and additional crops do not invalidate those original versions. Before
first extraction, uploaded font files are accepted only when referenced by
schema-valid retained font registry versions; their bytes and history stay intact.
Unregistered files or symlinks do not make an occupied destination eligible.

On failure/cancellation the attempt and partial data remain. Readers cannot use
that partial page set through the API, and restart cannot infer completion.
Diagnostics/source inspection remain available. An interrupted manifest requires
a new destination, not automatic retry into the partial book.

Project archives include the manifest, source, DB history and referenced media.
Collision-renamed imports relocate the source filename in existing provenance
and validate complete inventories; they do not invent provenance for legacy
archives. Imports also exclude normalized aliases of process ownership records.
Archives exclude process writer ownership. Do not run older ADT binaries against the
same directory: those binaries do not implement the writer/admission protocol.

File flushes use non-truncating writable handles, as required by
[Windows FlushFileBuffers](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers).
Directory fsync is used on POSIX; Windows skips that unsupported operation.
Windows installer/power-loss acceptance has not been run.

## Writer coordination and recovery

`@adt/storage.withBookWriter` is shared by API content writes, stage runs,
TaskService executors, direct extraction and the CLI DAG. The book-local
`.book-writer.json` lease uses exclusive creation and a counted async context for
nested/background work. A queued stage revalidates when it starts, before its
pre-run callback. Cancellation/decision endpoints remain available while a writer
is running. Different processes fail with `BOOK_BUSY`; the existing API stage
queue remains sequential within one server.

HTTP archive downloads also acquire this lease before invoking the exporter.
Part exports can write a ledger, and project ZIP production yields between file
reads. The lease lasts until those reads finish, including after a client cancels
the download; read failure releases it. This prevents archives from mixing files
from different concurrent mutations. It does not hold the book until the last
network byte reaches the client.

There is no timeout-based lock stealing. Recovery only reclaims a valid owner
record on the same host when `kill(pid, 0)` reports `ESRCH`. A live/reused PID,
foreign host, malformed owner or existing `.book-writer.json.recovery` marker
fails closed. Ambiguous records require operator investigation with all ADT
processes stopped; this release provides no force-unlock button. PID namespaces
must not share one writable books volume. SQLite WAL/journal files are never
deleted by startup cleanup. An unresolved SQLite mutex also fails closed; writer
recovery alone does not authorize discarding database recovery state.

The primitive is adapted from the concurrent local SPEC-0003 implementation
(`tmp/spec-0003-implementation/packages/storage/src/book-writer.ts`, inspected
2026-09-25). It uses the same lock name, owner fields and async nesting contract.
This branch adds new-destination creation, admission assertions and fail-closed
handling for an unfinished recovery record. Integration must keep one exported
primitive/schema, not retain parallel writer locks. No changes were made to that
other checkout or PR. The HTTP archive drain also adapts SPEC-0003's
`apps/api/src/services/export-service.ts` at local commit `971df004`, retaining
the same lease until its eager ZIP producer has finished, even after cancellation.

See [the acceptance evidence](specs/SPEC-0010-implementation-evidence.md). Human
specification review and packaged/release acceptance remain separate gates.
