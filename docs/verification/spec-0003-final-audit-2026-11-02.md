# SPEC-0003 local acceptance audit — 2 November 2026

This audit covers the existing B1 implementation integrated onto merged SPEC-0001/0002. It does not restore the superseded saved-section-count restriction, approve SPEC-0003, or certify a release. This round is local only: no push, retarget, PR metadata/comment/review request, issue change or merge.

## Heads and integration

- Current develop: `4b9e40cc185cdbceb3ef248248e440c08f25fa82`. Its only change after the verified base is the SDD/issue-template size-threshold documentation update.
- Merged SPEC-0002 / production integration base: `f2e59a0d29b13f65641f26c4f898738770d1181a`.
- SPEC-0001 squash: `c153ba7d26c2323b67236c61297999424b169ac1`; reviewed PR head `811d14751d6e01a8262d3e34466c1f45875b8ca1`.
- Approved SPEC-0002 head: `89a65f0677288be266ea448b231c1ca21dc30235`; runtime/test source `afd93f61ff31432086490f70df4f335748496197`. Actual approval is retained.
- Original SPEC-0003 local/published head: `c71605454126c29f8f6e5dab56ee90385012b886`, inherited prerequisite `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89`.
- Frozen production/test acceptance head: `f66613ea3c3a4d168275489b9a4273023247b8af`. The documentation checkpoint `9cec1454afb01e4a963662a3a7d4cd0af925dae1` is its direct child and is the exact successful Docker image revision. Subsequent audit updates change documentation only.
- Existing local alias `spec/SPEC-0003-708-sectioning-mode-lifecycle`; remote ownership remains `spec/708-sectioning-mode-lifecycle` in PR884. Proposed remote base: **develop**, not the obsolete prerequisite branch. Genuine current develop was reconciled by local merge `ee0f8f75c0a936e9838489896a79a92d8af56116`; existing implementation SHAs and the verified Docker checkpoint remain recoverable. A dedicated `backup/spec-0003-nov02-before-develop-doc-refresh` ref preserves `9cec1454`.

The genuine old increment was its final 27-commit/125-path net patch, reconciled onto develop rather than replaying squash-merged/rewritten ancestors. Recoverable refs `backup/spec-0003-nov02-{local-head,remote-head,old-prerequisite,develop-before-fetch}` remain. At the frozen head, 54 old final blobs match exactly, 70 are adapted, and LandingPageShell retains current develop's implementation. There are 27 additional correction paths; 783 upstream-only paths remain exact develop blobs. Nineteen other upstream-only paths have explicit integration/safety/test corrections. No manifest or lockfile dependency change. The frozen source inventory is `results/graph-comparison-f66613ea.json`; the later documentation adds one audit path (152 total/28 additional) in `results/graph-comparison-final.json`. The final range-diff is retained as `range-diff-final.txt`.

Owner `docs/verification/spec-0003-stacked.md` remains byte-identical (SHA256 `ee0f3e2c78365841c337aaca7efcd3d9edc83940bd01780af7c84e278aba2861`); owner `tmp/` and the unrelated primary checkout were not cleaned or reset. Private evidence root: `/private/tmp/spec0003-develop-integration-20261102-qxccq5e1`. Historical reports remain dated evidence, not fresh passes.

| Local commit | Result |
| --- | --- |
| dc6c5d3a | Reconcile existing revised B1 with merged ownership, freshness, draft and consent mechanisms. |
| f6fbef65 | Extend existing shared process admission to every SQLite reader/connection/statement. |
| 666874e3 | Correct batch isolation, fixed per-page availability, extraction localization and complete source receipts. |
| 159e7a52 | Preserve raw/effective config receipt, invalid-label handling and cancel-before-work ordering; refresh stale fixtures. |
| c2ca51d1 | Allow pure MathML conversion while committed pages remain readable during generation; preserve all actual writer guards. |
| ef8ee4f3 | Refresh independently reviewed real-process reset crash probe and anonymous-lock negative control. |
| a6917459 | Align two stale tests with public empty-override `null` receipts while retaining physical `{}` assertions. |
| f66613ea | Admit preview CSS as a shared database reader during same-process runs, with foreign-process exclusion retained. |
| 9cec1454 | Record the full local audit, initially with the Docker environment gate open; this is the subsequently verified Docker revision. |
| ee0f8f75 | Reconcile current develop’s SDD/issue-template documentation only; no runtime, tests, build inputs or approval change. |

## Operative amendments and qualifications

[The amended specification](../specs/SPEC-0003-sectioning-modes.md) and ADR025 retain the October product correction: By Page constrains generation/cache validation only; preference selection is informational; ordinary Sectioning fills genuinely missing records only; default-off exact-scope consent commits version-preserving active HTML/tree reset; ordinary Storyboard publishes each page immediately; only an actual layout switch buffers the complete active window. Original ACs are mapped below, not silently checked off under their former meaning. The proposed corresponding #708 correction remains in this PR's local documents; GitHub #708 is unchanged.

The owner additionally authorized all-reader coordination after an independent reviewer demonstrated live-reader mutex removal. The shared `.book-writer.json` lease and existing recovery reservation now cover all database openings and statement lifetimes. Proven-dead, registered, empty real mutex directories can recover; unowned/ambiguous evidence remains fail-closed. No timeout stealing, WAL/journal deletion, second lock service or schema migration. Same-process page readers remain available while a writer awaits; a different cooperating process can receive BOOK_BUSY. Concurrent old/raw SQLite clients are unsupported, and isolated old-build readability does not certify them.

Ordinary SPEC3 Sectioning deliberately narrows SPEC2's replaceable-AI policy: even restored AI pages remain until explicit replacement. Explicit reset is the reviewed exception to ordinary protected active fixed HTML/tree retention; failed generation does not reactivate old rendering. Unknown or contradictory rendered ownership stays in raw versions/assets but is omitted from Preview/export with warning. Absent authorship alone does not cause omission. No positional owner inference was added.

