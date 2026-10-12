# SPEC-0003 product-review reconciliation — 2026-10-12

Prepared before spec/runtime edits at `a5670d46`. Prerequisite `09f0d1c7` (runtime `7b53e448`), including SPEC-0001 `aefe4185`; develop `410d4b2f`. Original SPEC-0003 increment is `373619dd..a5670d46` (21 commits); the new prerequisite rewrote its ancestors, so the merge-base is not the replay boundary. Reviews [5486273946](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5486273946) and [5368403884](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5368403884) were read in full. Latest review supersedes incompatible active coexistence. The original preparation map below was written before editing. The final evidence and outcomes appended below supersede its planned verification; formal approval remains pending.

## Original acceptance mapping

Original wording is retained verbatim here; superseded blocking tests do not certify the new contract.

| Original AC and requirement | Disposition | Revised contract | Entry points and verification | Final mapped evidence |
|---|---|---|---|---|
| AC-1: Dynamic to By Page invalidates Sectioning and every downstream step. | Revised | Preference change is informational; no content freshness or usability invalidation. | Mode PUT/inherited config → state/readers; content, attempt records and hashes unchanged. | **Passed for mapped contract** — RAC-14; E2/E7. |
| AC-2: By Page to Dynamic invalidates the same dependency closure. | Revised | Same rule in reverse. | Reverse PUT/removal of override and external defaults; all status consumers agree. | **Passed for mapped contract** — RAC-14; E2/E7. |
| AC-3: Extract completion and extracted data remain unchanged. | Retained | Extract is unchanged. | Compare Extract runs, PDF/image bytes, page identities in all transition/reset cases. | **Passed for mapped contract** — RAC-14/18; E2/E3/E10. |
| AC-4: Every existing content version and referenced media byte survives a mode change. | Retained | Keep every version and physical asset. | Real SQLite/history/filesystem snapshots before/after saves, resets and recovery. | **Passed for mapped contract** — RAC-7/14; E2/E5/E8. |
| AC-5: Saving an unchanged effective mode causes no invalidation. | Retained | No-op effective preference does nothing. | No-op PUT, no provider calls or new entity versions. | **Passed for mapped contract** — RAC-14; E2. |
| AC-6: An unrelated config edit causes no mode invalidation. | Retained | Unrelated config remains independent. | Adjacent config saves; cosmetic HTML Save preserves catalog freshness/attempts. | **Passed for mapped contract** — RAC-14/18; E2/E9. |
| AC-7: A mode transition during active/conflicting work returns 409 with no mutation. | Retained with shared guard | Conflicting writer rejects before change; reuse prerequisite admission. | HTTP/queued/independent-process writer races, 409 and unchanged snapshots. | **Passed for mapped contract** — RAC-15; E2/E8. |
| AC-8: Studio confirms a transition when retained or completed downstream output exists. | Revised | Mode confirmation explains preference only; replacement has separate default-off consent. | Mounted dialog/browser mode cancel/confirm, named Sectioning and render snapshots. | **Passed for mapped contract** — RAC-6/14; E7. |
| AC-9: Cancel leaves configuration unchanged and sends no mutation request. | Retained | Cancel before confirmation changes nothing. | No HTTP mutation/provider call; exact stored state unchanged. | **Passed for mapped contract** — RAC-6/8; E7/E13. |
| AC-10: A failed update restores/refetches the persisted selection and surfaces the error. | Retained | Failed save restores authoritative selection and keeps drafts. | HTTP failure/stale query/navigation component tests. | **Passed for mapped contract** — RAC-14; E7. |
| AC-11: Successful transitions refresh config, debug config, step and relevant page/stage state. | Revised | Refresh preference diagnostics separately from actual usable-output coverage. | Library/sidebar/stage/preview/export after inherited and direct saves. | **Passed for mapped contract** — RAC-12/14; E6/E7. |
| AC-12: By Page preflight rejects a missing latest Sectioning result. | Superseded | Missing/unreadable page input is reported per page; other pages render. | Mixed real-storage API/queued run; missing page retained, successful neighbor published. | **Passed for mapped contract** — RAC-4; E3/E4. |
| AC-13: By Page preflight rejects zero sections. | Superseded | Empty saved trees are valid edits; warn, no count gate. | Delete-last in By Page, empty-page reporting and unrelated targeted rendering. | **Passed for mapped contract** — RAC-2/12; E5/E6. |
| AC-14: By Page preflight rejects multiple sections. | Superseded | Multiple saved sections remain renderable in By Page. | Split/add/clone/merge saves → actual full/targeted rendering. | **Passed for mapped contract** — RAC-2; E3/E4/E5. |
| AC-15: Any preflight failure preserves all rendering versions and starts no rendering call. | Revised | Ordinary runs publish successful pages immediately; failed pages keep prior output. | Slow second page, API availability; failure/Skip/cancel; per-page rollback. | **Passed for mapped contract** — RAC-9/10; E4/E10. |
| AC-16: Exactly one valid section per source page permits Storyboard subject to other prerequisites. | Retained and broadened | Render any valid saved tree; enforce count only at generation/cache boundary. | Fixed/reflowable one/multiple sections; retain HTML/reading-order validators. | **Passed for mapped contract** — RAC-1/2; E1/E3/E4. |
| AC-17: Dynamic mode continues to accept multiple sections. | Retained | Dynamic accepts multiple or single saved sections. | Generation and saved-tree rendering regressions. | **Passed for mapped contract** — RAC-2; E3/E4. |
| AC-18: Historical/imported inconsistencies are caught without an observed config transition. | Superseded | Legacy lifecycle is informational unknown, never an initialization gate. | Older fixture opens/renders/exports without bookkeeping run; zero calls for read/reuse. | **Passed for mapped contract** — RAC-3/13; E6/E7/E9. |
| AC-19: API, queued, targeted and DAG/CLI paths enforce the same rule, including fixed layout. | Revised, CLI scope deferred | Immediate/queued/targeted/combined app paths share policy; fresh CLI uses valid generation, existing-book resume deferred. | Public API/worker/DAG fresh-book tests; existing CLI safe refusal before mutation/calls. | **Passed for mapped contract** — RAC-4/17; E3/E4/E13. |
| AC-20: All new UI copy is translated in the five supported locales. | Expanded | All changed UI and HTTP/SSE errors translate in five locales. | Error-code/parameter mapper tests, extraction, strict compile, browser. | **Passed for mapped contract** — RAC-16; E7/E13 + locale checks. |
| AC-21: The implementation adds no dependencies. | Retained | No new dependency. | Manifest/lock diff against refreshed prerequisite. | **Passed for mapped contract** — RAC-17; empty package/lock diff. |
| AC-22: Effective override removal/default resolution is correct; invalid modes change nothing. | Retained | Use effective defaults/override removal; invalid mode changes nothing. | Real config resolver and PUT validation. | **Passed for mapped contract** — RAC-14; E2. |
| AC-23: Injected file/DB failures and restart at each journal boundary never expose new mode with old current status. | Revised | Journaled config and atomic reset recovery cannot falsely claim completion. | Injected failures, process death/reopen; ambiguous SQLite mutex retained, no timeout deletion. | **Passed for mapped contract** — RAC-7/15; E2/E8. |
| AC-24: Admission races and post-preflight edits cannot publish output based on obsolete configuration or section versions. | Retained | Revalidate exact source/render/config at execution and publication. | Stale confirmation, queued edits, external writer and late result rejection. | **Passed for mapped contract** — RAC-6/10/15; E3/E4/E8. |
| AC-25: Errors contain the full failure count and at most 20 displayed page identities, including malformed/null results. | Revised | Bound informational page diagnostics and per-page missing/error reports with total counts. | Malformed/null/empty/multiple mixed pages, >20 identities; translated reports. | **Passed for mapped contract** — RAC-4/16; E4/E13. |
| AC-26: Invalid cached multi-section responses follow #692's eviction/retry behavior; valid cache reuse remains possible. | Retained | Keep #692 invalid-cache eviction/retry and valid cache reuse. | Actual stub transport and filesystem cache counts; generation validator unchanged. | **Passed for mapped contract** — RAC-1; E1. |

