# SPEC-0002 implementation evidence

## Scope and dependency audit — 2026-10-10

This is a partial implementation in PR #880, on `spec/736-manual-edit-preservation`.
The owner authorized implementation before approval and local commits without a
push. SPEC-0002 remains draft; human review is pending. The implementation order
is shared schemas/helpers, translation, TOC, quizzes, then Sectioning, as coherent
commits in the same PR.

Published target: `d2348233838ee635f2ef727984fb93e2d8289306`. Refreshed develop:
`ef31494d`. Published SPEC-0001/#879: `a1fc11a2`, four documentation files only.
Its local branch at `239c0a95` contains the specification rebased onto develop,
not an implementation. The target's five spec commits were replayed onto develop;
`backup/spec-0002-published-20261010` retains the original head. No inherited
SPEC-0001 implementation or ADR is claimed. Its proposed ADR-024 remains owned by
#879. Remote retargeting must accompany the later authorized push so the published
documentation stack is not temporarily misrepresented.

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

On develop, `makeBeforeRun` in `apps/api/src/routes/stages.ts` retires section IDs
and calls `clearNodesByType` before the worker runs. The latter deletes all
versions for most node types. `saveStoryboardNode` also calls the destructive
`clearCaptionData`. SPEC-0001's admission/publication/freshness foundation is
absent. A merge helper cannot recover erased input or history, and a running-step
check alone cannot guard queued work or atomic publication.

The only dependency-free rollout slice documented by SPEC-0002 is slice 1:
optional stored authorship schemas and pure helpers. Behavioral slices 2–5 are
blocked. This PR must not introduce a second freshness/admission subsystem or
advertise end-to-end preservation before the shared foundation exists.

## Acceptance map recorded before application edits

The current-behavior column is based on refreshed source, not the old spec's line
numbers. The verification column is the completion requirement; it is not a
claim that the check has run. Results follow below.

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

## Verification results

Pending execution. No numbered acceptance criterion is complete from schemas and
helpers alone. Easy-read ownership and full Storyboard-rerun preservation remain
coordination gaps; this work does not complete SPEC-0010 or CLI preservation.
