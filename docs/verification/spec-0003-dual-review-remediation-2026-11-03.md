# SPEC-0003 dual-review remediation — 3 November 2026

Starting candidate `910edc27a7041374f84ec1b48de3044f9cd5c2b8`, develop `4b9e40cc`. This round remains local only with root as sole implementation writer. No spec approval, publication or new deferral is authorized. The prior November2 readiness assessment is superseded by these external counterexamples until fixes and rechecks close them. Full original/revised contract and prior evidence remain in the [November2 audit](spec-0003-final-audit-2026-11-02.md).

Both complete independent reports are preserved under `.local-docs/spec0003-independent-20261102-234521-0a817ec2/report.md` (Codex; own full suite/browser/real storage) and `.local-docs/spec0003-b1-independent-review-20261102-234604-claude-code/REPORT.md` (Claude; source findings plus later static checks and a mixed-candidate test run). Their primary conclusions and 22 enumerated additional source leads are being adjudicated, not accepted or dismissed by test totals. New receipts live in `.local-docs/spec0003-dual-review-remediation-20261103/`.

## Pre-edit feedback and verification map

| Finding | Current behavior / required correction | Public reach and concrete verification | Before-fix status |
| --- | --- | --- | --- |
| C1 | Fresh DAG buffers Sectioning until a dependent step; later failure loses earlier successes. Commit each page after its own optional translation and current-input checks. | Fresh CLI/DAG, translation on/off, second-page failure/cancel, changed source; real SQLite and transport counts, page1 visible before page2, truthful incomplete stage. | Confirmed by external runtime; fix pending |
| C2 | Unreadable optional lifecycle throws/gates preference controls. Project unknown and preserve unreadable evidence, including next Save/generation; keep real config journal failures safe. | HTTP Sectioning state, mode settings, EACCES/EISDIR, history/config preservation and next successful action; genuine journal fault controls. | Confirmed by external runtime; fix pending |
| C3 | Package completeness/cache only checks section membership/hash and overlooks required runtime files. Share required-file validation across status/library/stages/cache. | Real packaged fixed/reflowable bundles, delete exact referenced runtime/entry/CSS/manifest/page; incomplete status, rebuild or safe refusal, next good cache reuse, partial warnings preserved. | Confirmed by external runtime; fix pending |
| S1 | Empty positioned draw items plus unpruned images can publish blank fixed output. Require actual safe blank-input conjunction. | Ordinary, targeted, queued and fresh DAG fixed render, valid empty control, unaffected page and old pair/history/assets; layout switch remains all-success. | Source-confirmed lead; runtime reproduction pending |
| S2 | JSON-null reset rows reach Quiz/Glossary parsers and throw for the stage. Treat deactivated output as absent with shared collector semantics; keep actual malformed input validation. | Explicit scoped reset then real collector/stage work, runnable neighbors, no old HTML input, stable protected content, next rebuild/run. | Source-confirmed lead; runtime reproduction pending |
| S3 | Cross-process pure reads can receive BOOK_BUSY. Evaluate against owner-authorized all-reader protocol and documented safe exclusion; never add a competing lock or weaken recovery. | Existing independent-process read/writer tests and doctor before/during/after an actual held connection; precise supported topology. | Contract/source adjudication pending, no lock change authorized by reviewer suggestion |
| S4 | Missing/owner packaging page lists are unbounded. Cap displayed IDs at20 while retaining full page/section totals and complete warning data. | Sync/task/cache warning channels, >20pages/duplicates, five locale extraction/strict compilation. | Source-confirmed lead; runtime reproduction pending |
| Other Claude leads | Triage every AREA report claim separately for supported trigger, exact contract and permitted deferral. | Independent read-only source triage then targeted runtime proof for credible in-scope gaps; no speculative fixes. | Pending |

## Original AC applicability before edits

The original-to-revised mapping remains unchanged; no criterion is weakened. The table identifies this round's changes and checks; unaffected criteria retain prior evidence provisionally and will be covered by the final integrated regression sweep.

| Original AC | This round's required change/check |
| --- | --- |
| AC-1 | C2 informational preference and both directions |
| AC-2 | C2 reverse preference |
| AC-3 | C1/S1 preserve extracted pages/assets |
| AC-4 | C1/S1/S2 history and unaffected content |
| AC-5 | C2 no-op preference |
| AC-6 | C2 unrelated config and journal controls |
| AC-7 | S3 preserve shared admission |
| AC-8 | C2 successful preference UI, existing consent regressions |
| AC-9 | C1/S1 cancellation and existing pre-confirm Cancel |
| AC-10 | C2 next successful Save after unreadable metadata |
| AC-11 | C3 status/library/stage package completeness |
| AC-12 | S1 per-page bad fixed input |
| AC-13 | S1 valid explicit empty control |
| AC-14 | Preserve saved arbitrary-count rendering |
| AC-15 | C1/S1 prior successful/failed-page persistence |
| AC-16 | C1 generation/translation and valid fixed rendering |
| AC-17 | Preserve Dynamic arbitrary counts |
| AC-18 | C2 optional unreadable legacy state |
| AC-19 | C1 fresh DAG; S1/S2 API/queued/targeted/combined callers |
| AC-20 | S2/S4 localized remaining output/diagnostic paths |
| AC-21 | No dependencies or competing subsystems |
| AC-22 | C2 effective preferences/removal/invalid config |
| AC-23 | C2/S3 journal and reader recovery safety controls |
| AC-24 | C1/S1 execution/publication input revalidation |
| AC-25 | S4 bounded20 display and full totals |
| AC-26 | C1 transport cache/retry regression unchanged |


## Frozen remediation candidate

Final production/test head: `1c36d36d3e683546dbea4530bcf4589dab847ebb`. The broad backend/full-suite checkpoint was `8f2954bd8190d3bc04e8d9cc33e5ce5462aaae1e`, preceded by `624d1f31262d65839e62b29dcaed3830b82537b3`. Actual develop and remote PR head were refreshed again on November3: `4b9e40cc185cdbceb3ef248248e440c08f25fa82` and `c71605454126c29f8f6e5dab56ee90385012b886`, respectively, unchanged. Merged/approved SPEC1/2 anchors, integration strategy and recoverable refs remain as recorded in the November2 audit. No remote mutation occurred; proposed later base is develop. Owner draft and tmp remain untouched.