## Evidence key

Automated test paths below are repository-relative; E3 service files live under `apps/api/src/services/`, E4 route files under `apps/api/src/routes/` and service files under `apps/api/src/services/`, E5 files under `packages/pipeline/src/__tests__/`. Results are fresh only where the final command ledger reports a pass. Browser and platform records are in the private evidence root.

| Key | Verification |
| --- | --- |
| E1 | `packages/pipeline/src/__tests__/page-sectioning.test.ts`: actual backend request/cache/retry counts, valid reuse, cached invalid response eviction. |
| E2 | `apps/api/src/services/sectioning-lifecycle.test.ts`: config inheritance/removal/no-op/invalid/adjacent changes, exact PDF bytes, journal faults/process exits, part windows and arbitrary saved section counts. |
| E3 | `sectioning-existing-book.test.ts`, `sectioning-preflight-runners.test.ts`, `storyboard-publication.test.ts`: real storage immediate/queued/targeted/combined admission, exact consent, stale publication, null/unreadable input, coverage, package membership and scoped failures. |
| E4 | `manual-edit-survival.test.ts`, `pages.test.ts`, `page-edit-service.test.ts`, `sectioning-targeted-fixed.test.ts`, inherited owner/identity/restore suites: structural operations, full claimant ownership, fixed projection/common scale, preserved history/assets. |
| E5 | `pipeline-dag-publication.test.ts`, `cli-authorship.test.ts`, `sectioning-resume.test.ts`, `extraction-admission.test.ts`: supported fresh DAG/CLI, real PDF and independent CLI process, transport/cache counts and safe existing-book refusal. |
| E6 | Five storage/doctor reader-admission files; independent paused HTTP reader before/after fix; killed reader; `scripts/probes/spec-0003-reset-recovery.mjs` real fault/SIGKILL before/after commit and next edit. |
| E7 | Shared Studio consent/mode/config receipt/availability/run/task/error tests, five-locale extraction/strict compilation/lint. |
| U1 | Four actual browser mode journeys: both directions × fixed/reflowable. Cancel changes nothing; preference makes no generation/history change; ordinary retains all stored pages; default-off named reset; split; rebuild; Preview. `browser-b1-*.json` and screenshots. |
| U2 | Ten slow-second-page browser cases: reflowable/fixed first/rerun complete/cancel, plus reflowable failed/Skip. Actual page GET, clicked Studio page and MathML are visible while run remains active; successful first page and failed prior second output retained; next targeted action succeeds. `incremental-*.json`; final `incremental-reflowable-rerun-complete-css-final.json` additionally proves actual CSS POST200 and computed `rgb(18, 58, 188)` while page2 is held, followed by successful targeted work. |
| U3 | Both layout directions, success and failure: targeted task refuses mixed layout, failed switch leaves all old pairs/history, repaired fixture's next full run succeeds; fixed input includes a valid empty page. `browser-layout-*.json`. |
| U4 | Older complete/partial/loading books with no lifecycle: actual Studio saved-tree entry, no Extract or false cancellation banner; partial missing-output disclosure. `browser-legacy.json` and strengthened `browser-legacy-direct.json`: saved page visible before any stage run, zero provider calls and unchanged rendering object. Full history retention is separately E2/E3, not inferred from this browser snapshot. |
| U5 | Held/failed GET after Settings Save in Sectioning and TOC, next model-only Save; map tombstone plus independent refreshed addition; translation conflict load-latest/converged recovery then next Keep/Save; opaque duplicate legacy entries and provider/current-skip counts. |
| U6 | Actual combined Storyboard start requiring one missing Sectioning page: ordinary keeps three existing pages; explicit replacement names scope; stale external edit rejects before calls; fresh confirmation succeeds. `browser-storyboard-combined-*-missing.json`. |
| U7 | Five-locale extraction error display; manual quiz/TOC Save→restore→next Save; actual quiz runtime correct/incorrect scoring; unavailable TOC remains authored unlinked heading; timestamp next guarded Save/reload; cosmetic HTML Save preserves exact catalog summary and downstream versions. |
| P1 | Nine development API ADT exports: source/history/catalog/translation state unchanged; 234 original physical-media hashes unchanged; actual ZIPs under `exports/development-final-*.zip`. |
| P2 | Linux admission: 5 files/67 tests passed (including all 16 Darwin skips), current source/dist mounted into dependency image `7981ab66bbd4`; complete lockfile/package manifests verified equal. This is a Linux execution check, not a standard package build. Separately, the standard combined `app` image at `9cec1454` passed build, both-layout generation, nine-book export/restart, 737 identical ZIP members and 234 unchanged media hashes, with zero provider calls. See Docker follow-up below. |
| P3 | Unsigned Mac arm64 unpacked Desktop passed; bundled API/WASM/resources verified against built bytes, both layouts generated, nine books exported before/after process restart: 737 identical ZIP members, unchanged current/history/catalog and 234 original media hashes, zero provider calls. `desktop-final-*.json`, `platform-render-desktop.json`, `export-desktop-final-*.json`. |
| P4 | Real built old baseline `ef31494dc2951b92222c473960fecee2d91f9544`: all 1,822 tracked blobs verified, rebuilt API/runtime, current four-unit Save → separate old API reads/Preview/web package → current reopen passed; IDs/authorship/history unchanged. Isolated copies only. |

Browser fixtures copy a four-page synthetic representative book; original books are never mutated. They model existing manual/legacy content, both layout pipelines, explicit reset, failed input and concurrency. They contain physical image/audio/video fixtures but no original PDF; actual PDF preservation is exercised separately in E2/E5. Provider requests are stubbed and counted at transport; no paid calls. Monaco CDN assets are fulfilled from the exact installed 0.55.1 package. Fixed pause occurs at the actual event-loop page boundary after page1's transaction, not a mocked publication event. Availability is cooperative between pages, not CPU preemption within a page.