## Pre-edit feedback map

| Feedback | Current behavior at original head | Required correction and evidence |
|---|---|---|
| Critical A | Shared persisted preflight rejects intentional multi-section By Page trees, including unrelated targeted work | Remove cardinality/lifecycle admission; retain generation validator and schema/HTML validators. Full and targeted split/add cases. |
| R1 | Publication clears whole-book pending using page IDs, not included-section coverage | Derive actual safe rendered ownership/coverage; partial patch cannot complete Storyboard/package. Public status, output and package readers agree. |
| R2 | First lifecycle record can legitimize retained old HTML | Explicit reset deactivates active HTML/tree independently of lifecycle metadata; history never counts as new output. |
| R3 | External/inherited modes disagree with done status | One informational preference projection; no lifecycle masking of content/attempt state or preview/export. |
| R4 | HTTP/SSE messages bypass localized mapping | Structured remaining codes/parameters and common Studio translation; remove obsolete errors. |
| R5 | All output staged until final all-success publication | Ordinary per-page atomic publication; slow page API/browser evidence, failure/Skip/cancel persistence. Whole-window atomic publication only for actual layout switch. |
| R6 | Structural operations shift old rendering indexes against new semantic tree | Explicit reset plus stable-owner projection for structural operations; split/clone/merge/delete retain history/bounds. |
| Older books / output gates | Missing lifecycle and mode/provenance block usable books | Remove mode-only gates. Keep inherited unresolved-owner omission/warnings and genuinely missing-output handling. |
| Ordinary Sectioning | AI pages regenerated implicitly | Shared page selection fills missing only; explicit named/versioned reset/replacement, default off. API/queued revalidation; unaffected pages identical. |
| Locking | SPEC-0003 duplicates checks and extends existing CLI scope | Reuse base shared writer guard, narrow redundant checks; defer added existing-book resume. No unsafe in-process substitute for supported cross-process writers. |
| Reset versus preservation | Base retains fixed HTML/tree even after new Sectioning | Explicit reset consent commits deactivation before generation; authored Sectioning remains current on failure; history/assets recoverable. No ordinary reset. |