The pre-edit table above is historical. “Fixed” below means a concrete source correction plus the named focused regression, not acceptance based on source alone. Final full-check/browser/platform results are recorded separately when complete. SPEC3 remains in review and ADR025 proposed.

### Feedback-to-fix ledger

| Finding | Correction and regression evidence | Current disposition |
| --- | --- | --- |
| C1 fresh DAG loses successful Sectioning | Publish each page after its own generation/optional translation and existing guarded revalidation. `pipeline-dag-sectioning-publication.test.ts` uses real DAG/storage/LLM transport: translation on/off × later failure/cancel, early page visible during later request, 2/3 actual calls. | Fixed; four focused cases pass. Existing-book resume unchanged/refused. |
| C2 / Claude S5 optional unreadable lifecycle | EACCES/EISDIR project unknown; preserve raw inaccessible bookkeeping and skip its optional update. Genuine config journals remain strict. `sectioning-lifecycle.test.ts` exercises HTTP state and next Save with unchanged histories/evidence. | Fixed; focused cases and genuine-journal controls pass. |
| C3 package file completeness | Shared `packageFilesAvailable` verifies entry/navigation/manifests and actual referenced local scripts/styles, contained regular readable nonempty files. Library/status and build cache reuse the same predicate, independently of source coverage. Shared assets read once per check, not globally cached. | Fixed; actual packaged runtime/entry/CSS/manifest removal and directory replacement are rejected/repaired; later cache reuse and shared-read regression pass. Not a general remote/media/dynamic dependency verifier. |
| S1 fixed false blank success | Validate included image classification against positioned images, preserve readable full-window viewport for scale even when classification fails. Blank requires genuinely empty valid sources. | Fixed; actual SQLite/FS tests cover missing included images with empty, pruned-only or paragraph draw items; valid blank control, prior pair/neighbor retention and 1200-wide unavailable neighbor scale pass. |
| S2 null reset consumers | Glossary/Quiz collectors and direct quiz generation treat authoritative null as inactive; actual malformed active input still validates. | Fixed; reset + real collectors, targeted quiz body/call counts, protected outputs/options and neighbors pass. |
| S3 independent reader refused | Rejected proposed separate shared-reader mode: foreign-process exclusion is the owner's explicitly authorized all-reader lease contract. Same-process published-page reads remain available; no live mutex is reclaimed. | No contract defect. Independent live-reader/recovery regressions retained. Library isolation is separately corrected below. |
| S4 bounded warning lists (Claude raised P3 to P2; retained as external severity) | Combined missing/ownership warning page IDs have a shared20 budget; complete page/section totals and raw warning data retained. | Fixed; >20/duplicates/cross-category tests pass; ten changed strings translated in all five locales. |
| Reset F-H old activity answers attached by position | Include exact selected editable-activity version in replacement consent; reset it transactionally with active HTML/tree, keeping history. PUT requires captured baseVersion. | Fixed; same-index/same-type new tree Preview and actual ZIP no longer use old stepper answers; stale draft409, activity-only consent invalidation and neighbor/history/media checks pass. |
| Reset F-B retained generators lack source warning | Reset now uses shared source-generation before/after tracking in its transaction. | Fixed; actual collector signatures mark retained Glossary/Quiz warnings without rewriting their content. No blanket freshness invalidation. |
| Admission F2/F8 one busy/journal book breaks Library | Recover valid journal through existing writer/recovery; isolate BOOK_BUSY or unsafe-journal card as temporarily unavailable. Preserve strict same-book409 and no fake destructive rebuild flag. | Fixed; independent live SQLite reader, unchanged DB/lease/mutex bytes, unrelated HTTP book, release/next action and valid/conflicting journals pass. |
| Reset F-I semantic edits after fixed rendering | Validate positioned owner domain, leave active fixed HTML/tree pair unchanged while editing semantic tree; retain bounds/version checks. | Fixed; real PDF fixed split/clone/merge/delete, old pair/IDs/assets/neighbors and next targeted render pass. |
| Reset F-E unreadable retained Sectioning silent skip | Report bounded informational warning for retained unreadable records; continue unrelated missing-page generation and combined runs. Persist skipped-step message. Never treat stored invalidation as absence. | Fixed; null/SQL-null/corrupt/invalid retention regressions and missing-only new-page warning test pass. A draft fatal-error implementation was corrected because it would block independent work. |
| Reset F-G mandatory part window | Unknown/invalid/unreadable mandatory `part.json` fails closed with localized SECTIONING_WINDOW_INVALID409; no whole-book fallback. | Fixed; immediate/targeted malformed JSON/schema, zero writes/calls, unchanged raw evidence, explicit fixture repair and next action pass. Existing queued scope guards retained. |
| Publication G aggregate errors unbounded | Per-page detail remains inspectable; aggregate PIPELINE_PAGES_FAILED lists at most20 IDs, full count and allow-listed causes. | Fixed;27 actual render attempts/per-page events,20 aggregate IDs,total27, retained prior output and persisted diagnostic tests pass. |
| Admission F7 doctor wording | Clarify no content repair/provider work; admitted reads may create ownership metadata/current-schema housekeeping. | Corrected documentation; no bypass or lock change. |
| New independent UI recheck findings | Keep exactly one classic/stepper editor session; retain pending whole map/version through reset; freeze asynchronous feedback origin; preserve same-turn and canonical-cleanup successors; net-clean logic respects in-flight saves; Save&leave reuses one promise and retains unsaved barrier. | Fixed;16 combined cases (10 new race,4 existing panel,2 API reset) and24 parent/panel cases pass. Reviewer-designed tests adapted with attribution; bounded frozen rechecks and actual browser follow-ups are recorded below. |

The external reports remain unchanged. Claude's later full-suite execution overlapped root's first new regression drafts in the shared checkout; it is not a pristine910edc27 baseline. Its Darwin `/var` versus `/private/var` temporary-path issue is separately recorded in its execution report. This round pins canonical `/private/tmp` and records exact head/dirty state for each command. No mixed-run failure is silently labeled pre-existing.

### All remaining external source leads