Probe setup failures remain in the evidence: outdated selectors/routes, invalid positioned fixture data, early Settings interaction before config load, localhost sandbox denial, and raw fixture edits racing a live reader. Corrected runs use fresh labels; none is silently called a product regression or a pass. The math-preview and refreshed-CSS 409s were real defects reproduced against exact develop and integrated code before correction. The synthetic older-book fixture includes unavailable thumbnails and, in the partial case, a broken inline image. These journeys prove retained text/HTML access and routing, not complete representative visual/media validity. Actual physical-media hash preservation and ZIP membership are separate checks; they do not turn a deliberately incomplete fixture into a production book.

## Independent findings and fixes

The separate reviewer derived its own original/revised requirement and public-entry map before adopting writer conclusions, traced the entire develop increment, and reproduced the original reader race independently. It remained read-only; acceptance workloads were serialized under the existing shared lock.

| Finding | Correction | Recheck |
| --- | --- | --- |
| Unsafe live-reader recovery | Every database connection/statement pins existing admission; actual dead-owner proof before registered mutex cleanup. | Reviewer real paused HTTP read blocks competing startup with unchanged bytes; resumed HTTP200; killed-reader recovery and next write pass on Darwin. Linux 67-case proof separately P2 passed; standard packaged-container restart remains separate. |
| N1 batch public route blocks valid neighbors | Remove redundant all-page semantic preflight; shared per-page renderer handles errors and fixed positioned input. | Seven real-route/storage cases failed before and pass after; bounded source/evidence recheck clear. |
| N2 fixed loop hides committed page / cancellation | Async page-boundary scheduling and awaited publication callback; pure per-page computation/common width preserved. | Four real TCP API cases plus U2 actual Studio first/rerun/cancel; bounded recheck clear. |
| N3 extraction errors untranslated | Shared explicit-code/prefix mapper covers six EXTRACTION codes across consumers; five locale catalogs. | Failed-before mapper regressions, strict compile, U7 all locales; bounded recheck clear. |
| W1 full source text omitted from frozen receipt | Hash full active PageData as well as book/effective config/window. | Real SQLite extracted-text edit rejects stale publication without resurrecting reset output. Independently confirmed. |
| Full-suite integration regressions | Empty config override receipt, invalid-label400, cancellation admission ordering corrected; obsolete test fixtures updated separately. | Exact develop baseline reproduced intended behavior; focused regression sweep passed. Final full suite below. |
| Math preview while ordinary writer active | Exact pure `POST /adt-preview/convert-math` exception after book-existence validation; real database readers still admitted. | Exact develop and pre-fix fail200/409; guarded negative control/config409/unchanged DB+lease/next config200 pass; U2 real MathML visible. |
| Preview CSS while ordinary writer active | Exact stylesheet POST follows the existing read route and shared database opener; no broad prefix exemption. | Before-fix/exact-develop409 reproduced; same-process CSS200/config409/unchanged bytes and lease/next config200 plus foreign reader409→200 pass. U2 actual newly styled page visible; independent source/evidence recheck clear. |
| Crash probe drift | Supply actual current consent signature and prove raw mutex existed before recovery. | Independent source recheck clear; real fault and SIGKILL probe passes, evidence retained. |

Reviewer reports remain under `reviews/independent/` for f6fbef65, 666874e3, 159e7a52, c2ca51d1 and the final bounded evidence review. The final bounded reviewer checked f66613ea source, full development results, strengthened browser source/records/screenshots, all 18 Desktop ZIPs and their 737 unchanged members, 234 media hashes, four bundled API/WASM hashes, Linux dependency/source provenance and old-build records. At that checkpoint it reported no new material defect and withheld full platform/publication acceptance while the standard Docker gate remained open. Its subsequent `9cec1454/docker-gate-review.md` closes that specific gate after independently checking the successful artifacts; other qualifications remain. Reports are `f66613ea/recheck.md`, `final-development-evidence.md` and `f66613ea/platform-evidence-review.md` (with `platform-artifact-inspection.json`). Source/evidence recheck is not a claim that the reviewer independently reran every writer test, browser or platform workload.

## Original AC disposition and revised acceptance matrix

“Passed” in the final version means the operative revised behavior has the named local evidence, subject to explicit qualifications below. Superseded original hard blocks are not tested as successful acceptance. Specification checkboxes remain unchecked for human review.

