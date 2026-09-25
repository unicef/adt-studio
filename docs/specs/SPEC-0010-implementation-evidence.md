# SPEC-0010 implementation plan and evidence

The published spec and ADR 026 remain in review, with no approval inferred from
implementation. The requester authorized implementation before approval on
2026-09-25. This branch is rebased onto develop `737d3314`; the original published
head `d906d7f3` is preserved in `backup/spec-0010-before-implementation-20260925`.
Implementation commit: `7d5cec5f`. No implementation commit is pushed in this task.

## Dependencies and references

PRs #879 (`375081fc`) and #880 (`5eeaab68`) contain documentation only. Their
review feedback requires unknown-origin protection, physical media preservation,
conflict-safe publication and CLI parity. PR #884 (`04250fda`) also contains only
documentation. None supplies a usable shared downstream planner or rendering
preflight. Verified extraction reuse must therefore stop full CLI/API runs with
`UNSAFE_RESUME_UNAVAILABLE`, before downstream mutation. This is a partial
delivery, not completion of #810.

The target names no existing implementation PR for #810. The spec references
Eduardo Alcantara's #876 (`acabf63c`) for the separate skipped-progress fix. Its
diff and discussion were inspected; its progress rendering is deliberately not
copied because it is a non-goal here. It remains unchanged. Roadmap/SDD references
under `Downloads/adt studio proposal` require preserving manual work, histories
and media, truthful acceptance evidence, and human review before release.

## Before-edit acceptance map

| AC | Current behavior / gap | Required change | Concrete verification |
|---|---|---|---|
| 1 | Extraction clears storage; no manifest | Initial import attempt, durable completion inventory | Real PDF/storage integration; failed publication |
| 2 | Same input re-extracts destructively | Hash and inventory validation; read-only reuse | Compare DB rows/versions and file hashes |
| 3 | CLI copies PDF first | Compare bytes before copy/open | Equal-length changed PDF; stored source unchanged |
| 4 | No extraction fingerprint | Normalize resolved options and contract version | Defaults, ranges, spreads, figure flags, fixed layout, downstream-only settings |
| 5 | No completeness proof | Validate inventory, reject zero pages/incomplete | Missing/corrupt asset and manifest fixtures |
| 6 | Existing content is cleared | Fail closed for unknown provenance | Legacy real DB and arbitrary file snapshots |
| 7 | Interrupted rows can be cleared next run | Persist attempt first; preserve partial state | Failure/cancel/child-process termination and restart |
| 8 | History, IDs and media are retired/deleted | Reuse does not write content or retire identities | Multi-version/manual/media/ID fixture comparison |
| 9 | Pre-copy and pre-run clears precede checks | Common admission before all side effects | Rejected calls preserve bytes; zero transport requests |
| 10 | API, CLI and direct extraction differ | One admission policy at runner and extraction boundary | HTTP, queued, CLI and direct regressions |
| 11 | Only per-process stage queue | Book-local process writer gate; conservative recovery | Two processes, live/terminated owner, API/task competition |
| 12 | Unconditional downstream DAG | Reject reused full runs until shared policies exist | No provider/content writes; explicit unavailable error |
| 13 | No shared freshness proof | Honest nonzero unavailable outcome | CLI exit; full current/stale/protected resume remains blocked |
| 14 | Cache survives some resets | Admission leaves cache intact | Hash cache fixture; normal cached transport regression |
| 15 | Same destination reset | Fresh user-selected label guidance | Rejection message and independent new-book import |
| 16 | Generic errors | Structured safe reason codes; five locale messages | HTTP/CLI/UI mapping and Lingui checks |
| 17 | External source read after copy | Snapshot and hash actual extracted bytes | Modify external source during extraction |
| 18 | Provenance absent | Book-local manifest/attempt; retain referenced files | Archive contents and real-storage preservation |

Narrative checks also cover imported metadata, part windows, editor-created
assets, immutable original extraction inventory, cancellation, duplicate queued
requests, startup recovery, and hiding incomplete extraction from readers.
No destructive force flag, legacy backfill, positional identity transfer or
separate downstream scheduler is permitted.

## Implemented scope and acceptance evidence

**Partial delivery.** Admission, durable initial extraction and verified extraction
reuse are implemented. No shared downstream planner is available on the refreshed
remote dependencies. No preserved book enters the legacy unconditional DAG.
AC-12's safe-refusal branch is implemented; full AC-12/13 remain blocked. This does
not complete #810. Spec/INDEX remain `in-review`, approvers remain empty and the
spec checkboxes are not used to imply human or release acceptance.

Test paths below are repository-relative. The main real-storage contract suite is
`packages/pipeline/src/__tests__/extraction-admission.test.ts` (A), the process
suite is `packages/storage/src/__tests__/book-writer.test.ts` (W), API integration
is `apps/api/src/routes/extraction-admission.test.ts` (H), and UI reason mapping is
`apps/studio/src/lib/extraction-errors.test.ts` (U).

