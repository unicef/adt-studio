# SPEC-0002 implementation evidence

## Scope and dependency audit — 2026-10-10

This is a partial implementation in PR #880, on `spec/736-manual-edit-preservation`.
The owner authorized implementation before approval and local commits without a
push. SPEC-0002 remains draft; human review is pending. The implementation order
is shared schemas/helpers, translation, TOC, quizzes, then Sectioning, as coherent
commits in the same PR.

Published target: `d2348233838ee635f2ef727984fb93e2d8289306`. Refreshed develop:
`ef31494d`. Published SPEC-0001/#879: `a1fc11a2`, four documentation files only.
The dependency advanced during implementation: its first local foundation commit
`7d974c28` now supplies writer admission, immutable audio storage and shared
`OutputSource`/`OutputMetadata`. This branch is based on that exact committed
prerequisite; no uncommitted dependency drafts were copied. SPEC-0002 reuses its
authorship schema, with a source-only projection for entities outside freshness.
Its spec/index/ADR-024 remain inherited dependency work, not changes claimed here.

The dependency is **not behaviorally complete**: `stages.ts` still retires IDs and
calls `clearNodesByType` before generation, and saves/restores are not fully
integrated with its shared mechanisms. The real-route probe remains the gate.
The target was first isolated on develop, then rebased onto `7d974c28` when it
became available. `backup/spec-0002-published-20261010` retains the published head;
`backup/spec-0002-slice-20261010` retains the tested develop-based slice. Compare
this PR's own changes against `7d974c28`. The remote base can remain SPEC-0001's
branch; coordinated publication must check both remote heads first.

The source issues #736 and #144, all their comments, #880's discussion and empty
inline-review list, and #879's current discussion were read. No separate existing
implementation PR is named in the target block. A current search for #736 and
manual preservation found the merged #737, which only addresses Storyboard stage
invalidation, not pre-run preservation. Its existing behavior is reused, not
duplicated. The identity dependencies #784, #785, #786 and #787 are merged into
develop. Existing glossary merge behavior (`packages/pipeline/src/glossary.ts`)
is the design precedent for the shared helper, adapted to preserve unknown
authorship and exact stable identities; the glossary implementation is unchanged.

The roadmap and SDD references in `Downloads/adt studio proposal` prioritize
surviving manual edits, version history, stable identity and release acceptance.
Current SPEC-0001/ADR-024 refine their earlier section-level freshness proposal.
The user's authorization overrides approval-before-implementation sequencing,
but not the runtime dependency or pending human approval.

### Blocking runtime evidence

On develop and the exact dependency commit `7d974c28`, `makeBeforeRun` in
`apps/api/src/routes/stages.ts` retires section IDs
and calls `clearNodesByType` before the worker runs. The latter deletes all
versions for most node types. `saveStoryboardNode` also calls the destructive
`clearCaptionData`. SPEC-0001's non-destructive preparation and complete
publication/freshness integration are absent; initial admission/storage
primitives alone do not suffice. A merge helper cannot recover erased input or
history, and a running-step check alone cannot guard queued work or atomic publication.

The only dependency-free rollout slice documented by SPEC-0002 is slice 1:
optional stored authorship schemas and pure helpers. Behavioral slices 2–5 are
blocked. This PR must not introduce a second freshness/admission subsystem or
advertise end-to-end preservation before the shared foundation exists.

## Acceptance map recorded before application edits

The current-behavior column records the initial develop `ef31494d` source audit,
not the old spec's line numbers or completion of the newer dependency commit.
The verification column is the completion requirement; it is not a claim that
the check has run. Results follow below.