| Original AC | Disposition | Revised requirement | Status / evidence |
| --- | --- | --- | --- |
| AC-1: Dynamic to By Page invalidates Sectioning and every downstream step. | Revised | Preference change is informational; no content freshness or usability invalidation. | Passed locally — E2/E7/U1 |
| AC-2: By Page to Dynamic invalidates the same dependency closure. | Revised | Same rule in reverse. | Passed locally — E2/E7/U1 |
| AC-3: Extract completion and extracted data remain unchanged. | Retained | Extract is unchanged. | Passed locally — E2/E5/U1 |
| AC-4: Every existing content version and referenced media byte survives a mode change. | Retained | Keep every version and physical asset. | Passed locally — E2/E4/E6/U1/P1 |
| AC-5: Saving an unchanged effective mode causes no invalidation. | Retained | No-op effective preference does nothing. | Passed locally — E2 |
| AC-6: An unrelated config edit causes no mode invalidation. | Retained | Unrelated config remains independent. | Passed locally — E2/E7/U5/U7 |
| AC-7: A mode transition during active/conflicting work returns 409 with no mutation. | Retained with shared guard | Conflicting writer rejects before change; reuse prerequisite admission. | Passed locally — E2/E6 |
| AC-8: Studio confirms a transition when retained or completed downstream output exists. | Revised | Mode confirmation explains preference only; replacement has separate default-off consent. | Passed locally — E3/E7/U1/U6 |
| AC-9: Cancel leaves configuration unchanged and sends no mutation request. | Retained | Cancel before confirmation changes nothing. | Passed locally — E7/U1/U6 |
| AC-10: A failed update restores/refetches the persisted selection and surfaces the error. | Retained | Failed save restores authoritative selection and keeps drafts. | Passed locally — E7/U5 |
| AC-11: Successful transitions refresh config, debug config, step and relevant page/stage state. | Revised | Refresh preference diagnostics separately from actual usable-output coverage. | Passed locally — E2/E3/E7/U1/U4 |
| AC-12: By Page preflight rejects a missing latest Sectioning result. | Superseded | Missing/unreadable page input is reported per page; other pages render. | Passed locally — E3/U4 |
| AC-13: By Page preflight rejects zero sections. | Superseded | Empty saved trees are valid edits; warn, no count gate. | Passed locally — E3/E4 |
| AC-14: By Page preflight rejects multiple sections. | Superseded | Multiple saved sections remain renderable in By Page. | Passed locally — E3/E4/U1 |
| AC-15: Any preflight failure preserves all rendering versions and starts no rendering call. | Revised | Ordinary runs publish successful pages immediately; failed pages keep prior output. | Passed locally — E3/U2/U3 |
| AC-16: Exactly one valid section per source page permits Storyboard subject to other prerequisites. | Retained and broadened | Render any valid saved tree; enforce count only at generation/cache boundary. | Passed locally — E1/E3/E4/U1 |
| AC-17: Dynamic mode continues to accept multiple sections. | Retained | Dynamic accepts multiple or single saved sections. | Passed locally — E1/E3/U1 |
| AC-18: Historical/imported inconsistencies are caught without an observed config transition. | Superseded | Legacy lifecycle is informational unknown, never an initialization gate. | Passed locally — E2/E3/U4/P1 |
| AC-19: API, queued, targeted and DAG/CLI paths enforce the same rule, including fixed layout. | Revised, CLI scope deferred | Immediate/queued/targeted/combined app paths share policy; fresh CLI uses valid generation, existing-book resume deferred. | Passed locally — E3/E5/U2/U3/U6 |
| AC-20: All new UI copy is translated in the five supported locales. | Expanded | All changed UI and HTTP/SSE errors translate in five locales. | Passed locally — E7/U7 |
| AC-21: The implementation adds no dependencies. | Retained | No new dependency. | Passed locally — Final tree/manifest comparison |
| AC-22: Effective override removal/default resolution is correct; invalid modes change nothing. | Retained | Use effective defaults/override removal; invalid mode changes nothing. | Passed locally — E2/E7/U5 |
| AC-23: Injected file/DB failures and restart at each journal boundary never expose new mode with old current status. | Revised | Journaled config and atomic reset recovery cannot falsely claim completion. | Passed locally — E2/E6 |
| AC-24: Admission races and post-preflight edits cannot publish output based on obsolete configuration or section versions. | Retained | Revalidate exact source/render/config at execution and publication. | Passed locally — E3/E6/E7/U6 |
| AC-25: Errors contain the full failure count and at most 20 displayed page identities, including malformed/null results. | Revised | Bound informational page diagnostics and per-page missing/error reports with total counts. | Passed locally — E3/E7 |
| AC-26: Invalid cached multi-section responses follow #692's eviction/retry behavior; valid cache reuse remains possible. | Retained | Keep #692 invalid-cache eviction/retry and valid cache reuse. | Passed locally — E1/E5 |

| Revised criterion | Status | Evidence and boundary |
| --- | --- | --- |
| RAC-1 Generation/cache validation in By Page rejects/retries anything other than one section; valid cache reuse remains unchanged with transport counts. | Passed locally | E1; valid cache reuse and invalid cached/live responses counted at actual backend boundary. |
| RAC-2 Both modes render valid saved trees of any section count, including manual edits, without an unrelated targeted-render blocker. | Passed locally | E3/E4/U1; arbitrary saved count, unrelated target. Browser split; add/clone/merge/delete separately automated. |
| RAC-3 Missing/old lifecycle permits older-book read/render/export without initialization, AI calls on read, content changes or invented provenance. | Passed locally | E2/E3/U4/P1; no lifecycle run required; direct-before-any-run browser follow-up passed (U4); rendering equality/zero calls, not a browser-wide history snapshot. |
| RAC-4 Missing/unreadable page input is reported per page; unrelated runnable pages complete in both layouts and active part windows. | Passed locally | E3/U4; real-route batch isolation; fixed absent/invalid versus valid-empty; persisted part-window tests. |
| RAC-5 Ordinary Sectioning fills missing pages only; all existing records and unaffected pages/versions/assets remain unchanged. | Passed locally | E3/U1/U6; all stored records retained, only absent page filled. |
| RAC-6 Explicit replacement is default-off, lists exact affected versions, and rejects stale/invalid consent at immediate and queued execution before reset/calls. | Passed locally | E3/E7/U1/U5/U6; exact snapshot, book/config/window identity, default-off/reopen, stale immediate/queued control. |
| RAC-7 Confirmed reset deactivates scoped active Storyboard transactionally, preserves histories/assets and previous authored Sectioning on failed/cancelled generation, and remains truthful after crash/restart. | Passed locally | E3/E6/U1; null active rows before generation, full rollback inside transaction, committed reset retained after crash. |
| RAC-8 Dynamic → By Page and reverse, explicit regeneration → split/add/clone/merge/delete → Storyboard succeeds without positional reuse of old HTML; Cancel changes nothing. | Passed locally | E4/U1; both preference directions/layouts and split before rebuild; other structural operations automated. |
| RAC-9 Fresh and same-layout Storyboard publish each successful page and HTML/tree pair immediately; API and Studio expose the first page while the next is slow. | Passed locally | E3/E5/U2; actual early page HTTP/Studio/MathML while second is held; fresh DAG callback tests. |
| RAC-10 Later failure, Skip or cancellation keeps published pages and a failed same-layout page's prior output; stale publication changes nothing. | Passed locally | E3/U2; first output retained across failure/Skip/cancel, failed rerun page kept, next target succeeds. |
| RAC-11 Actual layout switches publish the full active window atomically, including fixed-tree deactivation; partial/targeted/failed switches retain the old layout. | Passed locally | E3/U3; both directions success/failure, target refusal, matching positioned tree deactivation and next successful full run. |
| RAC-12 Partial section patches cannot claim full included-output coverage; reset old HTML/history cannot establish new currentness or package completeness. | Passed locally | E3; source coverage and required package files checked independently; partial target and reset-old-HTML controls. |
| RAC-13 Preview/export retain usable content regardless of preference/lifecycle, keep inherited owner warnings and genuinely missing-work handling, and agree with library/sidebar/stage coverage. | Passed locally | E3/U4/P1/P2/P3; usable content and inherited ownership/missing warnings; Desktop and standard combined Docker package/runtime/export/restart evidence passed (P2/P3). |
| RAC-14 Effective preference changes/removal/inheritance are consistently informational; unrelated/no-op/cosmetic saves preserve content freshness and completed attempts, Extract and bytes. | Passed locally | E2/E7/U1/U5/U7; actual cosmetic summary exact equality, downstream versions/zero calls, raw/effective receipts. |
| RAC-15 Shared writer/version guards prevent competing immediate/queued/targeted publication; config journal/reset recovery retains evidence and never deletes ambiguous locks by timeout. | Passed locally | E2/E3/E6/P2; independent live/dead reader proof and raw crash evidence; Linux proof passed; standard packaged-container restart also passed (P2). |
| RAC-16 Remaining UI/HTTP/SSE errors and parameters translate in all five locales; obsolete restrictions/errors are removed. | Passed locally | E7/U7; actual HTTP extraction error all five locales; all codes/SSE/poll/task through shared mapper tests/source. |
| RAC-17 Fresh CLI/DAG remains safe; expanded existing-book resume is deferred/refused here. No B2 modes, automatic merge, new dependency or competing freshness/lock subsystem. | Passed locally | E5; fresh supported CLI/DAG and safe refusal; no manifest changes/B2/automatic merge/general resume. |
| RAC-18 Inherited authorship, draft, restore, stable ID/audio/TOC-consent, current-read and scoped cache guarantees survive integration, subject to the explicit legacy-owner qualification. | Passed locally | E4/E6/E7/U5/U6/U7/P4; merged protection/draft/identity/current-reader suites; old-build read scope qualified. |

