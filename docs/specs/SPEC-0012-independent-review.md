# SPEC-0012 implementation review — 25 September 2026

> Historical snapshot. The [12 October full continuation](../verification/spec-0012-full-continuation.md)
> supersedes its completion estimates and missing-dependency statements.

This is the 25 September review snapshot. The subsequent
[26 September continuation](SPEC-0012-force-fresh-evidence.md) implements the
force-fresh prerequisite and updates completion/dependency evidence.

The implementation is a **safe classifier/read-projection/notice slice**, not the
complete specification. Estimated completion is **35% (roughly 30–40%)** of the
original functional contract. Confidence is **high, about 8/10, for this bounded
slice** after the corrections below. This is not approval of the full feature,
the specification, or a release.

This estimate weights classifier/identity behavior (18 of 20 points), persistent
read behavior (10 of 15), synchronized save/publication (0 of 35), targeted repair
(0 of 20), and Studio integration (7 of 10). It is an engineering estimate of
delivered behavior, not a percentage derived from tests or checked AC boxes.
The existing atomic Storyboard endpoint is useful infrastructure; it does not
yet satisfy this spec's synchronized-save contract.

## Review scope and revisions

- Reviewed local implementation starting at `09eb050c`, against the complete
  published SPEC-0012, issues #515/#580/#731, PR #581, relevant dependency reviews,
  AGENTS, architecture, guidelines, invariants, applicable ADRs and the supplied
  roadmap/SDD references. Reused the existing PR #581 attribution in the code.
- Review corrections are committed locally as `ddc4386f` (classifier) and
  `3c986526` (API/Studio). The final verification uses their source state.
- Refreshed `origin/develop` at `737d3314`. Local branch remains
  `spec/515-sectioning-storyboard-sync`; its diff against **origin/develop** has
  the target spec, INDEX entry and focused implementation. The local `develop`
  branch is stale and is not the comparison base.
- Published #888 is still `b850875c`, based on `spec/629-prompt-persistence`.
  Implementation remains unpushed. Preserve the remote base until the rebased
  head can be pushed together with retargeting; otherwise the remote diff would
  temporarily expose unrelated inherited specification work.
- Traced Studio → page GET → real SQLite current pointers → classifier → notice
  and preview. Also inspected the existing save, task, rerender, invalidation and
  CLI boundaries to distinguish prerequisites from delivered behavior.

## Findings corrected

| Severity | Reproduction and impact | Correction and regression evidence |
|---|---|---|
| P2 | Corrupt Sectioning/rendering JSON threw before GET could report drift. A schema-invalid rendering still reached Studio, where `sections.find` could crash. Image-only pages could also throw while recovering text from malformed legacy nodes. | Project these invalid inputs into diagnostics and nullable editor/preview data, retaining the original stored blobs and versions. Guard the raw text recovery walk. Six new real-storage route cases and one recovery test; valid rendering extension metadata and HTML pass through unchanged. Real browser flows cover malformed JSON and invalid rendering. |
| P2 | Unpaired Unicode surrogates were accepted as patchable text although UTF-8 persistence/transport replaces them, violating lossless projection. | Retain the section with explicit drift for unrepresentable text. Two tests count on actual `Buffer` UTF-8 round trips; valid emoji remains covered. |
| P2 | Structure comparison removed image/container text, but the patch loop had no corresponding projection. A mixed edit could be marked patched while silently ignoring those changes. | Only ordinary leaf text is excluded from structural comparison. Two reproducing image/container cases now retain the whole section, including the otherwise compatible text edit. |
| P2 | Notices existed only inside the detail editors, so empty/invalid source and queued/running/error fallback screens hid unresolved correspondence, including retired IDs. | Mount the notice in those stage fallback branches. Ten tests exercise both real stage views; browser checks cover empty source, retired rendering and corrupt source. |
| P2 | Fixed-layout Storyboard could display both the new limitation notice and the existing “Sectioning has changed … Re-run Storyboard” recommendation, contradicting AC-14. | Suppress that semantic synchronization recommendation for fixed layout using existing mode state and the page projection. Two tests verify fixed-layout absence and continued reflowable rerun behavior; a browser check confirms the fixed-layout notice without the misleading action. |

The new tests reproduced failures before their respective fixes. The review adds
23 test cases. No provider calls, alternate writer service, new dependency or new
Studio strings were introduced. Existing manual/custom rendering data is retained.
The fixes do not activate candidate publication or targeted repair.

