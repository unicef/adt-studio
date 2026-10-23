# SPEC-0001 compatibility gap closure — 2026-10-13

> Historical checkpoint: the subsequent [Teams follow-up](spec-0001-leaf-compatibility.md)
> supersedes this ledger's root/receipt recovery and explicit repair workflow.
> Its test results do not establish the new leaf-ID compatibility contract.

Starting head: `f9ba8db2dc7767b57e94fa908481c95ac24b6675`, base `develop`
`0b18602f8b42f4b52b4d2ccf2927635d5a4db572`, same PR #879. Human review remains
pending. This ledger supersedes the earlier AC-7/12 blocked conclusion after the
repair workflow and historical-format recovery described below. Earlier evidence
files remain historical records, not current blockers.

## Feedback and baseline

1. Fresh uploaded books: already repaired in `285f3d82`, preserving the source-PDF
   admission contributed by elasticsounds while rejecting unsafe database paths.
   Recheck the real upload/settings/run/delete lifecycle.
2. Old AI custom activities: investigate the historical producer and recover only
   provable ownership. Preserve HTML, scripts, answer keys, identities and history;
   exercise Preview/export and structural editing without a rerender.
3. v0.7.1–v0.7.3 fixed layout: cover the actual older storage shape, not just the
   current positioned-tree node. Contradictory evidence must remain guarded.
4. Initial book loading: the first observed publication receipt currently causes
   a second fetch. Establish an initial baseline while retaining run/restart and
   missed-event reconciliation, including in-flight reads.
5. Caption saves: the completion handler clears a newer editor. Retain newer
   drafts and their version guards across success, failure and background refresh.
6. Glossary Run: normalize legacy identities before generation changes order, in
   the shared API/CLI path. The first catalog owner keeps its outputs; later
   collisions receive unused IDs before matching generated terms.
7. New custom activity: server-assigned section ownership must prevent copied
   owner attributes from being published, with local activity keys preserved.
   Implementation decision after script inspection: reject the copied ID without
   writes, then accept a corrected retry. Arbitrary script rewriting is unsafe.

## Acceptance mapping before edits

| AC | Baseline and required work | Verification |
|---|---|---|
| 1 | Existing cosmetic signatures; compatibility must not alter content | Cosmetic/source suites; read projections produce no writes/provider calls |
| 2 | Existing protected translations/Easy Read; retain active legacy owners | Protected output and scoped generation suites |
| 3 | Existing catalog/image discovery | Glossary collision + catalog integration |
| 4 | Ownership and legacy glossary gaps | Historical format, reorder, duplicate, split, merge, delete, ID collision and restore tests with real storage |
| 5 | Existing effective-input signatures | Signature suites; no media-content hashing in new paths |
| 6 | Existing usable warned inputs | Warned input/Core TTS suites; recovered content stays eligible |
| 7 | Legacy omission and unresolved conflicting-copy workflow | Read-only recovery plus guarded repair/review; history/provenance retained, stale requests rejected |
| 8 | Existing call cache; duplicate status loads | Count actual query fetches; existing recording-transport tests |
| 9 | Existing writer admission/publication guards; caption race | Mounted pending-save edits, failure and conflict; writer/version integration |
| 10 | Existing immutable asset publication | Filesystem cancellation/failure suites; legacy scripts/answers/assets unchanged |
| 11 | Existing physical restore | History/assets suites and compatibility restoration |
| 12 | Recoverable legacy output omitted | Actual Preview/export using historical fixtures; ambiguous ownership repair; disclosures remain read-only |
| 13 | Existing requested-language fallback | Shared source/fallback failure suites |
| 14 | Existing retry/checked fallback policy | Recording transport reuse/retry suite |
| 15 | Existing inline review; conflict/repair usability | Mounted review and caption tests, representative UI flows |
| 16 | Existing skip/prune/cancel policy | Scoped execution and retained-output suites |

## Ownership and preservation policy