## Consolidated review and feedback-to-fix matrix

| Nine-scenario requirement | Status / evidence |
| --- | --- |
| 1. By Page live/cache rejection and retry | Passed locally — E1. |
| 2. Saved split/add sections render; unrelated target unaffected | Passed locally — E3/E4/U1. |
| 3. Fresh/rerun first page clickable during slow later page | Passed — U2 and final E3/E5 automation. |
| 4. Failure/Skip/cancel retains successes; switch atomicity | Passed — U2/U3 and final E3 automation. |
| 5. Both modes, explicit reset, history, split before rebuild, Cancel | Passed browser — U1; E4/E6. |
| 6. Older books and per-page missing/unreadable input | Passed — U4 direct-before-run and final E3 automation. |
| 7. Partial rerender/reset cannot falsely complete source/package | Passed locally — E3. |
| 8. Missing-only / exact declared replacement / stale409 | Passed — U6 and final E3 automation. |
| 9. Versions/restart/editability/status/localization | Passed locally — E2/E6/U4/U7/P2 Linux proof/P3 bundled Desktop. Standard Docker runtime/export/restart also passed at the documentation-only `9cec1454` checkpoint. |

| Feedback | Resolution and evidence | Status |
| --- | --- | --- |
| Critical A | No persisted By Page count gate; manual saved tree/target rendering E3/E4/U1. | Passed locally |
| R1 | Included-owned HTML coverage plus separate package members/files; E3. | Passed locally |
| R2 | Unknown lifecycle cannot make reset null rows current; E2/E3/E6/U1. | Passed locally |
| R3 | Preference diagnostics distinct from usable output/catalog freshness; E2/E7/U1/U4/U7. | Passed locally |
| R4 | Shared localized error map, five locales; E7/U7. D6 exact deferred adjacent-page phrase remains separate. | Passed locally |
| R5 | Immediate per-page HTML/tree; actual HTTP/Studio/MathML and CSS availability; E3/U2. | Passed — real CSS POST/computed-style U2 and final automated suite |
| R6 | Pre-edit shared stable ownership, inactive null output, no array-position reassignment; E4/U1. | Passed locally |
| F1 | Full claimant ownership snapshot protects unrelated retained owner; E4. | Passed locally |
| F2 | Committed event refresh bypasses throttle; fixed events/async scheduling; E3/E7/U2. | Passed locally |
| F3 | Fresh reflowable DAG per-page callback publication; E5. | Passed locally |
| F4 | Full aggregate count, bounded20 identity parameters; E3/E7. | Passed locally |
| F5 | Known HTTP/SSE/poll/task errors map consistently; unknown diagnostics retained; E7/U7. | Passed locally |
| F6 | Old partial package cannot become complete solely from completed source coverage; E3. | Passed locally |
| F7 | Missing/null/unreadable positioned/classification/viewport input is not blank; real empty accepted; E3/U3. | Passed locally |
| F8 | Older complete/partial/loading saved-tree route, no false cancelled/change banner; E7/U4. | Passed — strengthened direct-before-run U4 |
| Earlier fixed/credentials/PDF/restore | Positioned target/common scale, no unused LLM initialization, exact PDF bytes, current committed versions; E2/E3/E4/E5. | Passed locally |
| Earlier settings/failed/queued/book ABA | Frozen status/versions/config receipt, book/scope identity, revalidation after failure/queue, next Save; E3/E7/U5/U6. | Passed locally |
| Locking simplification / CLI | Current supported shared protocol retained and expanded by explicit owner decision; broad CLI resume still refused. E5/E6. | Passed locally, including standard Docker runtime/export/restart |

