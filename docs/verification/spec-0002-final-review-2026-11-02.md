# SPEC-0002 final dual-review consolidation — 1–2 November 2026

All work remains local on `spec/736-manual-edit-preservation` for existing PR #880. This round addresses both completed independent reports at frozen candidate `eddc4df0502e3c897ad80dfb24b1c70847dabc27` / production-test source `6753ee4daabe61322169e9efdede29b6ac68b59c`. The reviewed remediation checkpoint is `8ec35328f5d97dfa9b8dd2b2b87a48e8ae37f55b`; integrated production/test/spec source is `afd93f61ff31432086490f70df4f335748496197`; the last SPEC-0002 runtime correction is `96c67440d2596cb5c9be545a29071b6dabfd3e67`. Approval remains pending. No push, remote retarget/title/body edit, review request/comment, PR merge or issue closure occurred.

## Scope, exact integration and recommendation

The frozen reviews used develop `df4df3aa7b5e37114f5e86db3d1cbf9bac3ce2a0`. Final remote refresh found develop `10c32c0baca02b89076231a6fd1674b46d4a37b5`, now integrated locally; original/published SPEC-0002 remains `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89`. SPEC-0001 was merged as `c153ba7d26c2323b67236c61297999424b169ac1` from `811d14751d6e01a8262d3e34466c1f45875b8ca1`. Read-only remote receipts are recorded outside Git. Proposed later PR base: **develop**; the remote still has the old stack base.

The [integration record](spec-0002-develop-integration-2026-10-26.md) explains the actual boundary `aefe41855..09f0d1c7`: the final net SPEC-0002 increment was reconciled onto develop, avoiding replay of the squash-merged prerequisite. Backup refs, patch/range comparisons and independent final-tree inventory preserve the original work and conflict fixes. Develop and the SPEC-0001 squash are ancestors of the new branch; the obsolete full stack is not. No descendant was merged. Later source corrections remain focused on preservation, admission, identities, recovery and accepted UI contracts. The original spec, INDEX, ADRs, implementation, tests and review history survive.

The corrected implementation is a candidate for official human review within the agreed scope, with the verification and remaining gates below. It is a **qualified implementation**, not unconditional full-contract or release completion: the six explicit deferred defects and ratified compatibility bounds remain. No unresolved product decision remains from these two reports.

