# SPEC-0012 implementation evidence

> Historical snapshot. The [12 October full continuation](../verification/spec-0012-full-continuation.md)
> supersedes its completion estimates and missing-dependency statements.

This is the first, read-only rollout slice of SPEC-0012, not the full implementation.
The specification remains in review, with no approvers. Implementation before
approval was explicitly authorized on 2026-09-25. No release verification is claimed.

Latest update: [26 September force-fresh continuation](SPEC-0012-force-fresh-evidence.md).

The subsequent [independent implementation review](SPEC-0012-independent-review.md)
records additional fixes, refreshed dependency status, the current verification
results and an updated AC-to-evidence matrix. It supersedes the initial dependency
snapshot and earlier test totals below.

## Refreshed inputs and dependency decision

- Base: develop `737d3314`; published #888: `b850875c` (preserved as
  `backup/spec-0012-published-20260925`). Rebased only its spec and INDEX row onto
  develop, dropping the unrelated inherited documentation stack.
- Read complete published spec, #515/#580/#731 and their comments, #888/#581
  discussions and inline reviews (none), and #879/#880 review feedback.
- Published #879 `375081fc`, #880 `5eeaab68`, #884 `04250fda` are documentation only.
  The initial local inspection found no committed shared writer admission; the
  independent review subsequently found committed SPEC-0003 implementation at
  `d9be75df` with an actively changing working tree. That is an integration
  prerequisite, not absent code. #887 prompt persistence is not a prerequisite.
- Current `saveStoryboardNode` still calls book-wide `clearCaptionData`;
  the atomic Storyboard route exists but has no expected source/render version
  contract, shared writer admission or protection/freshness metadata. The task
  service is independent of pipeline step admission. #731 force-fresh behavior
  is absent from the rerender service and model options.
- Therefore automatic propagation, transactional save integration and targeted
  repair cannot be enabled without bypassing missing shared dependencies.
  Use the spec's explicit classifier/read-projection rollout and retain notices.
  Do not introduce a parallel freshness database, provenance inference or repair
  subsystem. Existing mutation behavior is outside this slice and remains unsafe
  for the full preservation promise; #515 and #580 remain open.
- Firm references: supplied V1 roadmap (8 September), SDD proposal, current
  AGENTS/GUIDELINES/ARCHITECTURE/INVARIANTS and ADRs 001–004, 008–010, 017–018,
  022. The current request overrides approval-before-code sequencing only.
- Starting point: #581 `8d077980`, authored by Kemal Sokolovic. Adapt its pure
  classify-before-write approach, read/save separation and fixture scenarios.
  Do not copy its index association, blanket HTML normalization, post-commit
  best-effort write or unguarded repair. Existing PR #581 is unchanged.

## Pre-edit acceptance map

Every criterion is mapped before implementation. Status/evidence will be updated
following verification; rows below describe current behavior and intended checks.