## SPEC-0001/0002 compatibility inventory

The pre-edit inventory compared actual `09f0d1c7..develop` changes against the original SPEC3 increment: 57 shared paths, plus upstream-only paths checked by final blob comparison. The final independent review traced semantic conflict resolutions, not only the files below. The private `plans/compatibility.md`, source inventories, conflict/review records and final tree comparison retain the path-level audit.

| Shared contract | Fresh evidence / outcome boundary |
| --- | --- |
| Canonical ownership and stable identities | Shared reciprocal owner resolver, full claimants/pre-edit snapshots, narrowly unique legacy-leaf/fixed projection retained. E4 and inherited content-ID, glossary, activity, reading-order, assistant, image/history/restore suites. Contradictory ownership is omitted with warning, not guessed. |
| Catalog freshness and Save | E3 plus inherited output-freshness/catalog/source-generation suites. U7 actual cosmetic HTML save preserves exact freshness summary, captions/Easy Read/translation/speech histories and zero calls. Access/packaging may independently need refresh. |
| Current-version and null reads | E3/E4 reset and restore tests use selected pointers; SQL null/JSON null/unreadable distinctions retained. Old historical output cannot make replaced Sectioning current. |
| Translation entry protection / raw legacy metadata | Inherited preservation/catalog-execution routes and U5 real conflict recovery, next Keep/Save, duplicate opaque entry retention, actual provider body/window skipping and next current-output skip. No normalization of untouched legacy metadata. |
| Quiz unit, page sets, IDs/options and scoring | E4 inherited quiz identity/manual-survival tests; U7 actual manual Save→restore→next guarded Save, neighbor quiz/options unchanged, correct/incorrect runtime scoring. Existing quiz batching remains; no general CLI preservation claim. |
| Whole-page Sectioning | E3/E4 missing-only includes AI/manual/unknown/empty/unreadable/current-null; selected AI Revert remains a whole-page history operation with zero calls, not permission for ordinary regeneration. U1/U6 named explicit reset and stale confirmation. |
| Whole-document TOC | Inherited identity-aware conflict/same-run consent tests; U7 manual Save/history/next Save, retained unavailable destination with empty href. Stored empty TOC remains empty; missing-document fallback is separate. D3 is not repaired. |
| Drafts, receipts and book/scope consent | E7 current shared hooks/components; U5 held/failed post-save GET, model-only successor Save, map null tombstone/independent addition, translation settled recovery; U6 stale external edit rejection and next fresh confirmation. Component tests cover book A→B→A, delayed reads, navigation/history and Add Quiz; not every such race has a fresh browser replay. |
| Speech/timing/assets | Merged speech/timing/fallback/cache/namespace/draft suites retained. U7 actual consecutive timing saves advance baseVersion8→9→10 and reload the edited row. Physical image/audio/video comparison is separate from metadata; no live provider quality claim. |
| Preview/export and activity outputs | E3/E4 plus P1–P4; actual en/fr text/quiz/TOC catalog, source history and ZIP membership checks. Usable downstream warnings remain separate from absent owned HTML. No new lifecycle gate. |
| Writer/recovery | User-authorized all-reader extension replaces the insufficient writer-only recovery assumption within the existing protocol. E6 independent process/live/dead reader and reset boundary; P2 Linux proof. Unsupported raw/old-build concurrent writers/readers remain outside proof. |
| Upstream sharing/comments and other features | 783 upstream-only paths exact develop; applicable shared API/ID/path admission changes included in full tests. Public sharing credentials/deployment/cross-origin behavior not exercised or changed here. |
| No dependencies / architecture | Root/shared schemas and pure pipeline functions retained. No package manifest/lockfile changes; no alternate freshness/lock/publication subsystem. |
| Bounded older build | P4 uses real built `ef31494d`, four-unit current writes→isolated old reader/package→current reopen. Readability only; no old-build editing, reruns or simultaneous access. Pre-schema14 reconstruction is not certified. |

## Commands, platform provenance and limits

All acceptance workloads use the existing shared acceptance lock, pin PROJECT_ROOT/BOOKS_DIR/PROMPTS_DIR/resources to this checkout or the package under test, strip real credentials, block provider CLIs/external transports, and use disposable copies. Commands run from `tmp/spec-0003-implementation` with `DEVELOPER_DIR=/Library/Developer/CommandLineTools`; `probes/run.py` records exact arguments, head, dirty state, exit and elapsed time in `logs/*.json`. Install/build-only commands allow dependency downloads. The 8,850-entry/177-window experiment remains separately dated prerequisite evidence, not a newly rerun performance claim.

