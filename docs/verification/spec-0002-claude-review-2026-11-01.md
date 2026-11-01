# SPEC-0002 Claude review remediation — 1 November 2026

All work remains local on `spec/736-manual-edit-preservation` for PR #880. The final production/test source is `6753ee4daabe61322169e9efdede29b6ac68b59c` (the first correction checkpoint was `addec752963a5323cc45ca8675ce13bb7aef7360`), following candidate `10b1b16b1314bcf36e922e26456af30c73e5a52c` (production `d2811b65`). Explicit develop comparison remains `df4df3aa7b5e37114f5e86db3d1cbf9bac3ce2a0`; published PR head remains `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89`. No push, remote base/title/body change, review request, issue closure, merge or approval occurred. Proposed later base remains develop. The recovery ref `refs/backup/spec-0002-before-claude-review-nov01` retains the original candidate.

This report supersedes the prior readiness assessment, not the original specification or human decisions. Source fixes are verified below, but **F5 still needs an explicit policy decision**. The six exact owner deferrals and prior platform findings remain visible. There is no unconditional full-contract/release certification.

## Review input and changes

External Claude review: `.local-docs/spec0002-independent-review-20261101-182738-claude-code/REPORT.md` and its companion matrix/logs. It inspected moving checkpoints; its claims were reproduced against this round's actual source, not assumed current. Full local plan, feedback ledger, probes, failures, outputs and independent reports are in `.local-docs/spec0002-claude-review-fixes-nov01/` outside Git.

| Finding | Disposition and fix | Concrete evidence |
|---|---|---|
| Claude F1: retained translation history falsely appears current although editor/export omit it | Fixed in `5e9e9813`, corrected legacy boundary in `addec752`. Catalog status and display use current published entries; generation alone can recover protected historical entries. Current canonical presence never silently falls back to an alias. | Two failed-before HTTP reproductions; current/retained SQLite suites; actual Docker browser at addec752: manual and unknown retirement/restore→Missing→Generate→next preparation; exact restored text, metadata, history and neighbors. Scoped recovery makes zero translation transport calls. |
| Claude P1: never-saved translation A→B→A leaves a clean pending projection blocking Keep | Fixed in `63fe4d3a`. Clear only a genuinely net-clean projection with no owning save/restore/conflict. Retain speech/timing/other operation barriers. | Mounted real OutputReview regressions, exact duplicate-group tests; browser edit/revert→Keep→external write/refetch→next Save at the new version, zero provider calls. |
| Claude F2/F3: Settings run paths bypass consent; landing can run from loading/error or old cached status | Fixed in `8e07a9e1` with one shared action-boundary controller for landing, TOC/Sectioning Settings, Sectioning run cards and TOC source notices. Require a fresh completed non-cancelled read, frozen named versions and valid session; Sectioning opt-in resets off. Settings are book-keyed and busy fields cannot accept a successor edit that an old save would clear. | Failed-before caller regressions; actual QueryClient cancellation/deduplication/ABA tests; browser cold loading/failure/retry on both landings; named confirmation/cancel/default-off on both Settings, Sectioning card and TOC notice; cancel→no writes/calls, stale TOC409→fresh next successful replacement. |
| Claude F4: named quiz replacement omits manual/unknown distinction | Fixed in `8fedb456` using the existing AuthorshipBadge beside each protected ID/question. | Two failed-before tests; actual browser shows both badges and both named identities; cancellation unchanged/zero calls; Settings cross-book/reopen/external409/fresh replacement preserves history and untouched book. |
| Claude F5: AI-empty TOC heading fallback | **Blocked by unresolved product policy, not deferred and not marked fixed.** Operative spec says explicitly saved empty TOCs remain empty; a no-op Save retains AI provenance. AI source therefore cannot prove lack of explicit human acceptance. Owner question remains pending; behavior unchanged. | Spec integration clarifications (AC5/7 no-op and AC17 empty output), independent analysis and actual AI-empty fixture. Do not equate with D3 or silently add a new provenance field/fallback policy. |
| H1: cancellation test races teardown/admission | Test correction in `8e07a9e1`: wait for first actual provider admission at concurrency1/3; always cancel, release and await the worker before deleting SQLite/filesystem. Separate stale queued-TOC test. | Focused regression passes and complete suite. Original failed run retained; no unsupported pre-existing attribution. |
| H2: missing acceptance/invariant commands | No fictitious command added or claimed. | `pnpm acceptance` and `pnpm lint:invariants` do not exist; existing invariant suites run in Vitest. The controlled 8,850-entry experiment is not private-book field acceptance. |
| New full-suite regression in the initial F1 fix: malformed null translation crashes status | Fixed at final `addec752`, before runtime freeze. Shared entries-only validation rejects malformed lists without dropping valid legacy documents lacking generatedAt or opaque metadata. | Initial 8e07 full run: 5,989 passed / 1 failed / 16 skipped retained. Corrected complete suite: 5,997 passed. |
| Independent additional preservation hole: readable manual/unknown entries without generatedAt ignored by ordinary generation | Fixed at `addec752` using the same complete raw entries validation as the editor; no authored timestamp/provenance fabricated or duplicate normalization. | Two failed-before real HTTP ordinary-run reproductions each made one unauthorized adapter call; corrected ordinary-run/retirement/recovery tests plus independent SQLite reopen/older-current/metadata probes pass. |
| Final evidence review SR1/SR2: late settings read discards retry typing; retaining stale maps can delete independent additions; confirmation uses an old Save closure | Corrected in `6753ee4d`. Only edited model/retry fields stay local; untouched fields refresh. Sectioning rebases local map/set changes over each fresh baseline, including explicit removals, without tombstoning independent additions. Confirmation calls the latest same-session Save while retaining the originally consented protected versions. | Actual browser at addec and two mounted public callers failed before. Final 23 Settings tests cover delayed reads, refetch while consent is open, untouched settings, repeated map updates, explicit removal, independent set additions and subsequent Save. Independent final mounted recheck: 23 committed cases plus 6 separately authored adversarial cases passed. Final browser/platform recheck is recorded below. |