| AC | Status | Evidence / limitation |
|---|---|---|
| 1 | Passed | A: real Raven PDF; imported metadata history; exact page/asset/node inventory; failure injection at attempt, source snapshot, asset flush and final rename. Completion follows file flush and inventory verification. H also exercises actual initial HTTP execution and cancellation after publication, before provider transport. |
| 2 | Passed | A: repeated direct extraction returns `reused`; recursive file hashes and retained node versions are identical. Original metadata versions are verified, not current editor pointers. |
| 3 | Passed | A: same-length altered bytes reject before source overwrite; the entire stored book stays identical. |
| 4 | Passed | A: omitted/explicit defaults, effective greedy spread pairs, fixed part window, six option mismatches, contract-version change, and downstream-only language/concurrency config. |
| 5 | Passed | A: missing/corrupt files, truncated inventory, empty page list and incomplete manifest cannot be reused. |
| 6 | Passed | A/H: deleting a manifest from a populated real book causes legacy refusal; direct old Extract callback retains content and ID history. No backfill. |
| 7 | Passed | A: cancellation after a persisted page, injected publication failures and SIGKILL during extraction retain incomplete/failed provenance; restart refuses without deleting partial bytes. |
| 8 | Passed | A/H: multi-version sectioning and metadata, manual Core TTS, recordings, video assignments, editor crops, original versions and next-version allocation survive reuse. Existing quiz regression now asserts Extract preserves current quiz/history/allocator state. |
| 9 | Passed | A/H: rejection leaves stored bytes identical and performs zero provider fetches; queued callback never runs on a reused book. `pnpm lint:invariants` prevents ordinary `clearExtractedData` call sites. |
| 10 | Passed | A/H: actual CLI subprocess, full DAG, HTTP route, direct stage runner, queued worker and direct `extractPDF` enforce admission. Route submission defers other stage clears until admitted execution. |
| 11 | Passed | W/H: independent Node owner process, live owner with ancient mtime, proven-dead recovery, unfinished recovery refusal, nested background lifetime, API/TaskService conflicts, startup recovery and atomic new-book reservations. Six independent contenders admit exactly one winner for both an empty gate and recovery of a terminated owner. |
| 12 | Blocked | A/H prove the documented `UNSAFE_RESUME_UNAVAILABLE` fallback before provider/content writes. Actual shared freshness/preservation/rendering integration is unavailable on #879/#880/#884. |
| 13 | Blocked | A proves nonzero CLI exit and zero transport calls on refused reuse. Current/stale/protected downstream planning, summaries and successful full resume are not implemented or represented as tested. |
| 14 | Passed | A: real LLM cache plus stub provider backend counts exactly one transport call across generation, extraction reuse and another generation; cached response still passes the normal schema validator. Cache/media files survive byte comparisons. |
| 15 | Passed | A: a user-selected second label successfully extracts changed settings, without transferring manual nodes or changing the old book. Errors/documentation give the fresh-label command shape. |
| 16 | Passed | H/U: stable HTTP 409 codes, direct/CLI error reasons, eight UI mappings, unrelated errors retained. All five catalogs have zero missing translations. Live Studio displays the safe-resume refusal. |
| 17 | Passed | A: the external PDF is replaced on `step-start`; extraction and completed provenance still describe the immutable stored snapshot. |
| 18 | Passed | A/H: project ZIP includes source, extraction manifest, DB history and recording; excludes process owner/recovery records. Media hashes/assignments remain intact. Provenance is entirely book-local. HTTP archive admission spans asynchronous reads, cancellation and read failure; part-ledger writes reject a competing writer. |

## Commands and outcomes

Validation was run on macOS/Node 22 in the isolated checkout. Git-dependent checks
use `PATH=/Library/Developer/CommandLineTools/usr/bin:$PATH` because the system
Xcode Git is license-gated. Logs are retained locally under
`tmp/spec0010-verification/` in this checkout; they are not release artifacts.

- Baseline `pnpm build`, `pnpm typecheck`, `pnpm lint`: passed; lint had eight
  existing unused-suppression warnings and zero errors.
- Baseline full Vitest: 275/277 files passed; the 22 failures in two release-script
  files were the Xcode Git invocation. Re-running all scripts with Command Line
  Tools Git passed all 6 files / 84 tests.
- Final repository suite: `pnpm test --maxWorkers=2 --testTimeout=30000`: **281 files / 3,650 tests passed**.
- Final focused contract suite: `pnpm exec vitest run --maxWorkers=2 --testTimeout=30000` over A/W/H/U and the original PDF-extraction suite: **5 files / 48 tests passed**.
- `pnpm typecheck`, `pnpm lint`, `pnpm lint:invariants`, `git diff --check`: passed;
  lint still has the same eight warnings and zero errors.
- `pnpm --filter @adt/studio extract`: 3,613 strings per catalog; no missing
  translations in es, fr, pt-BR or sq; en is the source catalog.