## Verification

Current review verification results are recorded here after completion. Historical
baseline and earlier attempts remain in
[implementation evidence](SPEC-0012-implementation-evidence.md).

| Check | Result |
|---|---|
| Focused classifier, real SQLite page reads, extraction recovery, both stage views, notices, existing Sectioning editor and unsaved-change guard | **114 tests / 7 files passed**, with `--maxWorkers=3` (55.17 seconds). |
| Full repository `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test --maxWorkers=4 --testTimeout=60000` | **3,702 tests / 281 files passed** in 260.74 seconds. Includes the repository pretest build. No source edits during this final run. |
| `pnpm typecheck`, `pnpm lint`, Studio production build | Passed. Typecheck and lint repeated after the final classifier correction. Lint has 0 errors and the same 8 unchanged-file warnings. |
| Lingui extraction and strict compilation | Passed: 3,616 messages, zero missing translations in all five locales; no catalog changes from the review. |
| API and Electron API bundle scripts | Passed again after the final classifier correction. Not a packaged Desktop launch. |
| Actual API + Studio in Chromium | Five flows passed, no page JavaScript errors; screenshots inspected. |
| Invariant command | No separate `lint:invariants` script exists. The named correspondence invariant is exercised by repository tests. |

The earlier full run also passed, but the final classifier correction was made
while it was running. The unchanged-source run above supersedes it. Regression
reproductions before correction are retained in `review-regressions-before.log`,
`review-ui-before.log` and `review-nontext-before.log`; they are not reported as
pre-existing baseline defects.

Browser verification used a new disposable copy of `momograde1`, never the source
book: invalid rendering → usable Storyboard notice; empty source → Sectioning
notice; retained retired rendering → stable retired ID notice; corrupt source
JSON → notice/run-card fallback; fixed-layout configuration → limitation without
the stale semantic rerun recommendation. The last flow changes the configuration
of a reflowable book copy; it is **not** positioned-output fidelity verification
on a real fixed-layout book. No model calls were triggered. Test servers were
stopped after acceptance checks.

Read immutability evidence concerns current-schema content, history, pointers and
assets. `openBookDb` still performs the repository's existing initialization and
migrations before the GET read transaction. Do not interpret unchanged-file tests
as proof that opening an old-schema archive never changes its database. An actual
old-schema archive upgrade/import, real activity/fixed-layout packaged output,
signed installer launch, Docker image and hosted implementation CI are not
verified in this review. Earlier Docker verification found no available daemon;
the image check was not repeated. Cache/repair transport counts, cancellation,
restart recovery and concurrent writer publication remain untested because the
new write/repair paths are not integrated.

Local logs, browser script, result JSON and screenshots are in the adjacent
`tmp/spec-0012-evidence/` directory (`review-*`). They are not book data committed
to the repository.

## Blockers and remaining implementation