Earlier original F1–F4 remain distinct from Claude's newly numbered F1–F5. Original stable rendering/answer ownership, whole-document TOC recovery, fixed tree/HTML pairing and same-run combined replacement all retain committed real HTTP/SQLite regressions in the full suite. The combined Docker stage range additionally confirms 4 Sectioning transports, 1 TOC transport and 7 intermediate transports, not zero-call silent success; competing HTTP Save returns 409 and prior TOC history remains. Separate-SQLite competing-writer consent rejection is covered by the committed route regression, not claimed as part of that browser/runtime check.

| Original October finding | Final evidence and remaining boundary |
|---|---|
| F1 — retained rendering/activity identity | `rendered-ownership.integration.test.ts`, `manual-edit-survival.test.ts` and shared ownership suites pass at the final source. Real HTTP replacement/reorder/prune/restore checks actual owner, corrections, physical audio and neighbors. Unprovable legacy ownership remains qualified under Note 7. |
| F2 — TOC draft on a reused positional ID | `TocView.recovery.test.tsx` passes rejected Save → whole-document conflict/recovery → next Save, plus independent-entry edits. No translation duplicate exception is applied to ambiguous TOC identity. |
| F3 — protected fixed-layout tree/HTML pair | Real-storage fixed-layout success/failure/cancel/restart regressions remain in the final suite; matching tree and HTML stay protected together. The narrow JSON-null resolver test verifies semantic Preview/export fallback without importing broad mode lifecycle work. |
| F4 — combined Sectioning → TOC consent | Final `manual-edit-survival.test.ts` covers same-run retirement and a separate SQLite writer. Docker stage-range execution at addec confirms generation and external HTTP rejection; unchanged backend source is rebuilt and the persisted output/restart checks repeat on final 6753. No silent zero-call replacement or consent refresh to an unrelated edit. |

The historical Claude matrix incorrectly called `getStageRerunClearNodes` identical to develop: SPEC-0002 intentionally adds TOC/quiz/glossary to preserved nodes. It also overstated server guards as always rejecting wrong-book quiz consent: matching IDs/versions are book-local; UI session isolation is essential. O-2's empty reopened Add Quiz session is distinct from retained consent and does not itself authorize generation. These reporting corrections are recorded without unrelated refactoring.

## Independent review

