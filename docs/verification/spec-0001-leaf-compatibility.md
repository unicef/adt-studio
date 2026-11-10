# SPEC-0001 narrow legacy compatibility follow-up

Starting head: `d0afa178a1327cd988b486be2134299c861bae08`, base `develop`
`0b18602f8b42f4b52b4d2ccf2927635d5a4db572`, same PR #879.
The user's latest authorization adopts elasticsounds' Teams clarification.
Human specification approval remains pending. De-codable pg006 acceptance is
explicitly assigned to elasticsounds; it will not be claimed from synthetic tests.

## Requirements and verification map before editing

The preceding [gap-closure ledger](spec-0001-gap-closure-2026-10-13.md) records
the earlier seven fixes. Its historical-receipt/repair-screen approach is
superseded by this follow-up, not evidence for the new leaf-matching contract.

| AC | Current behavior and required change | Concrete verification |
|---|---|---|
| 1 | Cosmetic saves already preserve freshness; ownership recovery must not change content inputs | Cosmetic saves and no-provider tests, full suite |
| 2 | Protected French/Easy Read already preserved; recovered activity answers must keep their translations | Real-storage legacy answer/translation, existing protection suites |
| 3 | Catalog/image inventory already shared; recovered leaves must be discoverable | Catalog and image projections from legacy fixture |
| 4 | Stable IDs exist; add mutually unique leaf matching and resolve before structural changes | Reorder, clone/split/merge/delete, ambiguous/claimed/type/missing-leaf cases |
| 5 | Canonical signatures already implemented; ownership must not certify freshness or hash media | Freshness evidence before/after projection and edit; signature suites |
| 6 | Usable warned inputs already allowed; recovered legacy content remains protected | Output catalog/protection integration |
| 7 | Read-only historical recovery plus repair UI exists; replace with narrow fallback, defer repair UI | Real SQLite no-write reads, versioned edits, retained history/answers/translations |
| 8 | Current output/cache reuse already implemented; fallback must not scan historical media or call providers | Resolver without history/media access; recording-transport and full suites |
| 9 | Shared writer/version admission exists; use pre-edit ownership snapshot for every mutation path | Structural/assistant/rerender tests; ambiguity and changed-version rejection |
| 10 | Immutable physical publication already implemented; compatibility must retain referenced content | Existing failure/cancellation/filesystem suites |
| 11 | Asset restore already implemented; prior legacy versions remain restorable | History restore plus existing asset/packaging suites |
| 12 | Owned legacy content is usable; add qualifying leaf-only activities to Preview/export | Real Preview and packaged output with manual answer translations; unresolved disclosure |
| 13 | Requested-language Core TTS fallback already implemented | Existing preparation/fallback runner suites |
| 14 | Retry/cache distinction already implemented | Existing actual transport-call count suites |
| 15 | Inline output review already implemented; remove out-of-scope ownership repair controls | Studio review tests, extraction and five-locale compilation |
| 16 | Skip/prune/restore already implemented; ownership must not reactivate excluded sections | Pruned legacy projection/restore tests and existing runner suites |

## Accepted compatibility assumption

When both ownership declarations are absent, match only same-page, same-type,
unclaimed source sections with at least one content leaf and every leaf's exact
data ID present in the HTML. Ignore synthetic containers. Require uniqueness
in both directions, considering all qualifying pairs before assigning anything.
Contradictory explicit ownership is never repaired by this fallback. Unresolved
content/history is retained with disclosure. Fixed-layout compatibility stays.

This is a compatibility assumption, not historical proof: moving an entire
content tree can yield a misleading match. The reviewer explicitly accepted this
limitation for the smaller fix. Historical reconstruction, migration tracking
and an ownership repair screen are deferred. Resolving an owner neither certifies
freshness nor launches generation. Successful edits persist ownership in a new
entity version; reading a book never persists the projection.

## Results

Runtime checkpoint: `40f56eba167b5cda0c65e10abf41d2296134f0a2`.
Subsequent changes in this follow-up record evidence only. The original reviewer's
contributions and the preceding seven fixes remain on the branch; no descendant
was merged into its ancestor and no other PR was modified.

### Implementation and independent review

- The shared resolver builds all candidate edges before choosing an owner. An
  ambiguous competitor prevents an otherwise unique assignment. Actual HTML
  attributes count; comments, scripts and synthetic container identities do not.
  Contradictory explicit claims reserve both IDs rather than permitting takeover.