## Final evidence register

Implementation checkpoints: `c23f185928be91f7c7ca033c4e3fa61e9f137f0b`
(backend/publication) and `5a9f9b48a21ca9a5e6dd8d0ec3752e914393d28f`
(final Studio correction). Subsequent evidence-only commits do not change runtime.
Prerequisite remains SPEC-0002 `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89`.
Formal spec/ADR approval remains pending; unchecked spec boxes are not fabricated
human acceptance. The statuses below are engineering verification of the authorized
revised contract, not retroactive satisfaction of superseded original requirements.

| Evidence | Public behavior and concrete checks |
|---|---|
| E1 | [By Page cache transport regression](../../packages/pipeline/src/__tests__/page-sectioning.test.ts): real LLM client/cache, provider transport call counts, invalid cached/live multi-section retry, valid reuse; #692 validator preserved. |
| E2 | [Lifecycle/config API tests](../../apps/api/src/services/sectioning-lifecycle.test.ts): both directions, override removal/default inheritance, invalid/no-op/adjacent saves, exact state/history retention, journal faults and recovery. |
| E3 | [Existing-book integration](../../apps/api/src/services/sectioning-existing-book.test.ts) and [worker tests](../../apps/api/src/services/sectioning-preflight-runners.test.ts): immediate, queued, combined, fixed/reflowable and persisted part windows; missing-only selection; explicit scoped exact-version consent and failure safety. The historical test filename no longer means cardinality preflight. |
| E4 | [Storyboard publication](../../apps/api/src/services/storyboard-publication.test.ts), [targeted fixed](../../apps/api/src/services/sectioning-targeted-fixed.test.ts), [targeted page service](../../apps/api/src/services/page-edit-service.test.ts): actual SQLite page-pair commits, missing/unreadable input isolation, slow/fail/Skip/cancel, stale sources/config/output, actual-layout-switch atomicity, returned current version after restore. |
| E5 | [Manual-edit survival](../../apps/api/src/routes/manual-edit-survival.test.ts) and independent structural probes: reset followed by split/clone/merge/delete, known reordered owners, unrelated contradictory owners, JSON-null inactive rendering, stable IDs/history/assets/TOC consent. |
| E6 | [Book routes](../../apps/api/src/routes/books.test.ts), [package routes](../../apps/api/src/routes/package.test.ts) and independent actual GET probes: partial/reset/empty coverage, retained complete bundle versus partial manifest, required HTML-file membership, owner warnings and usable preview/export. |
| E7 | [Mode confirmation](../../apps/studio/src/hooks/use-sectioning-mode-confirmation.test.tsx), [versioned replacement dialog](../../apps/studio/src/components/pipeline/components/LandingPageShell.authorship.test.tsx), [retained run hook](../../apps/studio/src/hooks/use-book-run.retained.test.tsx), [Storyboard availability](../../apps/studio/src/components/pipeline/stages/storyboard/StoryboardAvailability.test.tsx), [sidebar](../../apps/studio/src/components/pipeline/StageSidebar.test.tsx): cancel/no mutation, adjacent config saves, immediate committed-page refresh, partial coverage, old-book entry path and translated retained-output status. |
| E8 | [Writer recovery](../../packages/storage/src/__tests__/book-writer-recovery.test.ts), [sectioning writer](../../packages/storage/src/__tests__/sectioning-book-writer.test.ts), and [real reset process probe](../../scripts/probes/spec-0003-reset-recovery.mjs): independent processes, injected rollback, SIGKILL inside/after reset, recoverable committed reset, anonymous mutex evidence retained and writes refused. |
| E9 | Inherited authored-output/catalog/translation/quiz/TOC/current-read/audio/cache suites plus `scripts/probes/spec-0002-compatibility.mjs`: current Save → pre-change API read/preview/export → current reopen; authorship, IDs and histories unchanged. This does not certify old-build edits or reruns. |
| E10 | Real browser and local HTTP over actual two-page extraction from `tests/fixtures/raven.pdf`; controlled provider fetch boundary, no paid calls. First generation page 1 is clickable while page 2 is held. Ordinary rerun exposes page 1 v2; UI Cancel and late provider release leave page 1 v2 and page 2 v1. API preference → retained ordinary Sectioning (zero additional transport calls) → exact reset → split → Storyboard → preview/package succeeds in both layouts. Each compares 13 original PDF/image assets unchanged. |
| E11 | Standard combined `Dockerfile --target app`, real bundled API/nginx, both-layout positive workflow, actual Webpub ZIP manifest/href verification, container restart and exact page/history/source-asset comparisons. |
| E12 | macOS arm64 unpacked Desktop build; actual bundled API/WASM/prompts/templates/assets under Electron utilityProcess with the production accessibility IPC bridge, both layouts, real exports and API-process restart. This is separate from full application GUI/signing/notarization or Windows/Linux release certification. |
| E13 | [Separate reviewer report](spec-0003-independent-review-2026-10-12.md), [own original-AC map](spec-0003-independent-requirements-2026-10-12.md), [counterexamples](spec-0003-independent-findings-2026-10-12.md): 214 backend/integration/UI-hook tests at c23, then 43 affected UI tests at 5a9f9b48, all passing; no unresolved material finding. The counts overlap repository tests and are not added to the full-suite total. |