Rendered HTML has an explicit owner or requires independently verifiable legacy
evidence. Never assign a section by its current array index or moved leaf IDs.
Unknown authorship remains protected. Read projections do not rewrite stored
entities, flatten custom activities or change answer keys. A modifying operation
creates a new version under the existing writer admission and version checks.
Glossary identity migration must precede both editing and regeneration; it cannot
depend on opening a particular Studio view first. New drafts are separate from
the submitted save snapshot and must survive its completion.

## Why AC-7 and AC-12 were previously incomplete

We treated retention of raw bytes as sufficient preservation even when the user
could not use the retained rendering. The omission fallback avoided attaching
manual answers to a guessed owner, but it lacked a repair workflow. Earlier
fixtures also represented only the dedicated fixed-layout source node and newly
stamped custom HTML. They missed the old positioned `page-sectioning` producer,
custom root IDs, and the later server-allocated IDs recorded only in tool receipts.
That was an implementation and verification gap, not a missing user permission.

The earlier Easy Read authority concern is a documented compatibility decision:
first manual, then first protected, then first retained copy; keep all raw copies,
warn on divergence, disallow Keep for conflicts, and require an edit or explicit
replacement bound to every copy. The user delegated this choice. Its human spec
review remains pending; that review gate is distinct from an unimplemented path.

## Seven findings and implemented behavior

| Feedback | Resolution | Regression / acceptance evidence |
|---|---|---|
| P1 new books | The prior `285f3d82` fix is retained: safe PDF-only admission before the first DB exists, while unsafe DB paths fail closed | `stage-service.test.ts` fresh-book admission, queued deletion, invalid PDF and DB-alias tests; real upload/settings/delete/stale-run walkthrough |
| P1 old AI activities | Recover unique legacy roots or exact successful historical creation receipts. A receipt outranks a copied model root. Preserve HTML/scripts/answers and unlock safe structural operations | `rendered-ownership.integration.test.ts`: Preview/export, actual script execution, clone/split/merge/delete neighbors, reorder, stale/missing/conflicting/altered/truncated/assistant receipts; independent actual v0.8.1-beta.1 producer |
| P2 old fixed layout | Shared resolver recognizes the single positioned tree in either storage node; source type/viewport/placement must prove the old shape | Same integration suite; independent actual v0.7.2 and v0.7.3 producers and clone |
| P2 duplicate initial reads | An old initial publication establishes a baseline; changed revisions still cancel stale reads. Monotonic server publication age catches a run/epoch overlapping initial reads before SSE connected | `use-book-run-refresh.test.tsx`, `run-query-invalidation.test.ts`, `stage-service.test.ts`; count actual query fetches, including slow initial reads and missed events |
| P2 lost caption draft | Save completion clears only its own snapshot, preserves a newer editor/staged draft and advances only to the acknowledged write version | `PageCaptions.test.tsx`: newer draft across pending success/failure, switching captions, second staged save, background refresh |
| P2 Glossary Run IDs | Materialize unique IDs in original order before generation, including Run without an editor GET. Preserve distinct manual senses, retained pruned entries and video associations | Real SQLite `glossary-identity.integration.test.ts`, glossary and agent suites; independent baseline reproducer |
| P2 copied new activity IDs | Reject copied owner/text IDs or internal duplicate text IDs before writes; allow corrected retries and shared image IDs | `book-tools.test.ts`: current/retired IDs, no-write rejection, corrected activity, unchanged scripts/answer keys; independent selector execution |

## Explicit repair and assumptions

The inline action lists retained rendering previews, original HTML/answers and
unclaimed unique source sections. Selection is explicit and tied to the rendering
version plus source **node and version**, including across background refresh.
The API uses the existing writer admission and one transaction, changes ownership
metadata in a new version, then reconciles the catalog. It makes no provider calls
and records neither AI authorship nor a freshness approval. Restore reactivates
the untouched prior version. Contradictory HTML attributes are preserved because
custom scripts may select them; an explicit version-guarded ownership record
resolves the owner without rewriting arbitrary scripts.