| AC | Current behavior / required change | Concrete verification and initial disposition |
|---|---|---|
| 1 | No save propagation. Build a pure candidate patcher; activation depends on shared protection/admission. | Escaped text replacement and zero provider calls in pure tests; stored/preview sync blocked. |
| 2 | #581 normalizes all HTML. Replace only proven text spans, retaining all other bytes. | Exact HTML/image/script/neighbor equality, frozen inputs. |
| 3 | Existing validator rewrites/normalizes accepted HTML. Reuse optional-text rules, protect ambiguous markup. | Entities, placeholders, blank markers, optional IDs, nested containers/activity IDs; markup injection tests. |
| 4 | Render arrays expose positional indices. Use exact HTML section identity and verified page ownership only. | Reorder/sparse/duplicate/cross-page/stale-index fixtures. |
| 5 | GET has no synchronization projection. Classify structural/missing/malformed output read-only. | API + pure drift fixtures and unchanged stored HTML. |
| 6 | No rendering provenance. Never infer generated origin from matching text or timestamps. | Matching legacy output remains unknown; manual divergence preserved with explicit proof fixtures. |
| 7 | Atomic endpoint exists but invalidation is destructive and admission incomplete. | Blocked pending shared mechanisms; no new mutation path. |
| 8 | Existing save succeeds but reports no drift. | Blocked response integration; GET after save can report drift independently. |
| 9 | Atomic endpoint writes submitted nodes even when identical. | Blocked save deduplication; candidate idempotency tested independently. |
| 10 | Pipeline-running guard only; no expected versions or shared task/CLI admission. | Blocked, no new save/repair path. |
| 11 | GET selects current pointers but has no drift. Add read-only snapshot projection. | Real SQLite reopen/imported copy/restored pointers; all node rows/pointers/media unchanged by GET. |
| 12 | Existing tasks cannot establish trusted correspondence. Do not clear on task events. | UI retains server notice across task/refetch outcomes; full repair lifecycle blocked. |
| 13 | Shared protection/mode/cache policies absent. | Blocked; no repair action offered. |
| 14 | Fixed-layout semantic editor has no persistent boundary notice. | API fixed-layout fixture, accessible Studio explanation/link, no sync rerender. |
| 15 | Saves clear book-wide downstream nodes. | Blocked on SPEC-0001/0002; read-only slice must preserve all rows/assets. |
| 16 | Positional consumers risk retired identity reuse. Classifier never redirects by index. | Restored/retired/successor ID fixtures; notices link to page review only. |
| 17 | Existing saves invalidate page/preview queries. Add server-driven accessible notices in both editors. | Studio render/navigation/refetch tests, five-locale extraction/lint; full save contract blocked. |
| 18 | Spec-only metadata. Document actual slice and limits without checking unsupported ACs. | Final diff/spec/INDEX/PR description review; no approval/release/issue closure claim. |

## Verification results

Initial code reviewed at `1534791a`; a subsequent confidence pass is documented
below. The spec checkboxes remain unchecked because this is a partial rollout
and human review remains pending.

| Check | Result |
|---|---|
| Untouched develop baseline, `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run` | 277 files / 3,604 tests passed. The first attempt using system Git had Xcode-license failures; the explicit Command Line Tools Git run passed. |
| Focused classifier / SQLite GET / notices / existing Sectioning editor tests | 4 files / 54 tests passed after review fixes. Includes 36 pure classifier cases and 10 real-storage read cases. |
| `pnpm typecheck` | Passed. |
| `pnpm build` | Passed (TypeScript and runtime assets). |
| `pnpm lint` | Passed, 0 errors; 8 unused-disable warnings in unchanged files. |
| `pnpm --filter @adt/studio extract` | Five locales, 3,616 messages, zero missing translations. |
| `pnpm --filter @adt/studio compile --strict` | Passed. |
| `pnpm --filter @adt/studio build` | Passed; bundle-size/plugin-timing warnings. |
| API and Electron API bundle scripts | Passed, including required WASM copies. Not a packaged desktop launch test. |
| Full suite on initial slice | 280 files / 3,654 tests passed: `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test --maxWorkers=4 --testTimeout=60000` (345.92 seconds). |
| Isolated packaging regression tests with normal timeout | 12/12 passed with the normal 20-second API test timeout. |
| `pnpm run lint:invariants` | Unavailable: the repository has no such script. The new invariant runs through the named tests under `pnpm test`. |
| Docker image check | Not run: local Docker daemon unavailable (confirmed outside sandbox). |
| Hosted CI / signed installers / packaged desktop launch / release verification | Not run; implementation remains local and unpushed. |

The earlier unrestricted full run was stopped after timing failures in existing
packaging/part tests. A subsequent four-worker run also hit the existing packaging
test's 20-second timeout. These are recorded as failed attempts, not claimed as
pre-existing defects: untouched develop passed. The final full command uses an
explicit 60-second test limit to accommodate concurrent local verification load.

## Acceptance evidence by criterion

“Passed” below is bounded to this read-only rollout. It does not mean the full
specification or its save/repair integration has passed.

