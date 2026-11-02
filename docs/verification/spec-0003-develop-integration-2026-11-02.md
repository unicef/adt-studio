# SPEC-0003 develop integration — 2 November 2026

Historical integration checkpoints, local only. See the
[final audit](spec-0003-final-audit-2026-11-02.md) for the frozen-head results,
all acceptance matrices and remaining platform gates. Pending statements below
record their original checkpoint and do not replace that final assessment. No push, remote metadata/comment,
review request, merge or issue change is authorized in this round.

## Exact boundaries and strategy

- Original local and published SPEC-0003: `c71605454126c29f8f6e5dab56ee90385012b886`.
- Refreshed develop: `f2e59a0d29b13f65641f26c4f898738770d1181a`.
- SPEC-0001 squash: `c153ba7d26c2323b67236c61297999424b169ac1`, reviewed final `811d14751d6e01a8262d3e34466c1f45875b8ca1`.
- Merged approved SPEC-0002: `89a65f0677288be266ea448b231c1ca21dc30235`; production/test `afd93f61ff31432086490f70df4f335748496197`.
- Genuine old SPEC-0003 increment: `09f0d1c7..c7160545` (27 commits, 125 files). Preserve final net patch, reconcile it onto develop instead of replaying obsolete ancestor/intermediate contracts.
- Recovery refs: `backup/spec-0003-nov02-{local-head,remote-head,old-prerequisite,develop-before-fetch}`. Remote branch remains `spec/708-sectioning-mode-lifecycle`; local alias remains `spec/SPEC-0003-708-sectioning-mode-lifecycle`. Proposed remote base is develop; no remote retarget performed.

Owner untracked `docs/verification/spec-0003-stacked.md` and `tmp/` are preserved.
The unrelated primary checkout is unchanged. Full plan, source snapshots, initial
requirement/compatibility ledgers, conflict decisions and command receipts are
outside Git at `/private/tmp/spec0003-develop-integration-20261102-qxccq5e1`.

## Operative contract and scope

The amended spec retains all 26 original dispositions, 18 RACs and the October
review's nine scenarios. No persisted By Page count gate returns. Ordinary
Sectioning remains missing-only, including restored AI versions. Exact explicit
replacement resets scoped active HTML/tree versionedly before generation; failure
preserves prior semantic content and history without reactivating reset output.
Ordinary Storyboard publishes each page immediately; actual layout switches alone
require whole-window all-success publication. Coverage and package membership are
separate from attempt state, preference and usable downstream warnings.

Current shared ownership projection, source-generation tracking, draft/receipt and
consent controls must survive integration. SPEC-0002 approval remains truthful;
SPEC-0003/ADR025 are still pending. The earlier #884-before-#880 statement is dated
history, superseded by actual prerequisite merge and this integration request.
The proposed #708 amendment remains local in the amended spec; the source issue
is unchanged.

## Fresh baseline evidence

- Original c716 build passed; 74 focused tests in four files passed (47.95s).
- Exact develop f2e59 build passed.
- Exact develop Desktop typecheck reproduces the three TS2307 release-script imports
  in `release-catalog.ts` and `update-release-notes.ts`. This baseline does not make
  the check green or certify packaged GUI behavior.
- Combined-tree acceptance, independent final review and platform checks: pending.

## Explicit boundaries