Missing/invalid source data must be restored before a rendering can be linked.
This is a data-repair prerequisite, not permission to guess or silently recreate
removed content. Until linked, unresolved entries remain retained and disclosed
as omitted. Ordinary owned legacy outputs remain usable with review warnings.
Preview/export are read-only and do not introduce an approval popup.

The initial-load optimization deliberately permits one conservative refresh when
a book's last publication/service epoch occurred during the current browser
page's lifetime. It avoids unconditional duplicate loading of old idle books
without losing a publication during initial reads. Client/server wall clocks are
never compared. No zero-duplicate claim is made for this overlap boundary.

The historical v0.7.1 tag was unavailable locally. Actual v0.7.2/v0.7.3 fixed-layout
and v0.8.1-beta.1 activity producers were independently exercised; tests cover the older
positioned-tree shape. The custom producer is from `e7ea55f4f77e70c06951ede3b538a441786c3f9d`; four
relative helper imports were redirected to current source while its creation
implementation stayed unchanged. This is not blanket certification of every damaged legacy
book or every historical release.

## Verification

Final runtime: `254658e18e7123366bd5e47b9d8762ed1b45cbd0`. Implementation
commits are `0da64dde` (legacy recovery/repair/identity), `34135704`
(caption drafts/publication reconciliation), `6090011f` and `254658e1`
(inert image preview and resource admission). No history rewrite was needed.

[Machine-readable acceptance evidence](evidence/spec-0001-gap-closure-2026-10-13.json)
records the source revision, runtime results and limits.

| Check | Result |
|---|---|
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test` (includes root build) | Passed: 333 files, 4,137 tests; final inert-preview delta followed by all 33 affected UI tests and browser resource probe |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed |
| `pnpm lint` | Passed: zero errors, eight unchanged unused-disable warnings; baseline recorded in the preceding compatibility audit |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio exec lingui compile --strict` | Passed: 3,731 entries, no missing translations in any supported locale |
| API server bundle, Studio production build | Passed |
| `pnpm --filter @adt/desktop build:unpack` | Passed for final runtime, macOS arm64; actual packaged API reads its copied book and 230 outputs |
| Docker current-bundle runtime | Passed all four examples, inline Keep, concurrent stale Save409, read-only Preview/export, retained TOC/Glossary, representative book, upload/settings/delete and restart |
| Real export ZIP | Passed: 76 entries, four sections, both French text stores preserved and empty disabled-speech manifests |
| Ownership repair browser | Passed: images visible, one explicit repair write, no generation, exact HTML/scripts retained, owner restored in Preview, persists across reload/restart |
| Independent adversarial review | Historical/identity18, page/tool/repair104, fresh admission5, mounted repair6 and missed-initial-publication1 tests passed; actual Chromium resource probe permits only one contained book-image request |
| `git diff --check` | Passed |

The final preview-only resource correction was followed by the affected tests and
production build rather than disguising earlier full-suite results as an exact
later-source run. Independent acceptance is pinned to the final runtime SHA above, with no
remaining actionable blocker in the seven findings or final preview correction.
A final startup replay timed out waiting for the repair dialog; a subsequent
stable-server replay passed with no browser errors. That timeout is not counted
as a successful run or claimed to be a pre-existing defect.

Exact published-head hosted CI is reported in the PR review
comment. No hosted outcome is fabricated in this pre-publication ledger.

The first full runs found and fixed an overbroad container-ID preservation rule,
a missing selected-source-node guard and test fixtures that lacked new storage
methods or removed the active rendering they needed. Git-dependent script tests
initially hit the host Xcode license configuration; the successful full command
sets `DEVELOPER_DIR=/Library/Developer/CommandLineTools`. None of these failed runs
is represented as a pass. Source containers still receive matching new IDs;
HTML-only non-catalog wrapper aliases remain unchanged for legacy scripts.