The separate reviewer inspected original spec, external feedback, explicit develop and integrated source/public callers, then independently executed 11 committed files / 223 tests plus 10 separately authored adversarial probes at `addec752`. All 233 passed. Its own probes cover cancelled warm-cache reads, deduplicated reads, retry and book/stage ABA, older selected translation versions, restart, raw duplicate/metadata retention, canonical invalid-row precedence and all-or-nothing validation. Report: `independent/execution-recheck-addec752.md`. It found no new material defect in the corrected remediation. This is an independent focused recheck following whole-contract source review, not independent execution of the parent's full suite or platforms.

The same reviewer subsequently inspected the actual runtime evidence and caught the retries4→3 discrepancy. After correction at `6753ee4d`, it independently executed **23 committed Settings tests plus 6 separately authored adversarial tests (29 passed)**. These cover explicit model/retry clears, failed Save followed by retry, repeated independent map/set additions/removals and book ABA, including exact next-Save payloads. Frozen content-version consent remains unchanged while the latest same-session settings callback is used. No new material finding was reported. See `independent/settings-execution-recheck-6753ee4d.md`; this is mounted-component/payload evidence with a real QueryClient, not the actual browser persistence check below.

## Automated verification

The initial addec752 checkpoint below passed before the later settings correction. Final 6753 results are recorded separately; no old-source platform result certifies the final build.

### Final source 6753ee4d

- `pnpm build`: passed (8.86 seconds).
- `pnpm exec vitest run --maxWorkers=2`: **474 files, 6,004 passed, 16 skipped (6,020 total)**; 451.66 seconds command wall time. The 16 Linux-only cases are checked separately below.
- `pnpm typecheck` and `pnpm --filter @adt/runtime typecheck`: passed.
- `pnpm lint`: passed with the same eight unused-suppression warnings as the preserved baseline.
- `pnpm --filter @adt/studio extract`: 4,476 entries in each of five catalogs, zero missing target translations.
- `pnpm --filter @adt/studio compile --strict` and `pnpm --filter @adt/studio build`: passed.
- `git diff --check`: passed; no generated source changes after the checks.
- `zsh probes/linux-writer-final.sh`: final Docker build target, network disabled, **30 passed**, including the 16 macOS-skipped cases. This is a focused Linux writer suite, not the full repository suite on Linux.

Exact command arrays, exit codes and durations are recorded in `results/final-*.json`, with matching full `logs/final-*.log` files.

### Initial addec752 checkpoint

Commands ran sequentially with provider credentials stripped, provider CLI stubs blocked and external network guarded. Build/package dependency downloads were allowed separately. No paid provider call was made.

- `pnpm build`: passed.
- `pnpm exec vitest run --maxWorkers=2`:474 files, 5,997 passed, 16 skipped (6,013), 447.07 seconds. Includes the existing invariant suites and preservation/compatibility regressions.
- `pnpm typecheck` and `pnpm --filter @adt/runtime typecheck`: passed.
- `pnpm lint`: passed; 8 unused-suppression warnings match the preserved prior-round lint baseline.
- `pnpm --filter @adt/studio extract`, strict Lingui compile and fresh Studio build: passed; 4,476 entries per locale, 0 missing in all target locales. One new Studio string translated into en/es/fr/pt-BR/sq.
- `git diff --check`: passed; source clean after all generated checks.
- Network-disabled Linux Docker writer suite: 30 passed, including the 16 cases skipped on macOS. This is not a second full Linux repository suite.

Full exact commands/durations/results live in `results/` and `logs/`; failures and harness corrections are retained, not erased by successful reruns.

## Actual runtime and compatibility verification

### Initial addec752 runtime checkpoint

Twenty successful actual-browser executions (including enriched repeats) checked manual/unknown translation retirement and recovery, net-clean translation Keep and next Save, cold/failing landing reads, named TOC and Sectioning confirmation, source-notice confirmation, quiz authorship/session/conflict recovery, and Sectioning history/navigation/Revert/conflict recovery. The source notice was seeded with `needsUpdate: true`; that specific probe does not establish the complete upstream-change derivation chain. Ordinary whole-language Translate legitimately generated other missing entries; the zero-call claim applies to the scoped protected recovery operation. The enriched manual/unknown probes each made one subsequent selected preparation call using the restored text.