![Page 1 v2 is available while the second page is still running.](assets/spec-0003-oct12-incremental.png)

The screenshot records the earlier incremental-publication check. The later F8
status correction is verified by independent component regressions; it is not
visually certified by this screenshot.

## Feedback-to-fix outcomes

| Feedback | Implemented correction | Verification / status |
|---|---|---|
| Critical A | By Page count enforced only on generation/cache. Saved manual sections and unrelated targeted pages render freely. | **Passed**, E1/E3/E4/E5 |
| R1 | Derive included-section coverage from current safe-owned HTML/tree; check actual package manifest membership and files too. A targeted patch cannot complete an incomplete book or old partial package. | **Passed**, E4/E6/E7; independent F6 |
| R2 | Reset appends inactive HTML/tree before generation regardless of old lifecycle metadata. Old history cannot establish current output. | **Passed**, E3/E4/E5/E8 |
| R3 | Preference status remains informational; external/inherited settings, UI attempt state and actual output availability are distinct. | **Passed**, E2/E6/E7; final F8 |
| R4 | Shared code/parameter translation covers HTTP, SSE, polling/reconnect, decision dialogs and tasks. Obsolete restriction errors removed; all five catalogs translated/strictly compiled. | **Passed**, E7/E13 plus locale commands below |
| R5 | Publish each ordinary successful page's HTML/tree pair immediately; committed-page events bypass the progress throttle. Fresh CLI uses the same publication point. | **Passed**, E4/E7/E10; F2/F3 |
| R6 | Reset old active output; project only verified current stable owners before structural edits. Split/clone/merge/delete keep bounds and never guess historical ownership. | **Passed**, E3/E5/E10; F1 |
| Older books / preview / export | No lifecycle initialization or mode gate; saved trees can dispatch Storyboard without replaying Extract. Usable retained output remains accessible. | **Passed with legacy-owner qualification**, E6/E7/E9/E10 |
| Ordinary Sectioning | Missing-only selection includes zero-section, AI, manual, unknown and unreadable existing records in preservation. Replacement consent is explicit and versioned. | **Passed**, E3/E5/E7 |
| Locking / CLI scope | Remove redundant SPEC-0003 gating, preserve base cross-process writer ownership and journal safety; fresh CLI supported, broad existing-book resume deferred. | **Passed**, E8/E13; no competing lock or timeout deletion |
| Reset / protected preservation | Consent names affected semantic and HTML/tree versions. Atomic reset is the committed user action; subsequent failed generation retains authored Sectioning/history/assets, leaving output visibly missing. | **Passed with documented crash qualification**, E3/E5/E8 |
| Independent F4/F7 | Bound aggregate diagnostics to 20 IDs plus total; reject missing/unreadable positioned extraction or image classification instead of publishing a blank fixed page. | **Passed**, E4/E13; restoration qualification below |
| Independent F5/F8 | Complete remaining error presentation paths; missing-work banner uses coverage, not attempt state. Older/partial/loading books dispatch safe stages and retained idle output is labelled available. | **Passed**, E7/E13; five c23 UI counterexamples reproduced before correction |