| AC | Current behavior | Required change | Concrete verification |
|---|---|---|---|
| 1 | Translation PUT validates only id/text; no authorship or version guard | Guarded server-side per-entry comparison and stamp | Real PUT: changed/new versus untouched/forged source; version increment |
| 2 | `runTranslateStep` submits every fixed window, then replaces the language node | Shared freshness selection plus protected merge; stable full-list windows | HTTP reruns and stubbed transport/cache/log accounting; see amendment in spec |
| 3 | Quiz PUT uses `saveQuizOutput(edit)` without authorship comparison | Resolve stable IDs, guard version, stamp changed/new quiz content | PUT with existing/new/legacy IDs, no-op and conflicting writers |
| 4 | `saveQuizOutput(replace)` removes all IDs; no-page result is empty | Preserve protected quizzes/IDs; allocate only new generated quizzes | Eligible/no-eligible pages; ordering, catalog/audio references and explicit reading order |
| 5 | TOC PUT and worker store unstamped whole document | Server manual stamp and generated AI stamp | Real PUT/worker/read with untrusted source ignored |
| 6 | TOC pre-run clear deletes history; generic reset dialog | Named protected-document confirmation and safe publication | Confirm/cancel/fail; current and history read; UI check |
| 7 | `saveStoryboardNode` persists structural results without authorship | Guard/stamp both affected page records; AI stamp in worker | PUT, clone, split, merge, cross-page merge, delete, AI edit |
| 8 | Sectioning pre-run retirement and clear precede model work | Ordinary skip of manual/unknown pages before any mutation | HTTP run: zero calls/writes/retirement for protected pages |
| 9 | Own-stage and upstream HTTP preparation deletes protected data/history | SPEC-0001 foundation, then all six entity integrations | Save → real run route → read/history → preview/export, both run scopes |
| 10 | Four views lack authorship badges | Existing badge pattern and five-locale strings | Component/Studio checks, extraction and lint |
| 11 | Four schemas lack authorship; legacy data can be regenerated | Preserve absent source without migration; shared legacy warning | Schema compatibility plus HTTP run/missing-output and warning checks |
| 12 | Restore reads stored JSON; downstream clearing can destroy history | Preserve stored tags plus shared guarded restore/publication | Restore AI/manual/unknown, rerun, cancellation/concurrent restore |
| 13 | Structural operations write pages but no page protection | Protect empty/deleted/source and destination records | Real delete/delete-last/cross-page merge; rerun and content occurrence count |
| 14 | Translation wholesale replacement; TOC retirement parses/re-saves document | Active membership reconciliation retaining history and authorship | Remove source/retire section; read active, history and restore |
| 15 | Run body has no protected replacement scope | Off-by-default confirmation naming pages and captured versions | Reopen dialog, ordinary call, confirmed replacement, changed scope/race |
| 16 | Section retirement precedes replacement success | Per-unit atomic publication and shared admission; fresh quiz IDs | Inject failure/cancel before publication; inspect current/history/assets/IDs |
| 17 | Preview/export read active output already erased by preparation | Surviving active versions through full chain | Real preview and web package contents, including saved page sections |
| 18 | Translation/TOC saves are unguarded; quiz/page busy guards lack baseVersion | Required baseVersion plus shared admission; retain/reapply drafts | Missing/stale version, queued/active worker, concurrent saves/restores and UI conflict |
| 19 | Separate DAG writers save all four nodes without AI stamps | Stamp newly generated outputs at DAG persistence boundaries | Execute DAG with stubbed provider and inspect persisted four node types; no CLI preservation claim |

## Delivered slice

- SPEC-0001's `OutputSource` / `OutputMetadata` already provide translation
  authorship. `AuthoredContent` is a source-only projection of that shared schema
  for individual quizzes, whole page sectioning records and the whole TOC. No
  duplicate source enum, migration or implicit AI default.
- `stampManualEdits` ignores client source, compares by stable identity, stamps
  changed/new content and preserves unchanged authorship. It requires the caller
  to establish admission and a current base version first; it is not a lock or
  version check.
- `mergePreservingManual` retains both manual and unknown records wholesale,
  including metadata and IDs, and stamps trusted generated replacements AI.
  Duplicate or missing identities throw. Source-membership filtering,
  current/unselected AI reuse, quiz placement, allocation and atomic publication
  remain the integrating caller's responsibilities. It is not wired into runners.
- Stored schemas are also used by existing edit routes. Their input projections
  continue stripping caller authorship (including nested Storyboard sectioning),
  preventing the schema addition from making client-provided tags authoritative.
  This does not implement guarded saves: current routes still do not stamp manual
  edits or satisfy `baseVersion`/draft-conflict requirements.