The separate combined range made 12 actual stubbed transports: 4 Sectioning, 1 TOC and 7 intermediate requests. Its competing HTTP TOC Save returned 409 while the authorized run completed and retained history. The separate-SQLite external-writer case is a committed integration regression. Twenty-seven accepted fixture books passed Docker and unsigned packaged-API restart/export: 2,234 ZIP members compared byte-for-byte and 702 original media files unchanged. These are historical checkpoint results; the later settings discrepancy was reproduced and fixed, not dismissed because these checks had passed.

### Final 6753ee4d runtime checkpoint

Fresh `docker build --network=host --target app` and `--target build` completed with revision label `6753ee4daabe61322169e9efdede29b6ac68b59c`. The combined runtime image is `sha256:91a70d7e6cacb6c2b0858d37fc3a23045b503e72bf23adbe394e5c227299dd69`; source/resources, isolated books/config and transport-hook hashes are recorded in `results/docker-runtime-provenance-6753-*.json`.

Five additional browser scenarios passed on this final image (six successful executions, including the map probe repeated with explicit run-admission observation):

| Command (from the external evidence directory) | Observable result |
|---|---|
| `node probes/settings-refetch-browser.mjs toc final` | Delayed real config response cannot replace typed retry 4; actual Save body and persisted config both contain 4; zero provider calls. |
| `node probes/settings-refetch-browser.mjs sectioning final` | Same delayed-read/next-Save control on the second public editor; persisted retry 4, zero provider calls. |
| `node probes/confirmation-browser.mjs toc settings final` | Cancel preserves draft; external TOC update causes frozen-version 409 with no generation; fresh next confirmation succeeds with exactly one TOC call. Persisted retry remains the intended 4. |
| `node probes/confirmation-browser.mjs sectioning settings final` | Opt-in starts off, cancellation preserves draft, explicit named replacement makes four Sectioning calls; protected history remains and persisted retry is the intended 3. |
| `node probes/settings-map-browser.mjs final-admission` | After a real external config PUT and cache-expired reconnect/refetch, local type-description correction and independently added type both survive actual confirmed Save and storage. Actual POST `/stages/run` returns 200 with `replaceManual: false`; worker completion is awaited and the protected ordinary run makes zero provider calls. |

The first map probe timed out because its already-online event did not trigger a new read; it made no browser Save/run writes or provider calls (the intentional external fixture config PUT had occurred). A fresh fixture with an actual browser offline/online transition after advancing the five-minute query clock passed. The failure and corrected command are retained. Independent evidence review then caught that the reconnect probe checked idle before observing run admission; its result is limited to Save/refetch preservation. The final fresh `final-admission` fixture explicitly awaits the actual run response before worker completion, closing that evidence gap. No production code changed to satisfy either probe.

The final Docker and unsigned packaged-API restart/export sets each contain **32 fixture books**: **2,639 ZIP members** compare byte-for-byte before/after restart, current/history and English/French Preview are equal, and **832 original media files** retain their bytes. Preparation/export/restart makes zero new provider calls. Distinct phase filenames preserve each checkpoint. The later map-admission fixture is an additional browser/run control, not retroactively counted in the 32-book platform set. `accepted-labels.json` and `accepted-platform-labels-6753.json` are pinned to those 32 tested books; `accepted-browser-labels-6753.json` separately records all 33 accepted browser fixtures.

Exact final platform commands (evidence scripts run from the external evidence directory):

- `node probes/export-recovery.mjs docker-final-before`, `docker restart adt-spec0002-claude-final`, `node probes/export-recovery.mjs docker-final-after`, followed by `python3 probes/check-export.py docker-final-before docker-final-after` and `python3 probes/check-media.py books docker-final-after`: passed.
- `pnpm --filter @adt/desktop build:unpack --publish never --config.directories.output=<evidence>/desktop-settings-unsigned`: passed, unsigned/unpublished, 19.37 seconds. `node probes/check-packaged-studio-final.mjs 6753ee4daabe61322169e9efdede29b6ac68b59c` verifies all 22 fresh Studio files inside the actual ASAR. API/WASM and prompts/templates/assets/config hashes match the final build.
- `python3 probes/desktop-acceptance-final.py 6753ee4daabe61322169e9efdede29b6ac68b59c`: passed, 59.26 seconds. It boots the package's bundled API under Node with actual resources, isolated book copies, then restarts and repeats Preview/export/history/media checks. This is **not** an Electron GUI, hardened-launch, signing or all-platform check.
- `python3 probes/check-old-baseline.py`: all 1,822 source files match baseline `ef31494dc2951b92222c473960fecee2d91f9544`. The retained old source snapshot was freshly built earlier in this round. `node probes/compatibility-retained.mjs --baseline /Users/ksokolovic/Development/adt-studio/tmp/spec-0002-evidence/compat-before`: final-head current guarded Save → built-old API reads/Preview/web export → current reopen passed for all four entities; authorship, IDs and complete history unchanged, zero provider calls. No safe old-build editing/rerun promise follows.