| Lead | Adjudication; no new waiver |
| --- | --- |
| Publication B/C, admission F9 complexity/fsync | Measurement leads without demonstrated material regression; durability/revalidation/ownership checks retained. Shared required-package asset reads are bounded per invocation. Low-end performance is not newly certified. |
| Publication E fixed/reflowable failure-state parity | Both report affected pages and preserve runnable neighbors; the contract does not require identical attempt status or interactive Skip for unrecoverable input. Actual missing-page tests remain mandatory. |
| Publication F repeated null fixed-tree versions | Version noise, no demonstrated unsafe currentness/history loss. Not mislabeled as D4 or a new approved deferral. |
| Reset F-C deactivated output counts as authored | Correct authoritative-empty behavior; changing to legacy fallback would revive historical current input. |
| Reset F-D merge writes new empty rendering | Explicit edit may append empty current rendering; missing coverage remains truthful and old history survives. No positional reuse. |
| Reset F-F inactive version shown in confirmation | Exact selected deactivation version is a real concurrency guard. No safety defect established. |
| Admission F1/F3/F5 interrupted/anonymous/partial ownership | Required fail-closed qualification; raw evidence remains. No timeout deletion or speculative ownership inference. |
| Admission F6 externally deleted owner token | No supported trigger demonstrated. Do not hide evidence tampering or claim a committed operation rolled back. |
| Admission F10 import context | Baseline context, no concrete new failure. No unrelated import redesign. |

The independent triage enumerated **22**, rather than the external summary's stated19, residual leads and adjudicated each. Private `reviews/independent-source-triage.md` preserves the complete source reasoning. All six promoted correction targets from that triage have concrete regressions above; no lead is closed merely by a green total.

### Explicit limits and deferral authority

No new product deferral was introduced. Exact D1–D6/#1039–1044 remain under [SPEC2 owner decision](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220) and [approval](https://github.com/unicef/adt-studio/pull/880#pullrequestreview-5731520149): same-page Sectioning Revert draft; quiz deletion during unresolved Save conflict; saved-empty TOC Run skip; identical AI-edit versions; stale Save-error after Discard; exact adjacent-page phrase. They do not cover the activity draft races corrected here. Optional1045–1048 do not waive required acceptance.

B2/automatic cross-page merge/new fixed editor/page picker/per-page controls/broad existing-book CLI resume and other named exclusions remain exactly bounded by [September30](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5368403884), [October12](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5486273946), and SPEC3. SPEC1 [Note6](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5551228504)/[Note7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170) qualifications remain; later mandatory timing/BookRunProvider corrections are not deferred. The complete exact inventory remains in the November2 audit, with no expansion here.

Default ad-hoc hardened Mac launch and cross-origin SCORM remain **known medium-severity platform findings, not approved deferrals**. Unsigned bundled API success cannot close them. Human SPEC3/ADR approval, assigned private-book/live-provider quality, low-end hardware, full GUI/signed/cross-platform release tests and hosted CI are separate. Hosted exact-head CI cannot run while this round's no-push boundary remains. These limits do not certify a release or permit an unqualified no-known-defects claim.


## Evidence keys for this round

- **N1:** frozen8f full repository pretest/build and501-file/6306-test run; includes E1–E6 named suites from the November2 audit plus new DAG per-page Sectioning, required-package-files, null-reset-reader, fixed-image, Library reader/journal, activity-reset, part-window and aggregate diagnostics regressions. Focused before/after receipts establish the new failures; earlier E/U/P executions are never relabeled.
- **N2:** final Studio/static/i18n commands below, plus actual red/green editor, warning-overlap, parent/view/outer-route tests and independent source rechecks. Full Studio is repeated after the final UI corrections; backend source has not changed since8f.
- **N3:** `results/browser-checks.json`:20 successful jobs at9d before the separate activity probe failed. Four mode/layout journeys, ten slow-second-page first/rerun/failure/Skip/cancel cases, actual CSS/MathML early visibility, four layout switches and the legacy complete/partial/loading job. The later changes affect dirty editor mounting/loading; their focused real-route replays are N4.
- **N4:** `results/browser-routeflow-controls-checks.json`:17 successful jobs at1c36 (includes seed/export jobs). Scoped/all-output failed reset and next Save; successful2→1 removed-section draft; reader contention/optional lifecycle; actual fixed visibility after split; quiz/TOC history/scoring; cosmetic freshness; timing; five-locale errors; book-history ABA; queued stale consent/next confirmation; full structural operations; three combined-stage cases; five-book development export. All130 original physical image/audio bytes compare unchanged. Separate fixture PDF-byte assertions remain in N1; these synthetic UI books do not contain an original PDF.
- **N5:** final platform/compatibility ledger below. Standard app build/runtime is distinct from Linux dependency-carrier tests; unsigned bundled API is distinct from full Electron GUI/release certification.

## Complete original-to-revised and revised acceptance matrices

The product dispositions are unchanged. “Passed locally” applies to the revised functional requirement and the precise evidence/boundary listed. Platform/release verification and explicit deferrals are separate below. Historical E/U/P evidence in the linked November2 audit is not relabeled as freshly executed.