- The existing quiz/audio regression reads the new audio through the persisted
  manifest, matching SPEC-0001's immutable asset contract. It still checks the
  generated bytes and that the old manual recording survives generation and
  restore; it no longer assumes the generated filename equals its text ID.
- The spec corrects absent provenance to protected/unknown and explicitly proposes
  the AC-2 ordinary-selection versus controlled-cache-test reconciliation. No
  approval or runtime-cost guarantee is claimed. The index still says draft.

## Verification results

The develop-based slice passed 293 files / 3,805 tests before rebasing. The final
checks below are repeated on the exact local dependency `7d974c28` plus this
slice, unless explicitly identified as a baseline or compatibility check.

| Check | Result and scope |
|---|---|
| Baseline `pnpm build` | Passed before application edits; application source identical to develop `ef31494d` |
| `pnpm exec vitest run packages/types/src/__tests__/content-authorship.test.ts packages/pipeline/src/__tests__/manual-edits.test.ts apps/api/src/routes/authorship-boundaries.test.ts` | Passed: 3 files, 35 tests (18 schema, 15 helper, 2 real HTTP/SQLite boundary tests covering five edit surfaces each) |
| `pnpm test` | Final rerun passed: 296 files, 3,822 tests, including pretest build; 151.71 seconds. Initial dependency-based failure and verified baseline are described below |
| `pnpm typecheck` | Passed; repeated after the quiz/audio test adaptation |
| `pnpm --filter @adt/runtime typecheck` | Passed |
| `pnpm lint` | Passed: zero errors, eight warnings; no warning cleanup included |
| `pnpm build` | Passed; runtime assets build included; no installer or Docker image built |
| `pnpm --filter @adt/studio extract` | Passed: 3,622 messages per locale, zero missing in es/fr/pt-BR/sq; catalogs unchanged |
| `pnpm --filter @adt/studio compile --strict` | Passed; no changed Studio strings in this slice |
| Pre-change schema compatibility | Passed for four record kinds with AI/manual tags, using the actual pre-edit compiled schemas from develop; legacy reads remain untagged. This verifies parsing, not a complete old-application/downgrade workflow |
| `node scripts/probes/spec-0002-foundation.mjs` | Failed with exit 1 on the develop baseline, the develop-based slice and the final dependency-based slice; not a passing acceptance test |
| `git diff --check` | Passed |
| Invariant checks | Available identity, storage and pipeline tests ran in the full suite. `lint:invariants` and `acceptance` scripts are absent; no aggregate invariant/harness pass claimed |
| UI, representative Mathematics STD 5, provider/cost measurements | Not run: runtime integration is blocked; pure helper tests cannot establish these claims |
| Desktop/Docker/release and hosted CI | Not run; nothing pushed, and development tests do not establish release verification |

The first full test run after the dependency rebase had 3,821 passes and one
failure: `quiz-identity-regressions.test.ts` tried to read the old derived filename
`qz002_que.mp3`. A clean disposable checkout of **exactly `7d974c28`**, without
SPEC-0002 changes, reproduced the same ENOENT failure with the focused test. This
establishes the dependency baseline rather than assuming the failure is unrelated.
The assertion now follows the saved manifest and retains the manual-byte and
restore checks. That focused test passed after adaptation; the full rerun is
reported in the table above. No other PR or working draft was modified.

### Reproducible HTTP dependency failure

After `pnpm build`, run `node scripts/probes/spec-0002-foundation.mjs`.
It creates and removes disposable books, makes real translation/TOC PUT requests,
uses the real HTTP run route and `StageService`, then reads real SQLite current
and history records. Only the worker is replaced, with a failure before any model
or publication. No credentials or paid calls are used.

Both documents have two retained versions before the run. The results are:

| Requested run | Translation versions before → after | TOC versions before → after |
|---|---|---|
| Translate → Translate | 2 → 0 | 2 → 2 |
| TOC → TOC | 2 → 0 | 2 → 0 |
| Sectioning → Sectioning | 2 → 0 | 2 → 0 |