## Revised acceptance matrix

“Passed” is bounded by the precise compatibility qualifications below. There is no
unresolved material implementation finding in the revised B1 scope. Product approval
and platform gates are reported separately; they are not relabelled implementation
success or unexplained “blocked” rows.

| Revised AC | Result | Evidence and precise scope |
|---|---|---|
| RAC-1 Generation/cache validator | **Passed** | E1: invalid live/cache responses retry; valid cache reuse counted at transport. |
| RAC-2 Arbitrary valid saved section counts | **Passed** | E3/E4/E5: manual split/addition, full and unrelated targeted rendering. |
| RAC-3 Older books without initialization | **Passed, qualified** | E2/E6/E7/E9: read/render/export without lifecycle bootstrap; unverifiable owners remain omitted with warning. |
| RAC-4 Per-page missing/unreadable input | **Passed** | E3/E4/E13: fixed/reflowable, targeted/ordinary, partial windows; missing fixed extraction does not produce blank output. |
| RAC-5 Missing-only ordinary Sectioning | **Passed** | E3/E5/E10: existing AI/manual/unknown/null/empty/unreadable records retained, zero ordinary provider calls, unaffected hashes/history compared. |
| RAC-6 Default-off exact consent | **Passed** | E3/E7: semantic/HTML/tree versions, stale immediate/queued rejection before reset/calls. |
| RAC-7 Scoped reset and recovery | **Passed, qualified** | E3/E5/E8: transactional deactivation, rollback, post-commit failure/cancel/restart; ambiguous in-transaction SQLite mutex fails closed. |
| RAC-8 Mode/reset/edit/rebuild | **Passed** | E3/E5/E7/E10: both directions, structural operations, cancellation, new IDs versus old raw history. |
| RAC-9 Immediate successful-page visibility | **Passed** | E4/E7/E10/E13: actual API + browser first-page click while second runs, first generation and same-layout rerun; paired commit. |
| RAC-10 Later failure/Skip/cancel | **Passed** | E4/E10/E13: successes retained, failed page previous output retained, late/stale publication rejected. |
| RAC-11 Actual layout switch atomicity | **Passed, qualified** | E3/E4/E13: active-window all-success only; targeted/failed/missing-input switch preserves previous layout. Valid fixed extraction required. |
| RAC-12 Honest source/package coverage | **Passed** | E4/E6/E7: incomplete section patch/reset/old partial package cannot be marked complete. |
| RAC-13 Usable preview/export and readers | **Passed, qualified** | E6/E9/E10/E11/E12: preference/lifecycle never gate usable output; missing work and inherited owner warnings remain. |
| RAC-14 Informational preference/cosmetic saves | **Passed** | E2/E7/E9: inherited removal/no-op/adjacent saves, Extract/assets, scoped catalog freshness and completed attempts retained. |
| RAC-15 Shared concurrency/journaling | **Passed, qualified** | E3/E4/E8: execution/publication snapshots, independent writers, recoverable reset/config transitions; no anonymous-lock deletion. |
| RAC-16 Five locales and error parameters | **Passed** | E7/E13; Lingui extraction + strict compile; HTTP/SSE/poll/task/decision mappings; bounded count/list messages. |
| RAC-17 Bounded CLI and non-goals | **Passed** | Fresh CLI/DAG positive tests and guarded existing-book refusal; no new dependency, B2, automatic cross-page merge or separate freshness system. |
| RAC-18 Inherited SPEC-0001/0002 safety | **Passed, qualified** | E5/E8/E9/E13 plus full suite: authored units, drafts, restore, IDs/options/audio/TOC consent, current SQL/JSON-null reads, translation windows/cache/cost accounting. Legacy-owner qualification remains. |