| Original AC | Disposition | Revised requirement | Status / evidence |
| --- | --- | --- | --- |
| AC-1: Dynamic to By Page invalidates Sectioning and every downstream step. | Revised | Preference change is informational; no content freshness or usability invalidation. | Passed revised contract locally — N1 lifecycle; N3 both mode directions; N4 cosmetic and optional lifecycle |
| AC-2: By Page to Dynamic invalidates the same dependency closure. | Revised | Same rule in reverse. | Passed revised contract locally — N1 lifecycle; N3 reverse preference in both layouts |
| AC-3: Extract completion and extracted data remain unchanged. | Retained | Extract is unchanged. | Passed revised contract locally — N1 real PDF exact-byte/source checks; N3 histories; N4 physical media |
| AC-4: Every existing content version and referenced media byte survives a mode change. | Retained | Keep every version and physical asset. | Passed revised contract locally — N1 history/asset regressions; N3/N4 snapshots and130 original media hashes |
| AC-5: Saving an unchanged effective mode causes no invalidation. | Retained | No-op effective preference does nothing. | Passed revised contract locally — N1 lifecycle no-op controls |
| AC-6: An unrelated config edit causes no mode invalidation. | Retained | Unrelated config remains independent. | Passed revised contract locally — N1 adjacent config/cosmetic regression; N4 exact cosmetic freshness |
| AC-7: A mode transition during active/conflicting work returns 409 with no mutation. | Retained with shared guard | Conflicting writer rejects before change; reuse prerequisite admission. | Passed revised contract locally — N1 independent readers/writers/config admission; N4 busy Library and next read |
| AC-8: Studio confirms a transition when retained or completed downstream output exists. | Revised | Mode confirmation explains preference only; replacement has separate default-off consent. | Passed revised contract locally — N2 shared dialog guards; N3 mode/reset UI; N4 combined and queued confirmation |
| AC-9: Cancel leaves configuration unchanged and sends no mutation request. | Retained | Cancel before confirmation changes nothing. | Passed revised contract locally — N2 Cancel controls; N3 actual Cancel; N4 history ABA zero unauthorized calls |
| AC-10: A failed update restores/refetches the persisted selection and surfaces the error. | Retained | Failed save restores authoritative selection and keeps drafts. | Passed revised contract locally — N1 unknown lifecycle plus next Save; N2 persisted config/draft receipt tests |
| AC-11: Successful transitions refresh config, debug config, step and relevant page/stage state. | Revised | Refresh preference diagnostics separately from actual usable-output coverage. | Passed revised contract locally — N1 package required-file/current coverage; N3 legacy; N4 Library/fixed UI |
| AC-12: By Page preflight rejects a missing latest Sectioning result. | Superseded | Missing/unreadable page input is reported per page; other pages render. | Passed revised contract locally — N1 per-page missing/unreadable/part window; N3 layout failure controls |
| AC-13: By Page preflight rejects zero sections. | Superseded | Empty saved trees are valid edits; warn, no count gate. | Passed revised contract locally — N1 valid saved-empty tree and explicit blank fixed input controls |
| AC-14: By Page preflight rejects multiple sections. | Superseded | Multiple saved sections remain renderable in By Page. | Passed revised contract locally — N1 saved arbitrary count and unrelated target; N3/N4 structural UI |
| AC-15: Any preflight failure preserves all rendering versions and starts no rendering call. | Revised | Ordinary runs publish successful pages immediately; failed pages keep prior output. | Passed revised contract locally — N1 immediate paired publication; N3 first/rerun failure/Skip/cancel |
| AC-16: Exactly one valid section per source page permits Storyboard subject to other prerequisites. | Retained and broadened | Render any valid saved tree; enforce count only at generation/cache boundary. | Passed revised contract locally — N1 generation/cache validator and valid saved trees; N3 all layouts/modes |
| AC-17: Dynamic mode continues to accept multiple sections. | Retained | Dynamic accepts multiple or single saved sections. | Passed revised contract locally — N1 Dynamic saved counts; N3 Dynamic lifecycle |
| AC-18: Historical/imported inconsistencies are caught without an observed config transition. | Superseded | Legacy lifecycle is informational unknown, never an initialization gate. | Passed revised contract locally — N1 unreadable optional lifecycle; N3 direct older-book entry; N4 next preference Save |
| AC-19: API, queued, targeted and DAG/CLI paths enforce the same rule, including fixed layout. | Revised, CLI scope deferred | Immediate/queued/targeted/combined app paths share policy; fresh CLI uses valid generation, existing-book resume deferred. | Passed revised contract locally — N1 immediate/queued/targeted/part/fresh DAG; N3 layouts; N4 combined and queued; expanded existing-book resume explicitly excluded |
| AC-20: All new UI copy is translated in the five supported locales. | Expanded | All changed UI and HTTP/SSE errors translate in five locales. | Passed revised contract locally — N2 extraction/strict compile4540messages each, zero missing; N4 actual five-locale HTTP error |
| AC-21: The implementation adds no dependencies. | Retained | No new dependency. | Passed revised contract locally — Final176-path production comparison: no package manifest or lockfile change |
| AC-22: Effective override removal/default resolution is correct; invalid modes change nothing. | Retained | Use effective defaults/override removal; invalid mode changes nothing. | Passed revised contract locally — N1 inheritance/removal/invalid/no-op; N2 Settings receipt controls |
| AC-23: Injected file/DB failures and restart at each journal boundary never expose new mode with old current status. | Revised | Journaled config and atomic reset recovery cannot falsely claim completion. | Passed revised contract locally — N1 journal/process death/reset transaction and recovery regressions; N4 honest reset failure state; N5 restart recorded separately |
| AC-24: Admission races and post-preflight edits cannot publish output based on obsolete configuration or section versions. | Retained | Revalidate exact source/render/config at execution and publication. | Passed revised contract locally — N1 stale source/config/version checks; N4 queued external config and activity-only/removed-owner controls |
| AC-25: Errors contain the full failure count and at most 20 displayed page identities, including malformed/null results. | Revised | Bound informational page diagnostics and per-page missing/error reports with total counts. | Passed revised contract locally — N1 full27-page transport/error totals; N2 shared20 warning budget including category overlap |
| AC-26: Invalid cached multi-section responses follow #692's eviction/retry behavior; valid cache reuse remains possible. | Retained | Keep #692 invalid-cache eviction/retry and valid cache reuse. | Passed revised contract locally — N1 actual cache/backend request counting, invalid eviction/retry and valid reuse |