| AC | Status | Evidence / remaining gap |
|---|---|---|
| 1 | Blocked | Pure candidate replaces escaped text with no fetch/provider calls. Stored and preview propagation on Save awaits shared protection, writer admission and scoped invalidation. |
| 2 | Passed (pure slice) | Exact byte comparisons preserve unrelated sparse/reordered renderings, layout attributes, image URLs and custom scripts; GET compares all tables/files before/after. No production patch publication yet. |
| 3 | Passed (pure slice) | Browser-verified escaped text (including CR/CRLF and empty leaves), unique blank-marker/hint mapping, unchanged optional/container/activity IDs. Unsupported nested/custom or special parsing contexts are retained, not flattened. |
| 4 | Passed | Stable HTML section identity plus unique graph ownership; stale sectionIndex deliberately ignored. Sparse/reordered, missing, duplicate and foreign ownership tests. |
| 5 | Passed (read/pure slice) | Missing/invalid/structural output retains HTML with stable affected identities; invalid legacy source produces an explicit unverified diagnostic. Save-response integration remains blocked. |
| 6 | Passed (preservation slice) | Missing/stale/duplicate proof and even matching legacy text remain unknown. Manual divergence yields no partial section patch. Notices require review; shared review-resolution actions are not implemented. |
| 7 | Blocked | No transactional save activation without shared writer/protection/freshness contracts. Existing save's destructive invalidation is unchanged. |
| 8 | Blocked | Existing semantic Save is unchanged; subsequent GET reports drift, but Save does not yet return the new authoritative result. |
| 9 | Blocked | Candidate comparison is idempotent against committed matching inputs, including cleared text; save deduplication not integrated. |
| 10 | Blocked | Expected-version save conflicts and shared task/CLI admission unavailable. No new write endpoint or repair action bypasses them. |
| 11 | Passed (read slice) | Real SQLite current pointers, restored versions, fresh route/storage instances and copied book directory return reproducible drift. All tables and file hashes unchanged by GET. Actual archive-import UI not exercised. |
| 12 | Blocked | Notice is derived only from GET and survives refetch/new rendering versions. No task-completion heuristic clears it. Full queued/failed/cancelled repair workflow awaits shared dependencies. |
| 13 | Blocked | No targeted repair offered; protection/mode/force-fresh integration unimplemented. |
| 14 | Passed (notice slice) | Fixed-layout API fixture and accessible notice/link test. Message says semantic Sectioning edits do not update positioned pages; no sync-rerender action. Product scope sign-off and real fixed-layout acceptance remain pending. |
| 15 | Blocked | GET preserves all rows, histories and media. Existing Save/repair does not integrate scoped invalidation; #580 gap 3 remains open. |
| 16 | Passed (read/pure slice) | Retired ID and replacement at the same index reported independently; no mutation action maps a retired ID to a successor. Navigation is page review only. |
| 17 | Blocked (partial evidence) | Accessible notices and all five locales implemented; live Sectioning → Storyboard → reload checked. Existing save/task query invalidation reused. New committed-pair Save response/refresh contract remains blocked. |
| 18 | Passed (reporting) | Spec stays in review, no approvers/AC checkboxes fabricated; implementation and issue closure explicitly partial. Fixed-layout scope remains a pending product decision. |

## Manual and representative-book checks

On a disposable copy of the local `momograde1` reflowable book, four page GETs
(pg001/005/010/015) returned unknown-origin correspondence and left the database
SHA-256 unchanged. Browser checks on pg005 displayed the Sectioning notice,
opened Storyboard via its link, loaded the existing text preview and retained the
notice after reload, with no page JavaScript errors. Screenshots were inspected.
The preview had missing image thumbnails; image/export fidelity was not validated.
The source book was not modified. This is a reading-page check, not the spec's
complete real activity-page plus fixed-layout acceptance corpus.

Local run logs, source PR snapshots and screenshots are in the adjacent workspace
folder `tmp/spec-0012-evidence/` (outside this checkout and not committed book data).
Real activity-book and fixed-layout-book export acceptance, package comparison,
transport-level rerender/cache counts, cancellation/recovery and concurrent-writer
publication tests remain not-run because those write paths are not activated.

## Follow-up confidence pass (25 September 2026)