## Nine consolidated-review scenarios

| Scenario | Result | Acceptance evidence |
|---|---|---|
| 1. Reject/retry generated/cached By Page multi-section | Passed | E1 actual provider/cache counts, no persisted-count gate. |
| 2. Split/add saved By Page and unrelated targeted render | Passed | E3/E4/E5/E13 public paths. |
| 3. Click first page while next is slow, fresh and rerun | Passed | E10 actual browser/API, E4/E7 commit-before-event regression. |
| 4. Later failure/Skip/cancel; atomic layout switch | Passed | E4/E10/E13; real UI cancellation and late response. |
| 5. Both mode directions → explicit reset → split; Cancel | Passed | E3/E5/E7/E10, exact history and source-byte comparisons. |
| 6. Older book without bootstrap; per-page bad input | Passed, qualified | E3/E4/E7/E9; no invented owner or fixed-input repair. |
| 7. Partial output never complete; old output inactive after reset | Passed | E4/E6/E7, manifest membership regression. |
| 8. Missing-only ordinary run; scoped/stale confirmation | Passed | E3/E7/E10; queued/execution and publication revalidation. |
| 9. Failure history/restart/status/locales | Passed, qualified | E2/E7/E8/E9/E11/E12; ambiguous SQLite crash intentionally refuses writes. |

## Verification commands and limits

All repository commands run in the existing implementation worktree. Git-dependent
commands use `DEVELOPER_DIR=/Library/Developer/CommandLineTools`. Local logs and
fixture/recovery evidence are preserved under `/private/tmp/spec3-oct12-review/`,
`/private/tmp/spec3-oct12-independent/`, `/private/tmp/spec3-oct12-runtime/`,
`/private/tmp/spec3-oct12-docker/`, `/private/tmp/spec3-oct12-desktop/`, and
`/private/tmp/spec3-oct12-reset-evidence-final/`. No paid provider calls were made.

| Command / check | Result |
|---|---|
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test --maxWorkers 2` | **Passed, 346 files / 4,270 tests**, 357.07 s, final runtime `5a9f9b48`; includes `pnpm build` pretest. `full5.log`. |
| `pnpm typecheck` | **Passed** (`types-f8.log`). |
| `pnpm --filter @adt/runtime typecheck` | **Passed** (`runtime-types-final.log`). |
| `pnpm lint` | **Passed, 0 errors / 8 warnings** (`lint-f8.log`). Warnings are reported, not asserted pre-existing without a baseline. |
| `pnpm build` | **Passed** as full-suite pretest (`full5.log`); TypeScript packages and runtime assets built. |
| `pnpm --filter @adt/studio extract` | **Passed**, five locales, 0 missing translations (`extract-f8-final.log`). |
| `pnpm --filter @adt/studio exec lingui compile --strict` | **Passed** (`locale-f8.log`). |
| Focused changed Studio tests | **29/29 passed**, then independent final-head **43/43** including 11 independent component controls. |
| `node scripts/probes/spec-0003-reset-recovery.mjs /private/tmp/spec3-oct12-reset-evidence-published` | **Passed**, injected transaction rollback, SIGKILL inside/after reset, retained source bytes, post-commit editable recovery; anonymous mutex safely refused and preserved. |
| `node scripts/probes/spec-0002-compatibility.mjs --baseline /Users/ksokolovic/Development/adt-studio/tmp/spec-0002-evidence/compat-before` | **Passed** pre-change API reads/preview/export and current reopen, four authored entities, unchanged history/IDs (`compatibility.log`). |
| `docker build --target app -t adt-spec3-oct12 .` | **Passed** final runtime, linux/arm64; image manifest `sha256:258f47c4ca4d04b79d0a8fc0e6377f703d050259b1c946b7e79d6963c5f57eb4` (`docker-f8-build.log`). |
| Docker bundled API/nginx workflow + actual Webpub ZIP + restart | **Passed** both layouts, 13 original PDF/image assets per book unchanged; complete package membership and all page histories/IDs identical after restart. Commands below. |
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm --filter @adt/desktop build:unpack` | **Passed**, final macOS arm64 package (`desktop-f8-build.log`), ad-hoc signature, notarization unavailable. |
| Actual Desktop API/resources, production accessibility bridge, export/restart | **Passed** both layouts (`desktop-runtime-final-verified.log`); bundled API from final package, Electron utilityProcess harness 41.2.0. Package targets Electron 41.1.1; full application GUI/runtime parity is not claimed. |
| `pnpm --filter @adt/desktop typecheck` | **Failed — reproduced baseline**: node config passes; web config reports three TS2307 `@root/scripts/release-version.mjs` / `release-source-notes.mjs` imports. Same exact errors on pristine prerequisite `09f0d1c7` (`desktop-baseline-types.log`). Root/runtime typechecks and unpacked package pass; this separate Desktop check is not green. |
| Invariant checks | **Passed where implemented** through full tests/typecheck/lint; `docs/INVARIANTS.md` explicitly says `pnpm lint:invariants` does not exist. Planned checker rows are not certified. |
| `git diff 09f0d1c7 --name-only -- '*package.json' pnpm-lock.yaml` / `git diff --check` | **Passed**: no dependency changes, no whitespace errors. |
| Full Electron GUI; signed/notarized installers; Windows/Linux Desktop; paid providers | **Not run**, outside available local acceptance; no release certification. |
| Final browser visual replay after F8 | **Not run to completion**: in-app browser/CDP stopped responding after the earlier successful click/cancel flow; reconnect and a fresh tab both timed out. F8 has independent before/after actual-component tests. The prior slow-page screenshot is evidence of incremental visibility, not of the later visual correction. |