| Revised criterion | Status | Evidence and boundary |
| --- | --- | --- |
| RAC-1 Generation/cache validation in By Page rejects/retries anything other than one section; valid cache reuse remains unchanged with transport counts. | Passed locally | N1 page-sectioning real transport/cache tests; valid reuse and invalid response retry preserved. |
| RAC-2 Both modes render valid saved trees of any section count, including manual edits, without an unrelated targeted-render blocker. | Passed locally | N1 structural/targeted/fixed tests; N3 both modes; N4 actual split/clone/merge/delete and saved-tree API add. |
| RAC-3 Missing/old lifecycle permits older-book read/render/export without initialization, AI calls on read, content changes or invented provenance. | Passed locally | N1 optional EACCES/EISDIR state and next Save; N3 direct older-book complete/partial/loading, zero read-provider calls. N4 busy book isolation preserves shared ownership safety. |
| RAC-4 Missing/unreadable page input is reported per page; unrelated runnable pages complete in both layouts and active part windows. | Passed locally | N1 missing/unreadable/null inputs, included-image validation, valid empty fixed page, full-window scale and mandatory part-window refusal; N3 failure isolates neighbors. |
| RAC-5 Ordinary Sectioning fills missing pages only; all existing records and unaffected pages/versions/assets remain unchanged. | Passed locally | N1 AI/manual/unknown/empty/unreadable/null retention; N3 ordinary no-op; N4 combined fills only missing page and retains three neighbors. |
| RAC-6 Explicit replacement is default-off, lists exact affected versions, and rejects stale/invalid consent at immediate and queued execution before reset/calls. | Passed locally | N1 exact scope/source/render/activity/tree/config receipts; N2 shared dialog tests; N4 history ABA, queued stale rejection and next deliberate confirmation. |
| RAC-7 Confirmed reset deactivates scoped active Storyboard transactionally, preserves histories/assets and previous authored Sectioning on failed/cancelled generation, and remains truthful after crash/restart. | Passed locally | N1 atomic HTML/tree/activity null selection, real fault/process-death controls and retained failed-page identities; N4 single/all failed reset and next rebuild/Save. |
| RAC-8 Dynamic → By Page and reverse, explicit regeneration → split/add/clone/merge/delete → Storyboard succeeds without positional reuse of old HTML; Cancel changes nothing. | Passed locally | N3 four mode/layout journeys; N4 full structural journey and successful2→1 removed-owner draft, stale409, discard/current rebuild. No historical positional reuse. |
| RAC-9 Fresh and same-layout Storyboard publish each successful page and HTML/tree pair immediately; API and Studio expose the first page while the next is slow. | Passed locally | N1 paired page publication and fresh DAG; N3 first page HTTP200/clickable Studio/MathML/CSS while later page held, both layouts/first and rerun. |
| RAC-10 Later failure, Skip or cancellation keeps published pages and a failed same-layout page's prior output; stale publication changes nothing. | Passed locally | N1 stale publication guards; N3 later failure/Skip/cancel retains successful first and prior failed page, followed by next target. |
| RAC-11 Actual layout switches publish the full active window atomically, including fixed-tree deactivation; partial/targeted/failed switches retain the old layout. | Passed locally | N1 switch publication/revalidation; N3 both directions success/failure, targeted refusal, fixed-tree deactivation and repaired next full run. |
| RAC-12 Partial section patches cannot claim full included-output coverage; reset old HTML/history cannot establish new currentness or package completeness. | Passed locally | N1 partial-target/source coverage plus independent package entry/manifest/page/runtime/CSS checks and repair/cache reuse; N4 reset activity cannot restore old output as current. |
| RAC-13 Preview/export retain usable content regardless of preference/lifecycle, keep inherited owner warnings and genuinely missing-work handling, and agree with library/sidebar/stage coverage. | Passed locally | N1 shared required-package/owner/currentness; N3 older-book saved access; N4 Library/fixed visibility and five actual exports/130 preserved assets. N5 platform coverage is separately reported below. |
| RAC-14 Effective preference changes/removal/inheritance are consistently informational; unrelated/no-op/cosmetic saves preserve content freshness and completed attempts, Extract and bytes. | Passed locally | N1 inherited/no-op/adjacent config and exact PDF bytes; N2 Settings receipts; N3 preference-only zero generation; N4 cosmetic catalog/downstream equality. |
| RAC-15 Shared writer/version guards prevent competing immediate/queued/targeted publication; config journal/reset recovery retains evidence and never deletes ambiguous locks by timeout. | Passed locally | N1 shared all-reader/writer/admission/journal/proven-dead recovery and ambiguous negative controls; N4 independent live reader unchanged DB/lease/mutex, release and next success. N5 Linux/restart is separate. |
| RAC-16 Remaining UI/HTTP/SSE errors and parameters translate in all five locales; obsolete restrictions/errors are removed. | Passed locally | N2 final shared mapper/component tests,4540messages/five locales/zero missing/strict compile; N4 actual localized HTTP errors. Exact D6 phrase remains separately deferred. |
| RAC-17 Fresh CLI/DAG remains safe; expanded existing-book resume is deferred/refused here. No B2 modes, automatic merge, new dependency or competing freshness/lock subsystem. | Passed locally | N1 fresh CLI/DAG publication, AI stamping, transport counts and safe existing-book refusal. Final manifest comparison unchanged; no expanded resume/B2/automatic merge/competing subsystem. |
| RAC-18 Inherited authorship, draft, restore, stable ID/audio/TOC-consent, current-read and scoped cache guarantees survive integration, subject to the explicit legacy-owner qualification. | Passed locally | N1 complete inherited ownership/authorship/restore/current-read/TOC/translation/speech/timing regressions; N2 draft/consent/late-ack controls; N4 real quiz/TOC restore/scoring, timing, cosmetic, ABA, queued and activity draft recovery. Prior separately dated U5/8850-entry experiment remain historical; N5 bounded older-read check reported below. |


## Independent recheck and frozen verification

The independent reviewer rechecked `8f2954bd` against its own original/revised/public-entry map, both complete external reports, and the changed mechanisms. It found no additional material correctness/data-loss/admission/draft defect; its remaining P3 IR-S4-overlap reproduced 40 displayed IDs when the same27 pages appeared in both warning categories. The new committed regression failed before correction (7pass/1fail) and passed afterward (8pass). Commit `9d6cd8e66e4e1352e35a90eb9d10c5df9e41a51a` changes only that formatting helper/test, excluding already-shown IDs from the remaining budget. Independent source/actual-log recheck closed the finding. Reports are retained under private `reviews/8f2954bd/frozen-source-recheck.md` and `reviews/9d6cd8e6/warning-overlap-recheck.md`. This is independent source/evidence review, not independent execution of every writer workload.

At frozen `8f2954bd`, `pnpm test --maxWorkers=2` passed its pretest `pnpm build`, **501 files/6306tests,16 Linux-only skipped**, exit0,714.58s Vitest duration. `pnpm typecheck`, runtime typecheck, Desktop node/web typecheck, Studio build, lint, Lingui extraction and strict compilation all exited0. After the sole final warning helper/test correction, the affected8tests, root typecheck, lint, extraction/strict compilation and Studio build passed again at `9d6cd8e6`. No unchanged full suite was rerun solely to relabel the head. Lint has8warnings/0errors; its full log is byte-identical to the preserved prior verified lint log, recorded in `results/lint-baseline-comparison.json`.

No separate invariant command exists: the available repository invariant tests, static types, lint and final diff checks are used. Canonical disposable TMPDIR, shared acceptance lock, stripped credentials, blocked provider executables and external network guards are recorded in every wrapper receipt. Actual provider/cache assertions count stub transport requests. Historical failed probes and mixed-candidate external runs remain visible, never turned into passes.


### Editor lifecycle corrections and browser attribution