The worker-entry snapshots already lack the affected rows. Failure leaves them
missing. The saved edits have absent provenance because current PUTs do not stamp
it; these are explicitly protected by Decision 4/AC-11. The PUTs also succeed
without `baseVersion`, demonstrating that part of AC-18 is not satisfied. This
probe deliberately fails instead of encoding destructive behavior as a passing
regression. It stops short of generation, preview and export and cannot certify
AC-9/17. Update its saves to use required base versions when that contract lands.

### AC-to-evidence result matrix

**No complete numbered AC is passed by this dependency-free slice.** Partial
helper/schema evidence below is not behavioral acceptance. Failed marks an
observed violated requirement; Blocked marks integration requiring the missing
foundation; Not run identifies deliberately unimplemented/unchecked surfaces.

| AC | Status | Evidence / remaining requirement |
|---|---|---|
| 1 | Blocked | Helper stamps changed/new text and ignores forged tags; guarded PUT not integrated |
| 2 | Blocked | Protected merge tested; selector, transport/cache/cost counts and representative book not run; amendment awaits review |
| 3 | Blocked | Quiz-key comparison and position-only no-op tested; PUT stamping/version guard absent |
| 4 | Blocked | Helper keeps protected IDs including empty generated set; full runner/allocation/order/catalog/audio chain absent |
| 5 | Blocked | Whole-TOC stored schema and untrusted input boundary tested; server/worker stamping absent |
| 6 | Blocked | No replacement UI/publication; own-stage probe destroys TOC history |
| 7 | Blocked | Page-level/empty-page schema tested; structural stamping and guarded writes absent |
| 8 | Blocked | No protected-page runner skip or deferred retirement integration |
| 9 | Failed | Real PUT → run-route/real-service → storage/history loses corrections before worker entry; full six-entity chain not reached |
| 10 | Not run | No badges/UI changes in slice 1; extraction/lint passes do not prove this AC |
| 11 | Blocked | Unknown retained by helper; actual older schemas read new records; legacy warnings and ordinary-run protection absent |
| 12 | Blocked | Schema JSON round trips retain tags; restore → rerun and concurrent restore not integrated/tested |
| 13 | Blocked | Empty-page metadata supported; deletion/cross-page operations and rerun preservation not integrated |
| 14 | Blocked | Helper permits caller-filtered active membership without mutating prior input; no source-removal/history/restore integration |
| 15 | Blocked | No named, off-by-default protected-page replacement scope or UI |
| 16 | Blocked | No atomic replacement/cancel/identity-retirement integration; preparation already deletes history before injected failure |
| 17 | Blocked | Preview/export acceptance not run because the prerequisite survival chain fails |
| 18 | Failed | Probe PUTs without baseVersion succeed (200); no stale-write/queued-admission/draft-conflict implementation |
| 19 | Not run | DAG stamping deferred with entity slices; no CLI preservation or SPEC-0010 completion claim |

## Remaining decisions and handoff

1. Integrate and verify SPEC-0001's shared non-destructive preparation, writer
   admission, captured-input/version publication, active/history reconciliation,
   freshness/legacy review and physical-asset safeguards. A helper commit or green
   documentation CI is insufficient. Re-run the HTTP dependency probe first.
2. Reconcile the proposed AC-2 amendment in human review. Keep the original cache
   experiment as an adapter/transport test, not an ordinary-run billing promise.
3. Continue in the same PR with translation, TOC, quizzes and Sectioning, in that
   order. Reuse the shared foundation; do not merge a descendant into its ancestor.
4. Easy-read ownership and full Storyboard-rerun preservation remain explicit
   coordination gaps in #736/#144; no new owner or follow-up issue is invented.
   The integration approver and ADR confirmation remain human review items.
5. No branch was pushed or merged. Recheck both remote heads before a future
   publication, preserve the backup ref, and coordinate rebase/retargeting then.
   Request review from @elasticsounds in a tagged PR comment because GitHub cannot
   assign a PR's author as its formal reviewer. The remote description must make
   clear that this implementation is currently local and unavailable in its diff.