- Initial integrated full sweep at666874e3: 21 failed /6229 passed /16 Linux skipped, 15 failed files. Actual integration regressions were reproduced against exact develop and corrected; invalid/obsolete fixtures were refreshed without weakening production protection.
- Full sweep atef8ee4f3: 6251 passed /2 failed /16 Linux skipped, 494 passed files/1 failed. Both failures were stale empty-override expectations; exit1 is retained. Root/runtime typecheck, lint, extract and strict compile passed. Desktop typecheck failed with the exact same three TS2307 imports already reproduced on exact develop.
- Final `f66613ea` full suite: **495 files passed; 6,255 tests passed, 16 Linux-only skipped; exit0, 694.64s**. Root/runtime typechecks exit0; lint exit0 (8 warnings, 0 errors); Lingui extraction and strict compilation exit0 (4,529 messages per locale, zero missing). Desktop typecheck still exit2 with the three baseline TS2307 imports above. Platform ledger follows below.
- Build runs as `pnpm test`'s pretest (`pnpm build`), not inferred from typecheck. No standalone invariant command exists; available invariant enforcement is in repository tests/types/lint and final diff inspection.
- Browser API/Studio runs used Node22.23.2, actual Hono/Vite and Chromium/Playwright1.58.2; first broad browser pass at159e7a52, math pass atc2ca51d1, final direct legacy/CSS pass atf66613ea. Each source-only change and affected rerun is separated in receipts.
- Docker: the three original disk-full failures remain historical evidence (`logs/install-docker-environment-control.{json,log}` and `docker-build-app*-disk-full*`). After the owner authorized dangling-unused-image cleanup, `docker image prune --force` reclaimed 7.954GB from four dangling images; exact inventory comparison confirms tagged images, all containers and all volumes remained. The next build safely rejected a Debian package with an unexpected size; unchanged retry passed. The standard combined `app` target was built at `9cec1454` (40.52s), actual API+nginx ran on Linux arm64, both layouts regenerated, and nine-book export/restart passed (33.09s). Image `sha256:2ebbe12db79889e73e5f4bf3d90733c92b31cbca40eaadb8d00687c34de5534e` has the exact revision label. Results: 737 byte-identical ZIP members/current-history-preview comparison, 234 original media hashes, zero provider calls, container stopped after checks. Linux admission separately passed 67 tests using the verified dependency carrier; it was not substituted for this standard packaging check.
- Desktop: `pnpm --filter @adt/desktop build:unpack --publish never --config.directories.output=<evidence>/desktop-final-review-unsigned` passed (Node24.13.0, signing/notarization disabled). Bundled API/WASM and prompts/templates/assets/config hashes match; actual Node API generation in both layouts, nine-book export/restart, 737 byte-identical ZIP members and 234 retained physical media files passed with zero provider calls. This is **not** a full Electron GUI/hardened-launch/signed installer test.
- No hosted CI certifies this unpublished local candidate. Existing remote CI belongs to the unchanged historical head. Local authorization explicitly forbids publication this round.


### Exact command ledger

The wrapper `python3 <evidence>/probes/run.py <name> <command...>` serializes work and records the effective head/paths/exit. The commands below ran against `f66613ea` unless noted.