SPEC-0002 D1–D6 (#1039–1044) remain deferred under owner comment6137679220 and
approval5731520149; optional1045–1048 stay separate. SPEC-0001 Note7 ratified
ownership/history/activity-ID, staged speech, classifier, bulk/projection/no-op,
oldblankID/pre-schema14 and performance995–997 limits remain. B2/automatic merge,
new fixed editor/page picker/scoped generation619, full Storyboard manual
preservation144, fifth Easy Read slice, broad CLI resume/extraction repair and
EPUB/PNLD redesign are not implemented here.

Private-book/live-provider/signed-all-platform gates and open hardened Mac /
cross-origin SCORM observations are not approved deferrals or passing checks.
Unprovable legacy locks and missing fixed input use their documented safe fallback.
No hosted CI run can certify this unpublished local candidate.

## Integration checkpoint (not final acceptance)

Semantic conflict resolution retains current reciprocal/legacy owner resolution,
identity reconciliation, source-generation input tracking, validated Settings
receipts and book/scope-bound shared confirmation. New regressions reproduced
replacement admission after changed configuration/window; the corrected receipt
also rejects queued and cross-book direct-run use. Settings requires renewed
explicit replacement after an acknowledged configuration-changing Save, while
unchanged settings retain the first frozen entity versions.

Focused integrated runs: 133/135 tests passed in the first consent sweep; the two
remaining cases were a fixture changing concurrency after taking consent and an
older broad Storyboard completion clear that conflicted with merged scoped source
tracking. The fixture now confirms its final configuration; publication retains
catalog-managed attempts and delegates source-generator invalidation to the
shared input comparison. The next sweep passed 94/95; its queued-rejection test
incorrectly expected the failed job to disappear instead of remaining inspectable.
The corrected six-case admission/queue/cross-book sweep passed. These are command
receipts, not a claim of complete acceptance. Full checks remain pending.

Independent review reproduced a live HTTP reader's mutex removed by an independent
startup process before the reader resumed. No corruption was observed. The owner
explicitly chose extension of the existing shared admission to all database readers
rather than a fail-closed-only fallback. That correction and its new crash/reader
acceptance are pending at this integration checkpoint; the amended spec records
its guarantee and mixed-version concurrency limit. No new lock subsystem is
approved. The original failure evidence is preserved outside Git.

## Shared-reader checkpoint

The authorized extension now centralizes all SQLite constructors, retains the
existing process lease through connection/statement closure, and serializes owner
publication using its existing reservation. Fifty focused tests pass; sixteen
Linux-only cases were skipped on macOS. See [the proof boundary and test evidence](spec-0003-reader-admission-2026-11-02.md). Independent frozen-head recheck, actual
HTTP/Studio visibility, full suites and packaged Linux verification remain pending.

## Independent review corrections after f6fbef65

The independent reviewer derived a separate requirement/public-entry map and traced
all production changes against the original/amended specifications and reviews.
It did not clear `f6fbef65`. Its full report is preserved in the private evidence
at `reviews/independent/f6fbef65/review.md`.

| Finding | Correction and fresh regression evidence |
| --- | --- |
| N1, per-page isolation at batch HTTP entry | Removed the batch route's all-pages semantic preflight. The shared service validates each runnable page, including positioned fixed input. Seven real-storage HTTP synchronous/task cases failed before the fix (missing, JSON-null or malformed neighbor; fixed input without semantic Sectioning), then passed. Page existence, active-run and credential admission remain. |
| N2, fixed per-page HTTP availability | Fixed orchestration yields between preparation/publication pages and propagates cancellation; pure per-page rendering and common spread width remain. Four real localhost HTTP cases pass: first generation/same-layout rerun, normal completion/cancel. Page1 GET returns its committed pair while page2 is held at the next scheduling boundary; cancel retains page1 and page2's prior pair, then targeted work succeeds. This proves cooperative page-boundary availability, not interruption inside one CPU-bound page. |
| N3, extraction errors missing localization | All six inherited extraction safety codes now use the shared Studio mapper for explicit HTTP codes and persisted/SSE prefixes. Six regressions failed before the fix; seven mapper cases now pass including unknown provider diagnostics. New text translated in all five catalogs; extraction and strict compilation pass. |
| W1, writer-discovered stale source-text publication | Replacement/publication receipt now hashes full active PageData metadata, retaining the previous extracted-text guard as well as book/config/window identity. A real SQLite edit during generation failed the regression before the fix; seven related receipt tests pass afterward. Ordinary freshness still does not hash PDF/image/audio bytes. |

The localhost test's first sandboxed attempt failed with `listen EPERM`; the
same bounded suite passed with localhost access enabled. That environment failure
is neither a product failure nor a passing run. Provider credentials were removed
and external requests blocked in both attempts. Linux writer fixtures now obtain
their coordinated-database capability through the actual opener before testing
incarnation recovery; an invented capability is not evidence of ownership.

Final focused sweep, full checks, browser/platform acceptance and bounded
independent recheck remain required before a final readiness claim.