Docker VM capacity failures are preserved separately from successful builds. Debian signature errors occurred with zero available VM space; source/Dockerfile were unchanged on retry. Old unused task-only images were archived, manifests/checksums verified, then removed. A later capacity recovery also archived eight stopped older SPEC-0002 test containers across three image versions, including their writable-filesystem snapshots, original configuration and logs, before removing those stopped instances. All book bind mounts and volumes, unrelated containers and the immediately preceding runtime were preserved. Recovery records and instructions are under `results/archived-*.json` and `artifacts/RESTORE-ARCHIVED-RUNTIMES.md`.

The test fixtures are fresh copies of a synthetic four-page timing/translation/audio book. They model equal book-local IDs/versions, manual/unknown provenance, legacy missing timestamps and opaque metadata, source retirement, frozen consent, independent writers, retained HTML/assets and navigation sessions. They do not substitute for the assigned private historical/field books or provider quality. Runtime transport interception counts real application-boundary requests; it does not claim live-model responses or cost.

Preserved setup failures include an incorrect Sectioning Settings tab, missing structure types in a minimal fixture, nonexistent fixture storage method, alternate Home card selector and invalid probe error-policy enum. Each was diagnosed from actual API/log evidence, corrected only in disposable probes/fixtures and rerun on a fresh copy. An earlier TOC fixture had no headings and correctly generated empty AI output without a provider call; the replacement-call probe was rerun with actual headings. An overbroad translation-zero-call assertion was narrowed to the specific recovery operation because ordinary generation legitimately filled other missing outputs. These are not hidden production fixes or accepted failing scenarios.

## AC-to-evidence matrix

“Passed” refers to the supported exercised contract, with qualifications below; it does not mean every possible book/interleaving/platform is certified. Earlier manual/browser evidence stays attributed to its actual head. The full latest branch suite rechecks committed regressions; this round's runtime probes target changed and adjacent failure paths.