- Preview/export, reading order, catalog, editor, assistant, mirror and rerender
  consumers share this resolver. Editor indices are aligned to current source
  identities, while read projections retain the existing rendered ordering.
- Structural writes resolve against the pre-edit snapshot and persist ownership
  in the same transaction as the successful source edit. Rollback restores both.
  Queued AI edits capture the stable owner and source/rendering versions before
  provider work and reject changed snapshots before publication.
- Historical receipt scanning and the ownership repair API/UI are removed.
  Existing development-era review metadata is preserved but cannot override
  contradictory ownership. Packaging format 11 invalidates cached bundles that
  omitted newly recoverable activities.
- New creation/update stamping, old fixed-layout compatibility, copied-ID
  rejection and correction retry remain covered. This patch adds no media reads,
  media-content hashing, provider calls on Save, or separate admission mechanism.

Independent review found real missed consumers and a reordered-index defect:
the editor addressed section B at index 0 while an assistant could still address
A. Those findings were fixed before the final run. The review also checked queued
AI publication and the structured activity conversion routes. Its final result
reported no remaining must-fix finding, with 159 tests in seven files plus three
queued-AI tests (162 total). Separate real SQLite and compiled API/tool probes
confirmed matching editor/assistant targets, retained neighboring HTML and manual
answers/translations, and version-free ownership reads. No actual De-codable
fixture or paid-provider verification is inferred from those probes.

### Commands and acceptance

Commands used Node 24.13.0 and, where needed,
`DEVELOPER_DIR=/Library/Developer/CommandLineTools`.