The early browser reset probe did **not** establish that an entered draft was lost on reset. A later instrumented browser replay found the same connected input remained in an inert panel, with zero native input events; directly invoking its handler changed the draft. An early Edit activity click had selected classic presentation before the saved stepper query loaded. The subsequent result hid classic while leaving stepper closed. `55195e0fa64427c9b89c2e24d2bbe3312a496474` waits for saved activity data before selecting the editor or converting; it does not switch an existing dirty session on query refresh. The two added regressions failed before (15 other cases passed), then26 combined parent/race cases passed. Independent source/assertion recheck is clear in `reviews/55195e0f/activity-query-source-recheck.md`; it explicitly corrects the earlier browser causal attribution.

Separate meaningful component regressions established two actual ancestor-lifecycle defects: `StoryboardView.withStaleBanner` changed editor ancestors as coverage changed, and the run-card branch replaced dirty editors after all active HTML was reset. `2592d36660957d9c237fa4037c60d10751be5cd7` keeps the wrapper/content host stable and retains a dirty saved-tree editor. The initial all-reset test had an incomplete StageRunCard mock; corrected exact-old-source reproduction failed on the expected missing-editor assertion, with its clean-editor control passing. Old-source/test provenance and original failed logs remain preserved.

Independent review then identified successful Dynamic2→ByPage1 regeneration removing the focused second section. `d51ef813f40ed0a8f5b2e79bdf7047cb45304ee2` retains a dirty editor's original book/page/index and stable owner/version until discard; it never assigns that draft to the replacement section. Same-identity acknowledgements stay live, discard adopts the latest tree, and cross-book equal-index tests prevent carry-over. Red/green view tests and `reviews/d51ef813/removed-section-source-recheck.md` support the correction. At d51 the entire Studio suite passed165files/1238tests, with root typecheck, lint, extraction, strict compile and Studio build passing. Later551 changes have their focused checks above; final affected checks follow separately.

Preserved probe/setup errors are not product passes: a strict400 for display-only pageNumber in consent; missing outline before controlled provider failure; polling that ended before six configured retry attempts; attempting the next activity edit before rebuilding absent Storyboard; and a sparse fixture config Save that replaced its own no-refinement settings. Fresh fixture labels and corrected receipt/config shapes are used for subsequent replay. None overwrites earlier evidence or original books. The browser source and results, including entered-draft assertions before reset, determine final acceptance below.


The first entered-draft all-page browser replay then found the outer `StoryboardIndex` could still replace the entire view with its landing page. This was a confirmed public-route defect, unlike the earlier inert-input probe. `1c36d36d3e683546dbea4530bcf4589dab847ebb` retains the selected dirty route through reset and returns to normal landing behavior on discard. Its Index+View regression failed before on the missing editor (12 controls passed) and22 view/feedback cases passed after. Independent source/assertion recheck is clear in `reviews/1c36d36d/outer-route-source-recheck.md`.

Actual browser replay at1c36 now passes both single/all-page explicit failed reset (browser editing plus a competing public HTTP reset, not an additional UI confirmation-dialog replay): native title edit in a non-inert panel → reset → retained title/old guard → stale PUT409 → discard → deliberate activity rebuild and Storyboard regeneration → next browser PUT200. The successful Dynamic2→ByPage1 case also retains the removed second-section draft and old identity/version, rejects stale Save, then discards/rebuilds/renders current output without old answers. Histories and neighboring Sectioning remain unchanged. See `browser-activity-reset-routeflow-{single,all}.json` and `browser-activity-removed-section.json`.


## Final affected development commands

At `1c36d36d3e683546dbea4530bcf4589dab847ebb`, `pnpm exec vitest run --project studio --maxWorkers=2` passed **165 files / 1,241 tests**, exit0,75.87s. `pnpm typecheck`, `pnpm --filter @adt/runtime typecheck`, `pnpm --filter @adt/desktop typecheck`, `pnpm lint`, `pnpm --filter @adt/studio extract`, `pnpm --filter @adt/studio exec lingui compile --strict`, and `pnpm --filter @adt/studio build` all exited0. Extraction reports4540messages per locale and zero missing translations. No catalog drift remains. `results/last-affected-checks.json` and `logs/last-*.json` preserve exact commands/heads/dirty state/timing. Full repository source/build verification remains the8f checkpoint; later production corrections are confined to Studio and have the full affected sweep above, not an invented new repository total.


## Consolidated review scenarios and feedback closure

| Scenario | Current result and evidence |
| --- | --- |
| 1 Generation/cache one-section validation | Passed — N1 real backend/cache/retry counts; no saved-count gate restored. |
| 2 Saved manual sections and unrelated targets | Passed — N1 structural/targeted tests, N3 modes/layouts, N4 actual complete structural journey. |
| 3 First published page available during a slow next page | Passed — N1 paired transaction/event tests, N3 actual HTTP/Studio/MathML/CSS in both layouts and first/rerun. |
| 4 Later failure/Skip/cancel and atomic layout switch | Passed — N1/N3 preserve successes/prior failed page and failed-switch old layout; next successful action verified. |
| 5 Both mode directions, explicit reset, history, split and Cancel | Passed — N3 four journeys, N4 complete structural/reset and entered-draft cases. |
| 6 Older books and independently unreadable inputs | Passed — N1 strict required inputs versus optional unknown lifecycle; N3 direct saved-tree entry; N4 unavailable Library book isolated. |
| 7 Partial work and old package cannot falsely complete | Passed — N1 actual package corruption/cache repair and owned coverage, N4 reset/Preview/export. |
| 8 Ordinary missing-only versus exact explicit replacement | Passed — N1 stored record variants and consent; N4 ordinary/replace/race combined runs, queued rejection and next confirmation. |
| 9 Versions/recovery/editability/status/localization | Passed development — N1/N2/N4 real history/reader/draft/localization; N5 platform results are separately stated. |