| AC | Status | Evidence/limits |
|---|---|---|
|1|Passed|Exact server changed/new-only stamps; no-op/unknown/receipt/duplicate regressions; actual manual Save/recovery and next guarded Save, zero Save provider calls.|
|2|Passed automated; field not run|Fixed ordered windows before filtering; current skipping; distinct adapter/cache/provider/retry/cost and 8,850/177-window test; new current/history distinction and readable legacy recovery; no force-fresh claim.|
|3|Passed|Quiz edit/no-op/reorder/stable option identity suites; actual replacement consent and fresh identity/history; prior scoring evidence remains at its recorded head.|
|4|Passed|Complete source-page groups, no regrouping, all-protected/no-eligible/overlap/repeat and dependent/order suites; no batching change this round.|
|5|Passed|Whole-document TOC stamping and no-op provenance suites; actual confirmed AI publication with manual history.|
|6|Passed supported paths; D3 deferred|Fresh named confirmation from Settings/landing/notice, cancellation and stale409→next action; actual combined stage range. Saved-empty card no-op remains D3.|
|7|Passed required behavior; D4 deferred|Whole-page structural/both-page/no-op/guard tests; actual source edits. Redundant unchanged AI-edit versions remain D4.|
|8|Passed|Whole-page/empty/unknown/fixed tree+HTML pair success/failure/cancel/restart suites; actual Sectioning card/Settings replacement retains history.|
|9|Passed exercised chain, qualified; private not run|Six-unit real HTTP/SQLite own/upstream survival plus final runtime current/history/output/restart. No full Storyboard-rerun preservation claim; legacy-owner qualification retained.|
|10|Passed required controls; D6 deferred|Badges including named quiz manual/unknown; all five locales and lint pass. Exact adjacent-page error remains D6.|
|11|Passed bounded reading|Unknown/legacy/no-timestamp/canonical precedence suites and final built-old-version readability probe; no downgrade editing/reruns or pre-schema14 certification.|
|12|Passed supported restore; D1 deferred|Original guarded selected-page highest-earlier-explicit-AI Revert suites; actual Revert→nextSave and unchanged neighbors/history. Same-page net-clean-after-Revert D1 untouched.|
|13|Passed|Delete-last/empty protected/both cross-page merge sides/stale neighbors/moved-content uniqueness suites.|
|14|Passed supported retirement; repair deferred|Current/history source retirement and manual/unknown recovery through real run route; active membership and physical history suites. K3/ownership reconstruction remains ratified follow-up.|
|15|Passed|Shared fresh named versions, off-every-open Sectioning consent, scope/cancel/error guards; actual Settings/card/landing checks.|
|16|Passed exercised atomicity|Publication/failure/cancellation suites, admitted-provider teardown tests, actual quiz freshID/history and combined externalSave409. No claim closing a dialog undoes an already committed request.|
|17|Passed supported outputs; F5 blocked|Current-version output/history/restart evidence and stable-owner suites; AI-empty fallback policy unresolved. Legacy omissions and open SCORM platform issue remain explicit.|
|18|Passed corrected required paths; D1/D2/D5 deferred|Guarded four-unit APIs, TOC whole-document conflict policy; current/legacy receipts, fresh consent, session/late callback/ABA tests; actual nextSave after recovery, net-cleanKeep, navigation Back/Forward. No exhaustive races claim.|
|19|Passed bounded contract|CLI/DAG AI-stamping/shared quiz-batching suites. Not general CLI preservation/resume or SPEC-0010 completion.|

## Deferrals, outstanding decisions and publication limits

Only [PR #880 comment 6137679220](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220) authorizes these six exact open cases:

|Item|Status and reason|
|---|---|
|D1|Explicitly deferred: same-page net-clean Sectioning draft after Revert. Does not waive translation or cross-book/session defects.|
|D2|Explicitly deferred: quiz deletion after unresolved Save conflict. Does not waive Add/Replace consent.|
|D3|Explicitly deferred: saved-empty protected TOC landing Run silently skips. Distinct from F5 output policy.|
|D4|Explicitly deferred: unnecessary unchanged AI-edit page versions.|
|D5|Explicitly deferred: stale Save-error banner after Discard.|
|D6|Explicitly deferred: exact untranslated “Adjacent page no longer exists”.|

The same comment explicitly requires #884 before #880 merges to develop. Narrow resolver adaptation authorization does not itself waive that order. No merge is attempted. SPEC-0001 [final ratification/Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170) and [mandatory timing/draft/harness follow-up](https://github.com/unicef/adt-studio/pull/879#issuecomment-6340376966) remain operative. Contradictory/unprovable owners stay in raw content/history/assets but are omitted from Preview/export with disclosure; no positional ownership repair. The named activity carry-over, K3 reconstruction, staged Speech, SPEC-0013 classifier, bulk/projection/Storyboard-no-op, blank-ID/pre-schema-14 and performance #995–997 follow-ups remain outside this round.

Full Storyboard-rerun preservation, new scoped generation, broad Sectioning-mode lifecycle, a fifth Easy Read slice, general CLI preservation/resume and EPUB/PNLD redesign remain documented non-goals. P1 default ad-hoc hardened Mac launch and P2 cross-origin SCORM are open prior platform findings, **not approved deferrals**. Private Frankenstein/De-codable/STD5/Tanzania, live-provider quality, real cloud, low-end hardware, signed/all-OS releases and exact unpublished-head hosted CI remain unverified/unavailable. Synthetic fixtures and unsigned API checks cannot close those assignments.

F5 is blocked only on the explicit product choice described above. No new assumption or deferral was invented. The independent reviewer also checked the final evidence and both handoff prompts; its map-run admission concern was corrected in the additional real-browser probe and rechecked in `independent/evidence-scope-review-6753ee4d.md`. The corrected source is suitable for another independent whole-contract review with these limits visible; it is not an unconditional statement that the full current contract or release acceptance is complete. Publication remains unauthorized in this round.