- `pnpm build` (also run by `pnpm test`): passed. `pnpm --filter @adt/studio build`:
  passed with the existing chunk-size warning.
- `pnpm --filter @adt/api build:server` and
  `node apps/api/scripts/bundle-electron-server.mjs`: passed, including WASM copies.
  This validates bundles, not installed Desktop behavior.
- Live in-app browser, isolated one-page Raven book, loopback API/Studio: Extract
  rerun returns 409; Studio visibly displays “The original extraction is verified.
  Safe downstream resume is not available yet, so no content was changed or
  generated.” The original page/metadata stays visible. The rerun UI also used
  seeded stage-completion rows; no paid generation was used to prepare this fixture.

The first implementation suite exposed two obsolete assertions: immediate route
submission clearing and destructive Extract quiz reset. Both now assert the new
contract; they were not dismissed as baseline failures. A WebPub export test
also exceeded its 15-second limit during concurrent machine workloads; its
isolated rerun passed. The final full run uses a 30-second per-test limit. The
asset-flush fault test originally caught a reused SQLite file descriptor; it was
corrected to target only the actual extraction asset flush.

## Verification limits and integration notes

- Docker validation is blocked: `docker info` reports that the local Docker daemon
  is not running. No Docker image build is claimed.
- Signed installers, Windows/Linux runtime, power-loss durability on each supported
  filesystem, representative production books and release upgrade acceptance were
  not run. One small repository PDF and real storage/process fixtures were used.
- No hosted CI run validates these local commits because the user requested **no
  push**. No PR was merged and no issue-closing keyword was added.
- The local branch is based directly on `origin/develop` `737d3314`; only the
  target spec, INDEX row and ADR 026 were retained from its old document stack.
  PR #886's remote head remains `d906d7f3` and base remains
  `spec/618-validation-fix-routing`. Retarget to `develop` together with the later
  publication of this rebased head; retargeting the old remote head now would
  expose unrelated inherited specs. Any later history rewrite needs a fresh
  lease against the remote head, not a blind force push.
- `elasticsounds` remains the requested reviewer. Human approval of the B1
  new-destination restriction and downstream preservation policy remains pending.
- Shared writer work was adapted from the concurrent local SPEC-0003 draft; see
  [attribution and protocol details](../SAFE_EXTRACTION.md). No other PR or
  checkout was modified. Their future integration must keep one writer primitive.


## Follow-up confidence review (2026-09-25)

The behavioral review found an additional writer gap: GET archive routes bypassed
writer admission. `export-part` writes a coordinator ledger, and the eager project
ZIP producer yields every 50 files, so another writer could mutate later files
while an archive was being built. New regressions failed on the prior local head:
the occupied part export returned 200 instead of 409, and ordinary/cancelled
archive reads allowed a competing writer before source reads finished.

HTTP archive routes now enter the existing book writer gate before their handlers.
A counted nested lease drains the response producer until it finishes reading,
even after client cancellation, and releases on read failure. This adapts the
existing SPEC-0003 archive mechanism rather than introducing another lock.

Ten additional regression cases cover:

- The actual part exporter: a competing writer prevents ledger creation; the
  same export succeeds and records its ledger after that writer finishes.
- A real project ZIP with 110 extra retained files: the writer is excluded across
  the producer's asynchronous yields, including client cancellation. Successful
  output retains the final file and manifest and excludes ownership records.
- Source stream failure releases archive admission.
- Six independent Node contenders, both on an empty gate and after a terminated
  owner: exactly one acquires ownership, the other five receive `BOOK_BUSY`, and
  a later writer can enter after the winner releases.
- Actual HTTP initial extraction, persisted completion, cancellation before model
  work, zero provider transport calls and subsequent verified direct reuse.
- Canonical and two percent-encoded URL spellings all reject incomplete page
  reads. This suspected bypass was not reproduced; no URL routing change was made.

Focused validation: **2 files / 22 tests passed**. Typecheck, lint (zero errors,
the same eight baseline warnings), the extraction-reset invariant and diff
whitespace checks passed. API server and Electron API bundles also passed; these
are build checks, not installed Desktop acceptance. No Studio strings changed in
this follow-up.

Full repository rerun: `pnpm test --maxWorkers=2 --testTimeout=30000` passed
**281 files / 3,660 tests** in 399 seconds, including its build prerequisite.
The original live-UI and Lingui results above describe the earlier implementation
head; neither Studio code nor strings changed in this follow-up. Full downstream
resume remains unavailable; AC-12/13 are still blocked. Packaged-platform and
release verification limits remain unchanged.


## Independent implementation review

A subsequent full-spec/system review reproduced and fixed archive ownership-path
aliases, collision-renamed source provenance and first-extraction font-upload
compatibility. See [the review report](../verification/spec-0010-review.md) for
findings, refreshed dependencies, an AC-by-AC matrix, completion estimate and
verification limits. The spec remains in review and full downstream resume is
still blocked; no acceptance criterion was weakened.