| Feedback | Correction/reverification | Status |
| --- | --- | --- |
| Critical A | Arbitrary valid saved section count; scoped target independent of neighbors. N1/N3/N4. | Passed locally |
| R1 | Owned source coverage plus shared required-package file validation; C3 supplies the previously missing runtime-file proof. N1. | Passed locally |
| R2 | Current null/reset selections dominate history; optional lifecycle cannot revive output; reset also deactivates old activity answers. N1/N4. | Passed locally |
| R3 | Informational preference versus usable coverage/catalog; unreadable optional metadata unknown, busy book neutral, independent books visible. N1/N3/N4. | Passed locally |
| R4 | Shared localized HTTP/SSE/poll/task mapping, five locales, actual browser errors. Exact approved D6 remains distinct. N2/N4. | Passed within exact approved D6 qualification |
| R5 | Ordinary paired per-page publication/early click, both layouts/first and rerun; later failure/Skip/cancel retained. N1/N3. | Passed locally |
| R6 | Pre-edit owner resolver, inactive output, fixed semantic-edit projection and preserved activity/history; all structural operations and next render. N1/N4. | Passed locally |
| F1 | Unrelated retained owner cannot be assigned by position; current pointer/identity regressions retained. N1/N4. | Passed locally |
| F2 | Committed-page refresh bypasses throttling; async fixed boundary plus real early CSS/MathML visibility. N1/N2/N3. | Passed locally |
| F3 | Fresh reflowable Storyboard DAG publication retained; C1 additionally closes per-page Sectioning publication across dependent failure/cancel. N1. | Passed locally |
| F4 | Full totals,20 combined display budget with overlapping warning categories and27-error transport aggregation. N1/N2. | Passed locally |
| F5 | Known codes mapped; unknown provider detail inspectable; actual five-language HTTP path. N1/N2/N4. | Passed locally |
| F6 | Old partial package/file deletion cannot imply full package; safe rebuild/cache checks share the same predicate. N1. | Passed locally |
| F7 | Missing image positioning/classification/viewport is not blank; valid empty control; common full-window scale survives bad neighbor. N1/N3. | Passed locally |
| F8 | Legacy complete/partial/loading paths retain usable content; no false cancellation message, no unsafe Extract. Busy Library and dirty route corrections extend concrete coverage. N1/N2/N3/N4. | Passed locally |
| Fixed/credentials/PDF/current-version feedback | Real fixed target, common width, no unused credential/refinement, exact PDF bytes and own committed-version responses retained. N1. | Passed locally |
| Settings/failed/queued/book ABA feedback | Shared authoritative config receipts and fresh scoped consent; component races plus actual history and queued next action. N1/N2/N4. | Passed locally |
| Shared locking / narrower CLI scope | Existing all-reader protocol retained, no parallel lock; supported fresh CLI/DAG only and conservative unsupported resume refusal. N1; N5 Linux/restart results below. | Passed supported contract; ambiguous legacy ownership remains fail-closed |

## SPEC-0001/0002 overlap audit after remediation

The original actual old-prerequisite→develop inventory remains in the November2 audit and private plans. This round modifies the shared boundaries identified by the new reports without replaying obsolete ancestor implementations. Current approved prerequisite metadata remains intact.

| Inherited contract | Current evidence and qualification |
| --- | --- |
| Server-owned authorship, protection units and raw legacy metadata | N1 full preservation/catalog/manual-survival suites; no user-controlled authorship or normalization of untouched legacy groups introduced. Translation entry, quiz, whole Sectioning page and whole TOC remain distinct. |
| Current-pointer/null semantics and provenance-preserving restore | N1 reset collector/targeted quiz and storage/history suites; null is inactive, not missing/history fallback. N4 authored quiz/TOC restore→next guarded Save. |
| Stable IDs, rendered/activity/answer ownership and physical assets | N1 pre-edit full-claimant/fixed structural/PDF tests; exact activity reset/version guards plus actual new-tree Preview/ZIP; N4 stable old histories and130 physical media hashes. Contradictory ownership remains omitted with warning, retained raw/history/assets. |
| Catalog signatures, source notices, cosmetic freshness | N1 shared catalog/freshness/generator tests; reset uses existing source-generation tracking; N4 color-only Save keeps exact catalog summary/downstream versions and zero provider calls. |
| Scoped translation windows/cache/cost/request accounting | N1 inherited translation/window/current-skip suites; skipped work is not a cache hit. The prerequisite8850-entry/177-window experiment and prior U5 browser recovery remain dated evidence, not newly rerun performance/quality claims. |
| Quiz scoring/grouping, TOC identity/destinations/same-run consent | N1 inherited batching/identity/protection/same-run external-writer controls; N4 actual correct/incorrect scoring, authored unavailable heading and restored next Save. Reset new source warnings do not rewrite protected content. |
| Whole-page Sectioning and AI Revert | N1/N4 missing-only policy applies even to existing AI/restored AI; explicit reset remains the reviewed exception. D1 remains exactly deferred. |
| Drafts, delayed acknowledgements, successor edits, book/scope consent | N1/N2 shared Settings/translation/TOC/timing/quiz guards; N4 actual ABA and queued consent; new activity feedback/save/cleanup/pending guards and public-route failed/successful reset recovery. No numeric cross-book consent or positional reassignment. |
| Speech, audio history and timing | N1 merged fallback/cache/namespace/receipt/draft tests; N4 consecutive actual timing Saves and reload; physical bytes checked separately. No live provider quality claim. |
| Reader/writer recovery and supported processes | N1 real independent live/dead processes, configuration/reset faults and ambiguous evidence controls; N4 live reader leaves DB/lease/mutex bytes unchanged and next action succeeds. No unsupported old/raw simultaneous-access claim. N5 Linux proof is distinct from app packaging. |
| Sharing/comments/other upstream overlaps | Final comparison retains upstream-only blobs except documented relevant corrections; N1 entire repository suite and N2 feedback navigation tests. No public deployment/cross-origin certification. |
| Older build readability | N5 actual built old baseline four-unit Save/read/package/current reopen; excludes old editing/reruns/concurrency and uncertified pre-schema14 repair. |

No D1–D6, optional1045–1048, B2, broad resume, fifth preservation slice or unrelated platform redesign was silently promoted or waived. A failed harness does not constitute baseline proof; each concrete new defect above has its own before/after evidence.


## Platform verification ledger

Unsigned Mac arm64 Desktop build at1c36 passed in20.49s using Node24.13.0, disabled signing/notarization and the actual unpacked package. Bundled API/WASM plus prompts/templates/assets/config hashes match the tested build. Its actual Node API generated both layouts and exported five isolated books before/after restart: **392 ZIP members byte-identical**, current/history/Preview equal, **130 original media files unchanged**, zero new provider calls. This verifies the bundled API/resources, not full Electron GUI, hardened launch or a signed installer. `desktop-final-runtime-provenance.json`, `desktop-final-transport-counts.json` and `logs/desktop-runtime-final.log` retain the proof.