| Dependency | Refreshed evidence | Why full SPEC-0012 needs it |
|---|---|---|
| [SPEC-0001 / #879](https://github.com/unicef/adt-studio/pull/879) | Published `375081fc` remains documentation only. Existing `saveStoryboardNode` still uses book-wide `clearCaptionData`. | Shared scoped, non-destructive downstream invalidation and consuming-output freshness must replace destructive clearing. Until integrated, AC-15 and #580 gap 3 are incomplete. SPEC-0001 deliberately excludes Storyboard's own correspondence, which this PR still must own. |
| [SPEC-0002 / #880](https://github.com/unicef/adt-studio/pull/880) | Published `5eeaab68` remains documentation only. Its missing-source-as-AI policy and exclusion of Storyboard full-rerun preservation differ from SPEC-0012's protect-unknown requirement. | Need compatible provenance, protection and explicit review/replacement semantics for publication and repair. Proposed coordination amendment: unknown Storyboard origin remains protected; establish the shared adapter and ownership explicitly. Do not silently inherit an AI default or weaken SPEC-0012. |
| [SPEC-0003 / #884](https://github.com/unicef/adt-studio/pull/884) | Remote `04250fda` is documentation only, but the sibling local implementation had committed head `d9be75df` with writer admission and persisted mode/preflight lifecycle. Its working tree was actively changing. Twenty writer/preflight tests passed on that working tree, not as certification of the commit or this PR's integration. | This is an **integration prerequisite**, not absent implementation. Integrate a stable compatible revision and verify save/task/CLI conflicts and mode handling together. Do not copy another task's uncommitted work or infer end-to-end safety from isolated tests. |
| [Force-fresh rerender / #731](https://github.com/unicef/adt-studio/issues/731) | Still open. Current rerender service supplies normal `cacheDir`; shared model options do not provide the required cache-read bypass. | Targeted repair must make fresh transport calls and write fresh results through for later ordinary reuse. Disabling all caching is not the promised behavior. Requires transport-call-count regression tests before activation. |

Those dependencies do not complete SPEC-0012 automatically. This PR still needs
its production provenance adapter, server-owned candidate computation inside the
atomic save, expected source/render version checks, no-op/version deduplication,
rollback/conflict responses that retain drafts, authoritative committed-pair
responses, targeted repair controls and output-consumer verification. The current
GET adapter supplies no trusted proofs, so even matching legacy source/render
text stays unverified. A successful existing rerender cannot establish verified
correspondence or clear that protection by itself.

The pending product decision is acceptance of explanation/support routing as the
B1 fixed-layout treatment; semantic-to-positioned synchronization remains deferred.
Human spec review remains pending. Waiting for approval or merge is **not** the
reason for withholding implementation: the user's override remains in force.

## Original acceptance criteria → evidence

Statuses below explicitly distinguish a passed bounded slice from an unmet full
criterion. Spec checkboxes remain unchanged. No criterion is reported passed
merely because prerequisite documentation exists.

| AC | Status | Current evidence and limit |
|---|---|---|
| 1 | Blocked | Pure escaped-text candidate exists; no stored/preview propagation on Save. |
| 2 | Passed — pure/read slice; publication blocked | Byte comparisons preserve unaffected HTML, images, attributes, scripts, rows and assets. No production publication yet. |
| 3 | Passed — pure slice; publication blocked | Escaping, browser round trips, placeholders, optional IDs and unsupported-context retention. Unicode and non-text change regressions added. |
| 4 | Passed — classifier | Sparse/reordered stable identity, duplicate/foreign ownership and no index fallback. No new write action enabled. |
| 5 | Passed — read slice; save response blocked | Structural/missing/invalid output retained; corrupt JSON and preview schema failures now produce usable read diagnostics. |
| 6 | Passed — conservative preservation; review actions blocked | Unknown/manual/divergent correspondence cannot patch. No persistent review-resolution adapter. |
| 7 | Blocked | Existing atomic endpoint is not integrated with server-owned classifier, provenance, shared gate and rollback contract. |
| 8 | Blocked | Existing source save unchanged; GET diagnostics do not substitute for the authoritative save response. |
| 9 | Blocked | Pure candidate idempotency passes. Save version deduplication not implemented. |
| 10 | Blocked | Expected-version save/task/CLI race rejection and draft-retention flow not integrated. Read lock-release evidence is not writer-race evidence. |
| 11 | Passed — current-schema read slice; upgrade/import UI not run | Real SQLite, current-pointer restoration, reopen and copied book reads preserve content/history/assets. No verified provenance publication or old-schema archive acceptance. |
| 12 | Blocked; fallback notices passed | Queued/running/error screens now retain notices. Committed verified-output clearing and cancellation/recovery are not implemented. |
| 13 | Blocked | No targeted repair; requires shared protection, stable mode admission and force-fresh cache behavior. |
| 14 | Passed — notice behavior; product/release acceptance pending | Persistent limitation and no misleading stale semantic rerun recommendation; fixed and reflowable control tests plus real browser configuration flow. Real positioned-output acceptance not run. |
| 15 | Blocked | GET preservation passes. Existing mutation invalidation remains destructive; scoped downstream integration absent. |
| 16 | Passed — read/classifier slice; repair action not run | Retired/restored IDs remain distinct from successor indices; real empty-source notice names the retired ID. No repair action exists yet. |
| 17 | Blocked; notice/localization slice passed | Both editors and fallback states expose accessible notices, five locales complete. Committed-pair save response and refresh are missing. |
| 18 | Passed — reporting only | Partial scope, dependencies and fixed-layout limitation are explicit; no issue closure, approval or release claim. |

**Review disposition:** retain the corrected safe slice for review, but do not
present it as completion of SPEC-0012, #515 or #580. No push or merge is authorized
by this review request; local fixes are committed on the existing PR branch.