| Command | Result |
| --- | --- |
| `pnpm test --maxWorkers=2` | Passed: pretest `pnpm build`, 495 files, 6255 tests; 16 Linux-only skipped on Darwin. |
| `pnpm typecheck` | Passed. |
| `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed, 0 errors/8 warnings. |
| `pnpm --filter @adt/studio extract` | Passed; tracked catalogs unchanged after extraction. |
| `pnpm --filter @adt/studio exec lingui compile --strict` | Passed; all five locales, 4529 messages each/0 missing. |
| `pnpm --filter @adt/desktop typecheck` | Failed exit2: three TS2307 release-script imports, also reproduced on exact develop. |
| `node scripts/probes/spec-0003-reset-recovery.mjs <evidence>/results/reset-recovery-final` | Passed real rollback/SIGKILL/committed reset/next edit and unowned-mutex negative control; probe corrected at ef8ee4f3, production unchanged since c2ca51d1. |
| `python3 <evidence>/probes/linux-overlay.py` | Passed: actual Linux Vitest 5 files/67 tests/0 skipped, complete dependency identity comparison; current source/dist overlays recorded. |
| `pnpm --filter @adt/desktop build:unpack --publish never --config.directories.output=<evidence>/desktop-final-review-unsigned` | Passed unsigned build; Node24.13.0, `SKIP_NOTARIZE=ALL`, `CSC_IDENTITY_AUTO_DISCOVERY=false`. |
| `python3 <evidence>/probes/desktop-acceptance-final.py f66613ea3c3a4d168275489b9a4273023247b8af` | Passed actual bundled API/resources, fixed/reflowable generation, exports/restart/media comparison. |
| `python3 <evidence>/probes/compatibility-reviewed.py` | Passed exact old-source audit, `pnpm exec tsc --build apps/api`, `pnpm --filter @adt/runtime build`, retained compatibility probe. |
| `REVIEW_LABELS=<evidence>/results/platform-labels.json python3 <evidence>/probes/check-media.py books development-final` | Passed 234 original files across nine books. |
| `docker build --network=host --target app --label org.opencontainers.image.revision=9cec1454afb01e4a963662a3a7d4cd0af925dae1 -t adt-spec0003-nov02:app-9cec1454 .` | Passed after authorized dangling-only cleanup and one rejected transient mirror response; unchanged standard Dockerfile, Linux arm64. |
| `python3 <evidence>/probes/docker-runtime.py` | Passed actual combined API/nginx, both-layout generation, nine-book export/container restart/re-export, history/catalog/ZIP/media comparison, zero provider calls. |

Complete named browser commands, isolated book labels, assertions, transport counts, screenshots and source hashes remain in `probes/`, `logs/` and `results/`. The committed regression suites are the repeatable repository acceptance; the disposable browser probes adapt the existing SPEC2 acceptance infrastructure with attribution and are not a new production test subsystem.

## Platform gates and remaining verification limits

| Gate | Status | Precise limit / next action |
| --- | --- | --- |
| Standard combined Docker `app` build | **Passed** | Exact `9cec1454` image, unchanged runtime source from tested `f66613ea`; authorized dangling-only cleanup resolved disk constraint. Historical failed commands remain recorded. |
| Current standard Docker image: both-layout runtime, export, restart | **Passed** | Real API/nginx, fixed/reflowable generation, nine books/737 identical ZIP members/234 preserved media files across container restart, zero provider calls. Linux arm64 only; not signed/cross-platform release certification. |
| Desktop typecheck | **Failed — verified baseline** | The same three release-script TS2307 imports fail on exact develop. Packaged API success does not make typecheck pass. |
| Hosted CI on the local candidate | **Not run — publication prohibited** | No push was authorized. Historical hosted CI applies to remote c7160545 only. |
| Full Electron GUI/hardened launch, signed installers and Windows/Linux release packages | **Not run** | This audit built an unsigned Mac arm64 package and executed its actual API/resources under Node only. |
| Assigned private books, live-provider quality, low-end hardware, cross-origin SCORM | **Not run in this integration** | Preserve prior ownership/assignments; synthetic transport and representative fixtures do not certify these environments. |
| Additional actual-browser race variants | **Not run as fresh browser journeys** | Queued consent changes, book/scope A→B→A and all navigation/delayed-read combinations have public-route/component regressions; named actual browser journeys cover external stale confirmation and Settings successor/translation recovery. Do not infer every browser variant from automation. |
| Human SPEC3/ADR025 approval | **Pending human decision** | Implementation authorization is not approval. SPEC2's actual approval is retained. |

## Docker follow-up after authorized cleanup

The owner authorized **dangling, unused images only**. `results/docker-dangling-cleanup.json` retains before/after inventories, exact command and reclaimed bytes; no tagged image, container or volume was removed. `results/docker-build.json`, `logs/install-docker-app-mirror-retry.json` and `logs/docker-build-app.log` identify the successful standard build. Runtime proof is in `results/platform-render-docker.json`, `docker-runtime.json`, `docker-runtime-platform.json`, `export-docker-before.json`, `export-docker-after.json`, `exports-docker-before-docker-after.json` and `media-docker-after.json`, with all 18 actual ZIPs retained under `exports/`.

The outer runtime stdout logger and the probe's container-log capture shared an original filename. The original is preserved; exact exit/head remains in `logs/docker-runtime.json`, and raw container output was independently recaptured as `logs/docker-runtime-container.log`. This logging collision did not change any acceptance assertion or artifact. The final bounded independent follow-up, `reviews/independent/9cec1454/docker-gate-review.md`, verified image provenance, all 18 actual ZIPs and 737 member bytes, both-layout generation histories, all 234 media hashes and the exact cleanup inventory. It found no new issue and closed the Docker gate; it did not rerun the writer's runtime workload.

## Deferrals, open acceptance and downstream implications

These are distinct categories, not an unexplained blocked bucket.

1. **Approved SPEC2 deferred defects:** D1–D6 /#1039–1044 under [owner deferral decision](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220) and [actual approval](https://github.com/unicef/adt-studio/pull/880#pullrequestreview-5731520149): same-page clean Revert draft; quiz deletion during unresolved Save conflict; saved-empty protected TOC Run silent skip; identical AI-edit versions; stale Save-error banner after Discard; exact untranslated “Adjacent page no longer exists”. They remain known deferred behavior, not passes or newly fixed scope.
2. **Optional approved follow-ups:** #1045–1048 explanations, competing-value comparison, editor consolidation and broader browser infrastructure. These do not waive required SPEC3 consent/coverage/visibility/browser checks.
3. **SPEC1 ratified limits:** Note7/clarification-map positional activity carry-over; ownership/history reconstruction including K3 pruned leaves; staged Speech before Word Highlighting; SPEC13 provider-wide preparation classification; bulk review/projection/no-op; same-ID externally changed image bytes; historical blank IDs/pre-schema14; performance#995–997. Only the explicitly authorized reader-coordination correction changes the relevant recovery proof assumption here.
4. **B1 exclusions:** B2 modes, automatic cross-page merge, new fixed Sectioning editor/page picker/per-page controls, broader scoped generation#619, full ordinary Storyboard manual preservation#144, fifth Easy Read slice, broad existing-book CLI resume/unsafe extraction repair, unrelated EPUB/PNLD work.
5. **Documented safe qualifications:** Missing/unreadable fixed inputs retain prior output/report per page; ambiguous mutex/owner evidence blocks without timeout deletion; unverifiable contradictory rendered ownership remains in raw/history/assets and is omitted with warning. Old-build readability is not old-build concurrency/editing safety.
6. **Unapproved product/spec changes:** SPEC3 and ADR025 remain review-pending. User authorization permits implementation/amendments now; it is not human specification approval. Proposed #708 correction is local, and merged SPEC2 approval remains intact.
7. **Open release/acceptance checks:** Assigned private-book quality, paid/live-provider quality, low-end hardware, full Electron GUI/hardened Mac launch, signed/cross-platform releases and cross-origin SCORM remain separately owned/unverified. No request to repeat previously accepted owner walkthroughs. Fresh actual browser ABA/queued-race variants beyond the named journeys are not claimed; committed public-route/component regressions are cited precisely.

SPEC0010 should build on the final reviewed local/published ancestor only after the owner authorizes publication. Preserve the shared reader admission API, exact extraction/source receipts, active-output/reset boundary and deterministic fresh CLI guards; do not reintroduce older writer-only recovery or broad existing-book resume through a stack merge. Descendant #886/#888 were inspected for focused reuse/attribution; neither was merged into this ancestor.

The later develop update changes only `.github/ISSUE_TEMPLATE/spec.yml` and `docs/SPEC_DRIVEN_DEVELOPMENT.md`. Those files are not Dockerfile inputs. The final tree comparison records unchanged application, tests, manifests, configuration, Dockerfile and other build inputs against the verified source; documentation-only reconciliation does not require re-running the unchanged runtime suite. The new size thresholds do not change this task’s authorized same-PR or approval boundaries.

## Readiness assessment

**The revised B1 behavior is implemented within the documented qualifications.** No known in-scope functional defect remains after the independent source reviews and named regressions/browser checks. The all-reader correction is implemented and verified on Darwin and Linux using real processes. This is stronger than the earlier conservative slice, but it is not an assertion that every platform or release acceptance gate passed.

The local branch is suitable for code/spec review, and the required standard combined Docker build/runtime/export/restart gate is now complete. **Readiness remains qualified:** the separate Desktop typecheck still fails with three verified baseline imports, and the remaining actual-browser/release limits are explicit above. Hosted CI cannot certify this local-only candidate until publication is authorized. Obtain owner authorization before any push/retarget/review request. The tested functional matrices do not imply human SPEC3/ADR025 approval, assigned private-book quality or release certification.

Proposed later remote base is develop. Before later publication refresh develop/remote PR884 again; any necessary rewritten publication must use the then-current exact force-with-lease. Remote PR head, title, description and base are unchanged in this round.