The first standard combined Docker build at1c36 passed application compilation but failed the Playwright Debian dependency installation with invalid repository signatures. The actual VM filesystem was100% full (140GB total/134GB used/0 available). No signature validation was disabled. The owner's previously authorized `docker image prune --force` reclaimed0B because no dangling images existed; inventories prove all tagged images, containers and volumes unchanged. `results/docker-dangling-cleanup.json` and the original `docker-build-app.log` retain evidence. Permission to reclaim unused build cache is pending at this checkpoint; Docker build/runtime is not yet a pass or an approved product deferral. Linux admission and bounded old-build compatibility were checked independently; their passing results follow.


The independent Linux admission run at1c36 passed **5files/67tests**, including all16 Linux tests skipped on Darwin in the full host suite. Current source/dist were mounted read-only into dependency carrier `adt-spec0002-claude:settings-checks`; the root manifest, all packages/* manifests, only Docker-present apps/* manifests, and the complete lockfile were compared before execution. This is a real independent-process Linux safeguard check, not a substitute for the blocked standard app image. `linux-overlay-provenance.json` and `logs/linux-admission-final.log` preserve image/source provenance.

Bounded compatibility also passed at1c36. All1822 tracked blobs of old baseline `ef31494dc2951b92222c473960fecee2d91f9544` were verified; its API/runtime was rebuilt, then four current entity saves were read/previewed/exported by the separate older API and reopened by current code with authorship, IDs and all history unchanged. `results/compatibility-reviewed.json` records all four commands/exit0; disposable copies remain under `compatibility-books/`. This is old-build **readability only**, never old-build editing/reruns/concurrent-reader safety.


| Verification / acceptance gate | Status at final local source checkpoint | Precise limit |
| --- | --- | --- |
| Revised B1 functional automation/browser | Passed locally | N1–N4; original AC disposition is retained, not old hard-block acceptance. |
| Unsigned Desktop build/bundled API/resources | Passed | Node-hosted bundled API, both layouts/export/restart; not full Electron GUI. |
| Linux reader/admission/recovery | Passed |67 tests, current source/dist with verified dependency carrier; not standard app packaging. |
| Old-build four-unit read/Preview/export/current reopen | Passed | Readability only, no editing/reruns/concurrency. |
| Standard combined Docker app build | Failed — environment | VM disk full; Debian dependency signature check failed. No security validation bypass. |
| Current standard Docker runtime/export/restart | Not run | Current app image unavailable; old image success is historical, not a substitute. |
| Exact-head hosted CI | Not run | Explicit current no-push authorization; existing CI certifies another head. |
| Full GUI/hardened Mac/signed/cross-platform release | Not run here; known platform findings retained | Default ad-hoc hardened Mac launch and cross-origin SCORM remain named medium-severity findings, not approved deferrals. |
| SPEC3/ADR025 human approval/private-book/provider quality | Pending/not run | Implementation authorization is not approval or release/quality certification. |

## Integration, local commits and present recommendation

Live read-only refresh again confirms develop `4b9e40cc185cdbceb3ef248248e440c08f25fa82`, PR884 remote `c71605454126c29f8f6e5dab56ee90385012b886`, actual branch `spec/708-sectioning-mode-lifecycle` and base `spec/736-manual-edit-preservation` unchanged. PR title/body/reviews/issues were not mutated. Proposed later remote base remains develop. The inherited old27-commit/125-path net increment was reconciled as documented in the November2 audit; no ancestor replay or descendant merge occurred. Current develop is an ancestor. Five `backup/spec-0003-nov02-*` refs preserve local/remote/old prerequisite/develop and pre-doc-refresh checkpoints.

The current production diff has176 paths;778 upstream-only paths remain exactly develop, with26 upstream-only paths carrying individually documented relevant integration/safety/test corrections. No manifest or lockfile changed. `results/graph-final-production.json` lists the paths/refs and exact owner draft hash `ee0f3e2c78365841c337aaca7efcd3d9edc83940bd01780af7c84e278aba2861`. Owner tmp and unrelated checkout work remain untouched. This audit adds one documentation path when committed.

| Local remediation commit | Purpose |
| --- | --- |
|624d1f31| Per-page fresh DAG Sectioning and optional unreadable lifecycle. |
|8f2954bd| Package integrity, fixed inputs, reset consumers/activity ownership, Library isolation, draft guards and localized diagnostics. |
|9d6cd8e6| Shared20 warning display budget across overlapping categories. |
|2592d366| Stable editor ancestors and dirty all-output reset view. |
|d51ef813| Removed-section draft retains original identity/version, not replacement ordinal. |
|55195e0f| Await saved activity query before choosing classic/stepper editor. |
|1c36d36d| Keep selected dirty editor mounted through the outer Storyboard route. |

The revised **functional B1 contract is implemented within its explicit documented qualifications**, and the two external reports' material in-scope counterexamples have fixes/regressions and bounded independent rechecks. This is not an assertion that every possible race or private book is covered. The complete requested verification round is **not yet finished**: current standard Docker build/runtime remains open pending disk cleanup authority. Official review of the local implementation can inspect the evidence now; an unqualified fully-tested/publication-ready recommendation is withheld until that gate is resolved. No missing implementation is disguised as B2, a platform gap, a generic blocked label or a newly invented deferral.

SPEC0010 must consume the reviewed final ancestor and current shared all-reader admission, extraction/source receipts, active-output reset and current-version ownership rules. Do not reintroduce old writer-only recovery, positional ownership or unsupported broad resume through a descendant merge. Publication/retargeting/review requests remain prohibited in this round. The previously named explicit deferrals and platform findings remain separate from this completed functional remediation.


Final bounded independent recheck is complete at1c36: `reviews/1c36d36d/final-evidence-recheck.md`, with `artifact-byte-comparison.json`. The separate reviewer found no new material functional/evidence defect after inspecting the actual native draft journeys, screenshots, retained histories, allfive Desktop ZIP pairs/392 member bytes,130 media hashes, current/history/catalog/Preview JSON, exact final checks, Linux provenance and older-build receipts. It did not rerun the writer's runtime workloads. It explicitly withholds unqualified all-platform/publication readiness while current standard Docker remains failed/not run. Its wording corrections about inert-input attribution, competing HTTP reset versus UI confirmation, and Linux manifest-comparison scope are incorporated above.