[Condensed actual API/package/restart observations](assets/spec-0003-oct12-runtime-results.json) retain version IDs and package results without provider requests.

Runtime command recipes (fixture scripts and original outputs are preserved locally):

```sh
node /private/tmp/spec3-oct12-runtime/api-acceptance.mjs http://127.0.0.1:43105 /private/tmp/spec3-oct12-docker
node /private/tmp/spec3-oct12-runtime/export-probe.mjs http://127.0.0.1:43105 /private/tmp/spec3-oct12-docker before
docker restart adt-spec3-oct12
node /private/tmp/spec3-oct12-runtime/export-probe.mjs http://127.0.0.1:43105 /private/tmp/spec3-oct12-docker after
SPEC3_NODE=/Users/ksokolovic/.nvm/versions/node/v22.23.2/bin/node apps/desktop/node_modules/.bin/electron /private/tmp/spec3-oct12-desktop/utility-probe.cjs
```

Docker binds only `127.0.0.1:43105:80`, mounts disposable books and a provider
transport stub, and runs the standard app image. Desktop uses the package's
`Contents/Resources/api/api-server.mjs`, WASM and resource paths plus the production
`handleAccessibilityAuditMessages` bridge. No provider key is real.


The immutable original published baseline `a5670d46` passed 327 files / 4,071 tests
before integration. Intermediate failures were investigated rather than called
pre-existing: obsolete old-contract assertions, updated fixtures, missing Git
license environment, and real independent counterexamples were fixed. The first
full c23 suite passed 345 files / 4,260 tests. Only the separate Desktop typecheck
failure below has a reproduced prerequisite baseline.

Local packaging probes use real SQLite, the original two-page PDF extraction,
bundled resources and actual ZIPs. Generation is deterministic at the provider
transport boundary. They do not evaluate paid model output quality, all possible
books, signed installers, full Electron application GUI, or release certification.
The utilityProcess harness must attach the production accessibility IPC bridge;
a missing bridge caused the first harness to wait indefinitely. That was a probe
error, not evidence of a product packaging failure. Another intermediate invocation
overlapped a package rebuild and is not accepted as runtime evidence.

## Remaining decisions, qualifications and downstream implications

- **Human product amendment pending:** SPEC-0003 and ADR025 remain in review/proposed.
  The proposed #708 correction is recorded here, not written into the source issue.
  Existing PR title/body remain unchanged even where historical.
- **Legacy-owner compatibility restriction:** contradictory/unverifiable ownership
  is retained raw/history/assets but omitted from preview/export with a warning.
  Missing authorship alone is not omitted. Unrestricted legacy promises still
  require ratification or a safe repair path; no positional inference is introduced.
- **Missing fixed-layout inputs:** valid current positioned extraction/classification
  and positive viewport are necessary. Usable old output remains available; restore
  valid versions or use future safe extraction repair. This is not a claim of
  universally successful conversion of books that lack those inputs.
- **Anonymous SQLite mutex:** a writer killed inside an ordinary transaction can
  leave ownership unverifiable. The real process probe preserves this evidence and
  fails safely. Automatic editability is verified after a committed reset with a
  recoverable known writer, not after that ambiguous crash. No lock is deleted by age.