| Check | Result |
|---|---|
| `pnpm test` (includes the root build) | **Passed: 333 files / 4,149 tests** on final runtime |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed |
| `pnpm lint` | Passed: zero errors, eight unchanged unused-disable warnings, also recorded in the preceding baseline |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio exec lingui compile --strict` | Passed: 3,731 messages, no missing translations in all five locales |
| API bundle and Studio production build | Passed |
| `pnpm --filter @adt/desktop build:unpack` | Passed: macOS arm64, ad hoc signing; notarization skipped |
| API loaded from the actual unpacked app's Resources directory | Passed: HTTP 200, copied book, 230 outputs and run revision |
| Current bundles in isolated Docker runtime | Passed: four worked examples, retained editors, representative Preview, stale-save 409, inline review, real export and restart |
| Synthetic legacy activity browser/API/storage flow | Passed: reordered editor target, both activities in Preview, clone without rerender, unchanged neighboring HTML, manual French answers and original rendering version retained; no generation requests or repair UI |
| Export ZIP inspection | Passed: 76 entries, four pages, retained French display/speech text and empty disabled-speech audio manifests |
| `git diff --check` | Passed |
| Standalone invariant command | **Not run:** `lint:invariants` is planned, not an available script; relevant invariants are checked by the suites above |
| Clean `docker build --target app -t adt-studio:spec0001-leaf-final .` | **Blocked:** Debian package signature validation failed during Playwright dependency installation; Docker filesystem measured 100% full with zero available space |
| Actual De-codable pg006 | **Not run here:** explicitly assigned to elasticsounds by the user |

Docker runtime acceptance used the existing image
`adt-studio:spec0001-review-9f7eaa14` with the current API bundle, Studio build
and assets mounted read-only, plus isolated copied/synthetic books. This is
current-code runtime evidence, not a clean combined-image build. No signature
verification was disabled and no unrelated Docker resources were deleted.
Hosted CI results for the final published SHA are reported in the review comment;
the hosted Docker job builds the API target, not the combined app target.

The four browser examples checked cosmetic Save, changed English beside protected
French, glossary/image discovery without a Storyboard edit, and retirement plus
restoration of retained corrections. Preview/export disclosure preserved output
freshness/review evidence. Retained TOC editing created a new version; Glossary
and a copied `momograde1` representative book remained visible. Restart preserved
both the full catalog projection and the legacy activity projection.

The legacy browser fixture initially lacked its Storyboard completion record;
after correcting that fixture, its final assertion also needed to follow the new
first page after cloning reordered section B. These unsuccessful harness runs
are not counted as passes. The successful replay verified A and B in packaged
Preview and exact neighboring HTML/manual translation preservation. The first
full suite had an obsolete test requiring all reordered editing to fail; it was
replaced with contradictory-owner rejection and positive reorder regressions
before the final full pass.

Read-only resolver/API probes leave entity versions unchanged. Opening Preview
can still run the existing local packaging/accessibility assessment and write its
derived assessment cache; this behavior exists at the starting head. Browser
acceptance therefore separately verified unchanged ownership, source, rendering
and translation versions, with no provider generation or freshness acceptance.
The compatibility fallback itself does not write on read.

### Final AC-to-evidence matrix

“Passed” means the implementation passed the recorded development checks, not
human spec approval or release certification. The named test files are in the
final full suite; browser checks are additional evidence.

| AC | Status | Evidence |
|---|---|---|
| AC-1 | Passed | `output-freshness.test.ts`, `catalog-freshness.test.ts`; browser example 1 leaves the complete output projection unchanged after cosmetic Save |
| AC-2 | Passed | Catalog/scoped-speech and review-preservation integration; browser example 2 retains French and unrelated captions |
| AC-3 | Passed | Text-catalog, glossary-identity and image-captioning suites; browser example 3 discovers the glossary image without changing Storyboard |
| AC-4 | Passed | `legacy-rendering-ownership.test.ts`, `rendered-ownership.integration.test.ts`, glossary identity tests; mutual ambiguity, claims, reorder, clone/split/merge/delete, pruning/restore, browser example 4 |
| AC-5 | Passed | Output-freshness/canonical-signature suites; ownership projection does not certify freshness; cosmetic/full projection equality |
| AC-6 | Passed | Catalog execution and shared-speech-source integration; usable warned inputs and per-output missing inputs retain established handling |
| AC-7 | Passed; pg006 not run | Real SQLite read/transaction rollback and versioned structural edits, review-preservation tests, legacy browser clone; unknown provenance, original HTML/answers/manual French and history retained |
| AC-8 | Passed | Recording-transport catalog/preparation/speech suites, no-op cache assertions, actual query-fetch regressions; no provider work during browser Save/review; no live billing claim |
| AC-9 | Passed | Writer admission, scoped execution, `legacy-ai-edit.test.ts`, page-edit/mirror/tool suites; pre-edit owners, queued version changes, stale Save409 and unchanged neighbors |
| AC-10 | Passed | Scoped speech/timing failure and cancellation integration plus filesystem publication suites; structural edit rollback and retained neighboring assets |
| AC-11 | Passed | Storage speech-history/asset restore and packaging suites; original legacy rendering version and referenced content retained |
| AC-12 | Passed; pg006 not run | Ownership Preview/package integration, both legacy activities in real packaged Preview, manual answers in French package data; browser disclosure and real ZIP preserve freshness/review evidence |
| AC-13 | Passed | Core TTS, catalog-preparation and shared-speech-source suites: requested-language fallback, protected manual text and complete phrase accounting |
| AC-14 | Passed | Real stubbed-transport retry/reuse tests in scoped speech and preparation suites; failed/never-attempted/checked states and matching-audio reuse |
| AC-15 | Passed | Output review/panel and retained-stage UI suites; inline Keep/count/browser disclosure; removed repair controls and all five locale catalogs checked |
| AC-16 | Passed | Catalog execution, scoped runner, writer/cancellation and pruning/restore suites; legacy recovery preserves exclusions |

The seven preliminary findings remain addressed: fresh-book admission, old custom
activities, old fixed-layout storage, duplicate initial reads, pending caption
drafts, legacy Glossary Run identity and copied new activity IDs. The previous
ledger's root/receipt/repair solution for the second item is superseded by this
accepted narrow fallback. Its other six fixes are unchanged and rerun in the
full suite. The earlier hashing/read-cost, shared Language/Speech input,
structural attempt-reset and Gemini single-item corrections are also retained.

### Completion and limits

All four slices and AC-1–16 are implemented under the documented compatibility
assumptions; this is no longer only the earlier omission-only safe slice. No known
must-fix implementation gap remains from the feedback reviewed for this follow-up.
Unresolvable content is retained with a warning under the accepted rule; we do
not fabricate an owner. The whole-tree movement ambiguity, existing explicit
Split/Merge/Delete behavior and divergent legacy Easy Read policy are documented,
not silently weakened acceptance criteria. Human review remains pending.

Final acceptance still requires elasticsounds' actual De-codable pg006 check.
The clean combined Docker build remains blocked as above. Live paid-provider
quality/billing, complete Electron GUI use, signed/notarized installers,
Windows/Linux Desktop packages and release certification were not run. Those
verification limits are separate from completion of the requested code changes.

[Machine-readable results](evidence/spec-0001-leaf-compatibility.json) record the
runtime SHA and acceptance outcomes. Local logs, scripts, screenshots and ZIP
use the `spec0001-leaf-` prefix under `/private/tmp`; they are not hosted artifacts.