Added 25 regression cases: 19 classifier cases and six real SQLite/filesystem
cases. Ten newly introduced classifier assertions failed before the fixes:
literal CR/CRLF changed when parsed by a browser, NUL disappeared, unsupported
template/select/foreign-content contexts were treated as ordinary text, and
reused blank identities were accepted despite their ambiguous correspondence.
Two further assertions exposed an empty-leaf problem: clearing text removed the
text node, so repeat classification incorrectly reported drift and a later edit
could not refill it. Empty leaves now compare correctly and insert before their
explicit closing tag without rewriting tag bytes. Browser-parser round-trip
cases also verify idempotency for the resulting committed source/render pair.

The classifier now escapes carriage returns as numeric references and retains
unrepresentable NUL text, unsupported parsing contexts (including ancestors
outside the section wrapper), and ambiguous blank mappings without changing
their stored HTML. The checks remain conservative; they do not enable a general
HTML repair engine or production patch publication. Expected source-version
proof rejection is now explicit alongside the existing rendering-version check.

Real-storage tests additionally cover duplicate neighboring ownership, invalid
neighbor schema/JSON, restored neighboring current pointers, missing-page error
cleanup and contention. The competing connection was blocked by the repository's
WASM SQLite while the read transaction was open; after rollback/close, the retry
succeeded and a new GET saw the new versions. This verifies lock release and
coherent reads under that locking behavior, **not concurrent writer commits or
the still-unimplemented save conflict/retry contract**. The initial test assumed
concurrent commit support and failed with `database is locked`; the final test
asserts the actual runtime boundary instead of mocking it away.

- Focused command: `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run apps/api/src/routes/pages-sync.test.ts packages/pipeline/src/__tests__/sectioning-sync.test.ts apps/studio/src/components/pipeline/components/SectioningSyncNotice.test.tsx apps/studio/src/components/pipeline/stages/sectioning/SectioningPageDetail.test.tsx --maxWorkers=2`.
  Passed 79 tests / four files (55 classifier, 16 real-storage, eight Studio).
- Independent headless Chromium 145.0.7632.6 check: ten candidate HTML cases
  preserved exact DOM text and created no injected child elements, including
  Unicode, CR/CRLF, literal entities and markup-looking text. The initial browser
  launch hit the macOS sandbox restriction; the permitted outside-sandbox run
  passed. Script and results: adjacent `tmp/spec-0012-evidence/verify-projection-browser.mjs`
  and `confidence-browser.log`.
- Typecheck passed; lint passed with the same eight unchanged-file warnings.
  API and Electron API bundles also passed again on the updated classifier.
  No Studio strings or locale catalogs changed in this pass.
- Final unchanged-code run: `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test --maxWorkers=4 --testTimeout=60000`
  passed **280 files / 3,679 tests** in 182.67 seconds, including the pretest
  build. This supersedes the initial slice's full-suite count above. The full
  suite was repeated after the final empty-leaf fix; no source changes were made
  during this final run. `git diff --check` also passed.

This strengthens the bounded evidence for AC-2–6, AC-9's pure idempotency portion,
and AC-11. All acceptance statuses
and blocked integration requirements in the matrix above remain unchanged.

## Outstanding decisions and delivery

- Reconcile SPEC-0001/0002's shared provenance, unknown/manual protection and scoped
  invalidation before enabling automatic propagation or repair. The proof input is
  ephemeral and has no production persistence adapter in this slice.
- Ratify fixed-layout explanation/support routing as the B1 scope; no positioned
  text synchronization is claimed.
- #884 mode/writer work has since acquired committed local implementation; see
  the independent review for the exact observation and focused working-tree test
  limits. It is not integrated into this branch. Do not import another task's
  unfinished changes or infer that joint save/task/CLI behavior has passed.
- Rechecked #888/#879/#880/#884 remote heads: unchanged from preparation. No push
  or merge performed. The local target branch is rebased onto develop; retain the
  published PR's original base until the rebased head is pushed, so the remote
  diff does not temporarily include unrelated inherited specs. Any later rewrite
  must recheck the remote head and use its exact lease.
- #581 is unchanged and attributed above. Source issues are informational and
  remain open. Review remains requested from `elasticsounds`.