- **Cross-spec policy refinement:** SPEC-0002's ordinary eligible-AI Sectioning
  replacement is intentionally narrowed to missing-only; fixed HTML/tree retention
  is overridden only by the explicit exact-version Sectioning reset consent. Other
  translation/quiz/TOC protection remains unchanged. #880 is not modified.
- **Downstream integration:** #886 and #888 must rebase/reconcile onto this revised
  shared publication contract, preserve incremental ordinary page commits, exact
  reset consent, stable-owner projection, and coverage-based read models. Broad
  existing-book CLI resume and safe fixed-input restoration remain SPEC-0010 work;
  they are not silently reintroduced here. No descendant branch was merged.
- **Focused reuse and attribution:** #692 supplies the generation/cache validator;
  shared admission/ownership/freshness come from #879/#880. Published #886
  `3a7ad4a3` and #888 `d9dac253` were inspected; no whole downstream subsystem or
  descendant commits were imported. Existing focused admission work already in
  #884 was reconciled with the shared prerequisite; separate reviewer probes
  informed the fresh-DAG and publication regressions with attribution in source.
- **Scope:** the revised B1 implementation is complete within these explicit safety
  and compatibility qualifications. This is not the original unrestricted legacy
  contract, expanded CLI resume, B2 modes, automatic cross-page merge, specification
  approval, or a release certification. No known material revised-B1 defect is
  left unresolved; unavailable platform checks are listed separately.

## Publication record

The target remote and title/body were refreshed before publication: remote head
`a5670d468d9945924503242b17992cb9b3e2ee57`, base `spec/736-manual-edit-preservation`;
title/body unchanged, no additional reviews beyond the two authoritative inputs.
Prerequisite and downstream references were unchanged. Recoverable refs preserve
that target and the verified old replay boundary `373619dd2e7ef7cecf2653cecfda07029401f5e6`.
Only the SPEC-0003 increment was replayed onto `09f0d1c7`; no descendant merged and
no sibling PR modified. Owner untracked `spec-0003-stacked.md` and `tmp/` remain.

Exact published SHA, hosted test/Docker/i18n results and CI URL are recorded in
the new review-request comment on [PR #884](https://github.com/unicef/adt-studio/pull/884)
after publication. This committed local report does not pre-claim hosted success.
The PR title/body are intentionally preserved; only a new comment/reviewer request
is authorized. Spec/index/ADR remain in review/proposed.


### First published CI and test-only correction

[CI run 38257329047](https://github.com/unicef/adt-studio/actions/runs/38257329047)
at `b2280e354827ada9d1da337a0d031db6e3b07f6f` passed Docker and i18n but failed
three real-PDF preservation cases at their explicit 30-second limits: 4,267 tests
passed and 3 timed out. Root typecheck passed. This run is not green.

The independent reviewer measured Vitest's generic deep equality of the 5,704,567-byte
Raven PDF at 9,991.8 ms versus 1.46 ms for exact `Buffer.equals`; a deliberately
changed byte was detected. The fix uses native exact byte equality and preserves
real extraction, SQLite, history/manifest assertions, zero provider-call assertions,
the 30-second case limits and the 15-second CLI subprocess limit. This is an
assertion-cost correction, not a claim that extraction was slow or runtime safety
was defective. No production behavior changed.

The writer's focused command `DEVELOPER_DIR=/Library/Developer/CommandLineTools
pnpm exec vitest run packages/pipeline/src/__tests__/sectioning-resume.test.ts
--maxWorkers 2` passed 8/8 in 6.97 s (`ci-fix-focused.log`). The independent rerun
passed 8/8 in 6.69 s and confirmed unchanged exact-byte semantics; its report above
records the reviewed file digest. Final publication still requires newly published
exact-head hosted CI; this earlier failed run is retained as evidence.


Linux verification also passed: `docker build --target build -t adt-spec3-oct12-test .`
then the focused Vitest command inside that image, with this checkout's
`vitest.config.ts` and `tests/` mounted read-only into `/app`, passed **8/8 in 5.32 s**
(`ci-fix-linux-build.log`, `ci-fix-linux-focused.log`). The four former slow cases
completed in 767/551/448/444 ms; the actual CLI case took 1,104 ms. Image manifest:
`sha256:8364af9ad64dfb7ccb4d107acaf93731a10f18797ef7e3d0cbaa9d8c8228ffa6`.
This Linux/arm64 focused rerun supplements, rather than replaces, hosted Linux CI.
Product code and the final runtime/packaging checkpoint `5a9f9b48` are unchanged.