The final remote check found one concurrent upstream commit, `10c32c0b` (#991), adding edge dragging to the image crop dialog and updating five translations. After preserving `refs/backup/spec-0002-before-latest-develop-nov02`, a clean local merge produced `afd93f61`. An independent normalized-patch comparison verifies that the six incoming files exactly match that upstream change and **all 174 files in the SPEC-0002 incremental diff retain identical added/removed lines** against the new base. The crop dialog blob is identical to develop. No SPEC-0002 correction or shared SPEC-0001 mechanism changed. This is a bounded concurrent upstream integration, not a restarted contract-review cycle. Its affected rechecks are separately attributed below.

## Consolidated finding dispositions

Both reports completed before implementation resumed. Their original files, probes and failures remain outside Git under `.local-docs/spec0002-final-review-20261101-eddc4df0/reviews/`. Remediation commands/results, browser captures, exports and independent rechecks are under that directory's `remediation/`. The recurring follow-up monitor was stopped after both reports completed; execution used one shared `acceptance.lock`, one implementation writer and sequential workloads.

| Finding | Disposition / local commit | Observable verification |
|---|---|---|
| Codex F-1 (P2): acknowledged Settings retries roll back on the next Save | Fixed, `08f9974a`. Opt-in server receipt contains validated raw/effective config; both query caches adopt it before the Settings draft is released. Obsolete reads are cancelled. Explicit map tombstones survive the next unrelated Save; ordinary config response compatibility remains. | Failed-before public-component payloads and real config-route persistence; committed receipt/clear/map/refetch regressions; independent adversarial cases; actual browser held/failed GET → retry4 Save → model-only next Save, both Settings callers. |
| Codex F-2 (P2): unrelated translation Save strips untouched opaque legacy metadata | Fixed, `30bc1f82`. Validate the entire stored list but retain server-owned raw objects; final validation does not replace them with stripped parse output. Client metadata/provenance remains untrusted. | Failed-before no-op/unrelated Save cases; real SQLite HTTP receipt/current/history/next run/output, duplicate groups and malformed rejection; actual browser unrelated Save retains complete legacy fields, Save makes zero provider/transport calls, excludes protected source from generation; only missing Easy Read translations generate, then the next ordinary run makes zero translation calls. |
| Claude CF-2: resolved/converged net-clean translation draft hides all review actions | Fixed, `2419b24f`. Release only genuinely settled net-clean drafts while retaining Save/restore/conflict and independent speech/timing barriers. | Mounted real LanguageView/OutputReview recovery/refetch tests, first Keep and next Save; actual browser rejected Save → Load latest and converged recovery. |
| Claude CF-1: combined Storyboard landing run omits Sectioning's protected-work confirmation | Fixed, `056e5b43`. Existing shared confirmation uses the included Sectioning stage, with named saved versions, default-off replacement and reset across book/range changes. | Public component and real HTTP combined-range regressions; actual browser ordinary/explicit/racing runs, actual admitted POST and settled worker, counted Sectioning calls, current/history and cancellation/reopen. |
| Browser follow-up: first Keep after translation recovery carries an old review hash | Fixed, `96c67440`. Cancel and refresh shared output queries before adopting recovered catalog; failed/paused/cancelled/cold reads retain the draft. Server hash/signature guard is unchanged, with no automatic retry against a later writer. | Failed-before token-sensitive regressions; delayed/failed/cancelled/cold response/third-writer cases; independent mounted first Keep and next Save checks; fresh browser recovery uses the correct first action. |
| DS-1 / earlier Claude F5 | Resolved by explicit owner decision, documented/tested in `8ec35328`: **every stored empty TOC stays empty**, including AI and unknown. No-op Save retains authorship. | Real SQLite guarded Save → preview/web export → unchanged current/history tests. Missing-document fallback, destinations, Webpub and D3 remain separate. No approval fabricated. |
| Optional OI-1 and nonblocking cleanup | Not promoted to required product scope. Explicitly saving a newly empty translation protects it; existing explicit replacement remains available. | Reviewer corrected the stronger claim that it was permanently un-regenerable. No invented deferral or new empty-translation policy. |

The additional stale-review-hash case is a bounded adjacent recovery gap exposed by actual runtime acceptance, not proof of a new systemic failure. Its baseline was not reproduced as the exact new recovery flow, so it is not labeled pre-existing. Codex F-1 had a controlled develop-hook comparison; F-2 and CF-2 affect the required contract even though underlying normalization/presence behavior was inherited. CF-1 improves a previously destructive baseline but still needed the promised control.

The frozen Claude companion matrix's statement that preparation is identical to develop is not adopted: this branch intentionally preserves additional TOC/quiz/glossary nodes. Its reading-order clause is also not vacuous: committed quiz tests seed and assert stored explicit order. Historical reports and pass totals are evidence, not replacements for the final checks below.

| Original review requirement | Retained evidence and boundary |
|---|---|
| F1: retained HTML/activity answers must not acquire another section identity | Shared owner resolution and real HTTP replacement/reorder/prune/restore tests assert actual owner, answer/translation/audio associations, neighboring versions and physical assets. Unprovable legacy ownership remains qualified under Note 7. |
| F2: reused TOC positional ID must not receive another chapter's draft | TOC-specific whole-document conflict policy and actual editor rejection/recovery/next Save regressions; no translation compatibility exception is extended to TOC. |
| F3: protected fixed-layout tree and HTML must survive together | Real-storage success/failure/cancel/restart pair-preservation tests and shared JSON-null fallback regression. Broader mode lifecycle remains outside SPEC-0002. |
| F4: combined Sectioning → TOC must honor only same-run authorized changes | Real HTTP same-run retirement/replacement and separate SQLite writer regressions. Prior actual Docker range counted Sectioning/TOC calls; no consent refresh to an unrelated writer or silent successful zero-call replacement. |

## Independent review and final checks

The two frozen reviewers built separate requirement/public-entry maps from the original spec, feedback, human decisions and exact candidate. Codex independently ran 506 committed tests and found F-1/F-2; Claude independently ran the full 6,004-test suite and identified CF-1/CF-2. Neither reviewer executed the parent's prior full platform matrix. Original failed assertions and setup errors remain retained.

A separate focused reviewer then independently inspected and executed the fixes at `056e5b43`: 228 committed cases plus nine separately authored probes, **237 passed**. After the actual-browser token gap, it rechecked the new correction at clean `8ec35328`: 66 committed tests plus four separately authored probes, **70 passed**, no additional material finding. These are different subsets/checkpoints, not 307 unique final-head tests. It inspected the browser finding but did not independently run that browser. No whole-contract review loop was restarted for bounded fixes. The reviewer also inspected the completed integrated-head command receipts, actual image/package provenance, 11-scenario browser matrix and both 22-fixture restart/export records. It confirmed the assembled scope and exact-head attribution, with wording corrections incorporated; this final evidence inspection did not re-execute the parent’s workloads or find a new implementation defect.

The following checkpoint table records commands run at clean `8ec35328` through the external `probes/run.py` lock/receipt wrapper. It pins the checkout/resources and isolated books, strips provider credentials and blocks external provider traffic/CLIs; build dependency downloads are allowed separately. Exact command arrays, duration, head and exit are in matching `logs/*.json` and full `.log` files.

| Command | Final result |
|---|---|
| `pnpm build` | Passed. |
| `pnpm exec vitest run --maxWorkers=1` | **476 files / 6,030 passed / 16 Linux-only skipped**, exit0, 670.73 seconds wrapper time. Includes invariant, real SQLite/filesystem, HTTP publication, owner/freshness, draft/session and transport-accounting regressions. |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Both passed. |
| `pnpm lint` | Passed; same eight unused-suppression warnings as the preserved 6753 baseline. |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio exec lingui compile --strict`; `pnpm --filter @adt/studio build` | All passed; 4,476 entries per locale, zero missing in en/es/fr/pt-BR/sq; catalogs unchanged. |
| `git diff --check df4df3aa7b5e37114f5e86db3d1cbf9bac3ce2a0` | Passed, including the complete develop-to-branch diff. |
| `docker build --network=host --target app --label org.opencontainers.image.revision=8ec35328f5d97dfa9b8dd2b2b87a48e8ae37f55b -t adt-spec0002-final-review:8ec35328 .` | Passed; fresh combined API/nginx/Studio image. `--target build` with tag `adt-spec0002-final-review:checks-8ec35328` also passed. |
| `zsh probes/linux-writer-reviewed.sh` | Fresh build image, network disabled: **30 passed**, including all 16 Mac skips. Focused Linux suite, not a second full Linux repository run. |
| `python3 probes/browser-matrix-final.py` + corrected fresh-copy probes below | **Eleven scenarios passed**, plus two stricter recovery/settled-next-Save repeats. Initial failures and corrections retained. |
| `python3 probes/docker-final-acceptance.py` | **11 books / 900 ZIP members / 286 original media files**: actual restart, identical member bytes/current/history/English+French preview, zero additional provider calls. |
| `pnpm --filter @adt/desktop build:unpack --publish never --config.directories.output=<evidence>/desktop-final-review-unsigned`; `node probes/check-packaged-studio-final.mjs 8ec35328…`; `python3 probes/desktop-acceptance-final.py 8ec35328…` | Passed unsigned build (21.15s), 22 actual ASAR Studio files and API/WASM/resources hashes. Bundled API under Node restart/export: 11 books/900 ZIP members/286 media unchanged, zero provider calls (21.52s). Not Electron GUI/hardened launch. |
| `python3 probes/compatibility-reviewed.py` | Passed (4.08s): 1,822 sources match `ef31494dc2951b92222c473960fecee2d91f9544`; rebuilt old API/runtime; four current guarded Saves → separate old API read/preview/web export → current reopen, authorship/IDs/history unchanged. |

The fresh combined app image ID is `sha256:72f5fcd244e1c0793cfa2e9de7da9d0060d6ce415241b645b1992ae2267772c9`. Revision labels, API/config/transport hashes, mounts and accepted book list are recorded in `results/docker-reviewed-runtime-provenance.json`. Provider calls are counted at the actual stubbed fetch boundary; no paid generation was used.

Actual browser cases on that image:

- `node probes/settings-successor-browser.mjs {toc|sectioning} {held|failed}`: four cases, retry3→4 Save succeeds despite delayed/failed refresh; model-only next Save persists4; zero provider calls.
- `node probes/settings-map-successor-browser.mjs`: removed inherited type remains a raw null marker, independent type addition and mode change survive the next model-only Save; zero calls.
- `node probes/translation-recovery-browser.mjs {load-latest|converged}`: actual external Save → rejected409 → recovery. The externally saved first entry is now current and correctly offers no redundant Keep. The still-needs-review neighbor offers Keep; its first request succeeds, then the first entry's next guarded Save succeeds at the recovered/reviewed version. Extra `REVIEW_SUFFIX=-settled` / `-settled-wait`, `REVIEW_ACCEPT=false` probes assert no draft barrier after opening the current row and await the next Save bar/draft barrier clearing. The changed-row hash counterexamples are independently covered by mounted token-sensitive tests, not mislabeled as browser Keep on the now-current row.
- `node probes/translation-metadata-browser.mjs`: unrelated actual editor Save retains complete manual/unknown duplicate metadata in receipt and current record, with zero Save provider calls. Ordinary run generates only twelve genuinely missing Easy Read translations in one transport, excludes all protected source text, and retains protected entries. The second ordinary run submits zero translation requests.
- `node probes/storyboard-combined-browser.mjs {ordinary|replace|race}`: named four-page confirmation, cancellation and default-off reopen; ordinary combined run makes zero Sectioning calls and keeps page versions; explicit replacement makes four calls and retains prior history. A competing external Save causes409/zero calls, followed by a fresh successful confirmation. Actual POST admission and worker settlement are both observed.

The eleven-book platform cohort is pinned separately in `accepted-platform-labels-8ec35328.json`; the two additional settled-UI repeats are browser controls, not retroactively counted as thirteen platform books. Previous 32-book/2,639-member/832-media evidence at6753 remains historical and attributed to that source.

Preserved failures and evidence corrections: the initial 056e full run had one Git-helper fixture failure because TMPDIR was inside a repository; the corrected outside-Git probe and final entire suite pass. A Docker build hit full-VM/APT signature errors; stopped task runtimes were recoverably archived before a clean rebuild, with no verification bypass or original-book/volume deletion. Initial browser fixtures omitted valid body-text nodes in the stub and assumed missing Easy Read translations could produce zero calls. After the recovery fix, a probe incorrectly sought Keep on an already-current row; a stricter repeat also asserted before asynchronous recovery settled. Corrected probes use fresh copies, appropriate still-needs-review targets, actual call contents/counts and awaited UI completion. The initial Desktop build was stopped when the deliberate network guard blocked npm; its log is retained, and dependency-only retry is reported separately. These are harness/environment failures, not silently labeled pre-existing product defects. Original product failures were reproduced and committed fixes were independently rechecked.

### Latest develop integration checks at afd93f61

The late upstream crop-control change is integrated in clean `afd93f61ff31432086490f70df4f335748496197`, based on develop `10c32c0baca02b89076231a6fd1674b46d4a37b5`. These results are separate from the 8ec35328 checkpoints above.

- `pnpm exec vitest run --maxWorkers=2`: **476 files / 6,030 passed / 16 Linux-only skipped**, exit0, 452.81 seconds wrapper time.
- `pnpm build`, `pnpm typecheck`, `pnpm --filter @adt/runtime typecheck`, `pnpm lint`, `pnpm --filter @adt/studio extract`, `pnpm --filter @adt/studio exec lingui compile --strict`, `pnpm --filter @adt/studio build`, and `git diff --check 10c32c0baca02b89076231a6fd1674b46d4a37b5`: all exit0. Extraction reports **4,478** entries per locale with zero missing; catalogs remain unchanged.

| Integrated-head command | Result |
|---|---|
| `docker build --network=host --target app --label org.opencontainers.image.revision=afd93f61ff31432086490f70df4f335748496197 -t adt-spec0002-final-review:afd93f61 .` | Passed, 104.93s; actual runtime image `sha256:c74eb8d0b4f90db0ebcfe483fcb0047b0eb98f5ea9ee099924b59e4a488dd1dc`. |
| `python3 probes/browser-matrix-integrated.py` | **11/11 passed** in 39.93s on fresh isolated copies; no failing scenario in this integrated-head run. Same eleven paths described above, including settled recovery/next Save. |
| `python3 probes/docker-integrated-acceptance.py` | Passed, 60.99s; **22 fixtures  / 1,800 ZIP members  / 572 original media files**, current/history/English+French preview identical across actual restart, zero additional provider calls. This cohort combines eleven preserved 8ec fixtures and eleven fresh integrated-head fixtures, rather than claiming 22 distinct journeys. |
| `pnpm --filter @adt/desktop build:unpack --publish never --config.directories.output=<evidence>/desktop-integrated-unsigned`; `node probes/check-packaged-studio-integrated.mjs afd93f61…`; `python3 probes/desktop-acceptance-integrated.py afd93f61…` | Fresh unsigned build passed (15.04s); 22 actual ASAR Studio files match the build, and API/WASM/resources match. Actual bundled API under Node in two separate processes: **22 fixtures  / 1,800 ZIP members  / 572 media** preserved, zero additional provider calls, 41.48s. Not Electron GUI or hardened/signed launch. |

No runtime source changed after these checks. The final evidence commit changes documentation only. The focused 30-test Linux writer run and bounded built-old reading probe remain attributed to 8ec35328; the late integration changes only ImageCropDialog and five locale files, leaving the exercised backend/storage/worker/output/CLI source byte-identical. They were not falsely relabeled as executions at afd93f61. Full integrated-head Vitest rechecks those committed suites on Mac; the 16 platform-only cases retain their separately attributed Linux evidence. `pnpm build` plus `pnpm exec vitest run` executes the repository's actual pretest/test commands; the worker limit is an execution setting.

The final read-only remote check at 2026-11-01T23:23:13Z still observes develop 10c32c0b, remote #880 at 09f0d1c7 on its old SPEC-0001 base (open draft), and #884 open at c71605454126c29f8f6e5dab56ee90385012b886. It does not publish this candidate or waive the recorded merge order.



Committed regression entry points for this round: [config route/storage receipts](../../apps/api/src/routes/books.test.ts), [both Settings callers and delayed receipt adoption](../../apps/studio/src/hooks/use-book-config.receipt.test.tsx), [real HTTP preservation/publication](../../apps/api/src/routes/manual-edit-survival.test.ts), [mounted translation recovery and next review/Save](../../apps/studio/src/components/pipeline/stages/languages/LanguageView.review.test.tsx), [combined Storyboard confirmation](../../apps/studio/src/components/pipeline/stages/storyboard/StoryboardLandingPage.confirmation.test.tsx), and [stored-empty TOC read/output policy](../../apps/api/src/routes/toc-reading-order.test.ts). Retained original findings are covered by the HTTP suite plus [rendered ownership](../../apps/api/src/routes/rendered-ownership.integration.test.ts), [TOC editor recovery](../../apps/studio/src/components/pipeline/stages/toc/TocView.recovery.test.tsx), and [selected-page Revert](../../apps/studio/src/components/pipeline/stages/sectioning/RevertSectioningEdits.test.tsx). Full-suite coverage also includes [translation windows/accounting](../../packages/pipeline/src/__tests__/catalog-translation.test.ts), [quiz grouping](../../packages/pipeline/src/__tests__/quiz-generation.test.ts), [quiz identities](../../apps/api/src/routes/quiz-id-lifecycle.test.ts), and [bounded CLI stamping](../../packages/pipeline/src/__tests__/cli-authorship.test.ts). External actual-browser/platform probes are linked by command/receipt paths above; they are not presented as newly committed tests.

## AC-to-evidence matrix

“Passed” means the exercised supported contract, not exhaustive book/interleaving/platform certification. Explicit deferrals are known failures, not passes. The full latest branch suite rechecks committed regressions; new real-browser/platform work targets changed and adjacent paths. Older unchanged UI walkthroughs retain their original head attribution.

| AC | Status | Evidence / qualification |
|---|---|---|
|1|Passed|Server changed/new-only stamps; no-op AI/unknown provenance; current/receipt/history and opaque duplicate metadata; Save makes no provider call.|
|2|Passed automated; field not run|Fixed full-source windows, protected/current exclusion, request/cache/provider/retry/cost distinctions and 8,850-entry/177-window experiment. No force-fresh action or private-book cost claim.|
|3|Passed|Quiz edit/no-op/reorder and stable quiz/option identities; replacement consent and retained history.|
|4|Passed|Complete protected source-page sets, no regrouping, no eligible/all protected/partial overlap/repeat cases, dependent audio/translations and explicit reading order.|
|5|Passed|Whole-document TOC stamps and no-op provenance; stored-empty AI/unknown cases newly verified.|
|6|Passed supported paths; D3 deferred|Named TOC confirmation, cancel/stale rejection/next successful replacement; combined-range consent. Saved-empty Run remains D3.|
|7|Passed required behavior; D4 deferred|Whole-page/both-page structural routes and changed-only authorship; redundant unchanged AI-edit versions remain D4.|
|8|Passed|Manual/unknown/empty whole-page protection and fixed tree/HTML pair through success/failure/cancel/restart.|
|9|Passed exercised chain, qualified; private not run|Six-unit Save → actual HTTP own/upstream run → read/history → preview/export suites; final runtime persistence/restart. Legacy-owner qualification and full Storyboard-rerun non-goal remain.|
|10|Passed required controls; D6 deferred|Authorship badges and named consent, five locales and lint. Exact adjacent-page error remains D6.|
|11|Passed bounded reading|Unknown/legacy/canonical precedence tests and current Save → built-old read/preview/export → current reopen; no old-build editing/reruns or pre-schema14 certification.|
|12|Passed supported restore; D1 deferred|Selected-page highest earlier explicit-AI Revert, cancellation/missing/stale/busy/history/neighbors and guarded next Save. Same-page net-clean-after-Revert remains D1.|
|13|Passed|Delete-last/empty pages, both cross-page merge sides, stale-neighbor protection and moved content exactly once.|
|14|Passed supported retirement; repair deferred|Active source removal/history/recovery and physical assets; K3/history reconstruction remains ratified follow-up.|
|15|Passed|Named default-off Sectioning confirmation including combined Storyboard path; cancellation/reopen, frozen versions and external409 → fresh next run.|
|16|Passed exercised atomicity|Failure/cancellation/publication transaction tests; protected versions/identities retire only at successful publication.|
|17|Passed supported outputs, qualified|Current manual output and stable ownership; every stored empty TOC stays empty under explicit owner decision; fresh restart/export checks. Legacy omission and SCORM platform finding remain.|
|18|Passed corrected required paths; D1/D2/D5 deferred|Four-unit guarded APIs; TOC identity policy; Settings receipts; translation recovery/first review/next Save; stale/paused/cancelled/late/third-writer cases. No exhaustive race claim.|
|19|Passed bounded contract|CLI/DAG AI stamping and existing shared quiz batching; not general CLI preservation/resume or SPEC-0010 completion.|

## Explicit deferrals, non-goals and remaining gates

Only [owner comment 6137679220](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220) authorizes these six SPEC-0002 deferrals. They remain open and were not silently repaired or broadened:

| Item | Explicitly deferred behavior |
|---|---|
|D1|Same-page net-clean Sectioning guarded draft after Revert; not translation or cross-book recovery.|
|D2|Quiz deletion bypassing an unresolved Save conflict; not Add/Replace consent.|
|D3|Saved-empty protected TOC offers a Run that silently skips; distinct from stored-empty output policy.|
|D4|Unnecessary unchanged AI-edit page-sectioning versions.|
|D5|Stale Save-error banner after Discard.|
|D6|Exact untranslated “Adjacent page no longer exists”.|

[Final SPEC-0001 ratification/Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170) and [mandatory follow-up](https://github.com/unicef/adt-studio/pull/879#issuecomment-6340376966) remain operative: retain raw/history/assets but omit unverifiable or contradictory owners from Preview/export with disclosure; no positional repair. Positional activity carry-over, K3 ownership reconstruction, staged Speech, SPEC-0013 preparation classification, bulk/projection/Storyboard-no-op, blank-ID/pre-schema14 and performance #995–997 follow-ups are not reopened. Shared admission, freshness, ownership, lineage and publication mechanisms are reused.

Full Storyboard-rerun preservation, new page/section regeneration, broad Sectioning-mode lifecycle, a fifth Easy Read slice, general CLI preservation/resume and EPUB/PNLD redesign remain documented non-goals. The owner-authorized narrow fixed-layout JSON-null and sharing stable-identity corrections remain in the branch; neither imports a downstream subsystem.

The same owner comment requires **#884 before #880 merges**. Narrow resolver adaptation does not waive this order. Publication requires later authorization, remote recheck, lease-protected history rewrite and proposed develop retarget; exact published-head CI must then be verified. No old-head CI is presented as certifying this local source.

Open platform findings remain **unresolved, not approved deferrals**: default ad-hoc hardened Mac launch fails library validation, and cross-origin SCORM window.API access raises SecurityError in Electron Preview. The former was not proven by an independent built-develop launch; the latter has a byte-identical baseline adapter/two-origin reproduction. Fresh unsigned bundled-API checks do not close either finding.

Private Frankenstein/De-codable/Mathematics STD5/Tanzania acceptance, live-provider quality, real cloud, low-end hardware, signed/all-OS releases and hosted CI for this unpublished head remain pending. There is no `pnpm acceptance` or `pnpm lint:invariants` command; existing invariant suites run in Vitest. Synthetic scale and transport stubs do not substitute for the assigned field/release gates. No paid provider call or original-book mutation was required.