The browser repair replay initially counted the read-only `convert-math` POST as
an ownership write; the corrected assertion records every POST and distinguishes
that preview operation from the single repair mutation. A restart replay initially
ran before server readiness and was rerun after startup. Visual inspection also
found book images were hidden by the inert preview policy; the preview now uses
the existing sanitizer, loads identified images only through the book's image API,
blocks scripts/remote resources, and retains raw HTML separately. Independent
Chromium probes additionally caught SVG navigation and a video-poster request
before iframe CSP applied. Both are fixed: navigation/resource attributes are
removed and the sanitized fragment stays in its inert owner document until
serialization, without adoption into the application document.

## AC-to-evidence matrix

Passed means development acceptance within the documented compatibility policy;
it does not mean human approval or release certification. The complete full
suite contains the established focused suites referenced below.

| AC | Status | Evidence |
|---|---|---|
| 1 | Passed | Canonical/source-save suites and live Example 1: cosmetic Save preserves outputs/signatures and makes no provider calls |
| 2 | Passed | Scoped/catalog generation and retained-content suites; live Example 2 preserves manual French and unrelated captions |
| 3 | Passed | Glossary/image inventory and collision tests; live Example 3 discovers new glossary image work without Storyboard changes |
| 4 | Passed | Stable-ID clone/prune/delete/reorder/restore, receipt precedence and actual legacy structural operations; live Example 4 |
| 5 | Passed | Canonical input/signature and Gemini transport suites; ownership signature hashes identity declarations only, no media reads |
| 6 | Passed | Warned usable inputs, shared-source/Core TTS and scoped runner suites; missing inputs block only dependent outputs |
| 7 | Passed | Protected/manual/unknown-origin review suites plus real-storage repair/restore/version/writer tests and actual inline repair UI; divergent copies preserved under the documented authority rule |
| 8 | Passed | Recording-provider reuse/retry tests and existing representative media measurements; query-boundary call counts for initial-load and publication races |
| 9 | Passed | Stale source/target/exclusion and concurrent writer/publication tests; new caption and repair races; real API stale translation save rejects409 |
| 10 | Passed | Physical publication/cancellation/failure suites; neighboring assets retained; executable legacy activity script and answer preservation |
| 11 | Passed | Physical speech-history/cache-cleanup/restore and packaging invalidation suites; source and ownership version restoration |
| 12 | Passed | Legacy/repaired Preview and real packaging integration, live export/disclosure and restart; no review evidence changes on read |
| 13 | Passed | Requested-language Core TTS fallback, manual speech, bounded preparation failures and complete phrase accounting suites |
| 14 | Passed | Real transport counts for never-attempted/failed/checked/retried preparation, unchanged fallback/audio reuse and failure preservation |
| 15 | Passed | Mounted review/count/save/repair tests; live inline Keep and repair flows; all five locale catalogs extracted and translated |
| 16 | Passed | Scope/skip/cancel/prune/exclusion/late-publication tests; retirement and explicit restoration retain history |

## Completion and verification limits

The identified AC-7/12 implementation gaps and all seven preliminary feedback
items are addressed. This implements the full SPEC-0001 behavioral scope under
the documented compatibility assumptions, rather than leaving only an omission
fallback. Human review of the spec and assumptions is still pending; INDEX stays
`in-review` and ADR-024 stays Proposed. No issue is closed and no PR is merged.

The full combined Docker image build is **blocked by this host's Docker VM disk
being full** (140GB filesystem, zero available). Current-bundle Docker runtime
acceptance is distinct and recorded separately; no unrelated Docker data was
pruned. macOS arm64 unpacked packaging/packaged API checks are not Electron GUI,
signed installer/notarization, Windows/Linux installer, paid-provider quality or
release certification. Those checks are **not run**. No standalone invariant
checker exists in this checkout; relevant invariants are exercised by the suites.
