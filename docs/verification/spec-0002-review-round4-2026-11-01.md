# SPEC-0002 fourth review remediation — 1 November 2026

The latest independent whole-contract review found **IR4-1 (P1): a net-clean Sectioning draft could cross books and the next Save could overwrite the destination book's source tree**. The narrow session correction is committed at `d890b0de65a87734f961f2dd2a5da84908b98292`. Follow-up actual navigation acceptance also exposed IR4-R2: Stay retained the draft but misaligned the native browser URL after multi-entry Back/Forward. Its shared indexed-history rollback correction is committed at `f13cd2a121a74ac2bb5c969c7c5a20adce8de15f`, with the independently discovered native-integer safeguard at final source `d2811b65cc8a65c8c1d02b93f7fb643e450a5ad6`. The Sectioning correction isolates the full editor session by book/page and guards retained callbacks, late local state and delayed recovery-cache adoption. It deliberately does not reset drafts on saved-version changes or implement the exact deferred D1 Revert case. This is a qualified implementation, not unconditional full-contract completion, approval or release certification.

Everything remains local in PR #880's existing branch. No push, retarget, PR title/body/comment/review request, merge, issue closure or approval change occurred. The main agent was the sole production writer; independent reviewer probes and all runtime fixtures are outside Git. Execution workloads were sequential. Original books, drafts and unrelated checkouts were retained. Previous evidence was retained except for one regenerated media-check JSON disclosed in the final runtime section and external `results/media-harness-correction.md`.

## Exact checkpoints and scope

| Checkpoint | Identity |
|---|---|
| Develop comparison and merge base | `df4df3aa7b5e37114f5e86db3d1cbf9bac3ce2a0` |
| Published SPEC-0002 | `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89` |
| Reviewed local predecessor | `29cf08cf9f14a3ae41b953874d1033e9ce8e9fa2` |
| Session correction | `d890b0de65a87734f961f2dd2a5da84908b98292` |
| Indexed history correction | `f13cd2a121a74ac2bb5c969c7c5a20adce8de15f` |
| Final production/test safeguard | `d2811b65cc8a65c8c1d02b93f7fb643e450a5ad6` |
| Recovery ref | `refs/backup/spec-0002-before-review-round4-nov01` retains the predecessor |

The read-only remote refresh found no drift. PR880 remains open, based remotely on `spec/735-per-section-staleness`; proposed later base is develop. The named prerequisite branch is `811d14751d6e01a8262d3e34466c1f45875b8ca1`; GitHub's PR base record is `aefe41855ae63d89c09db5553c50f48eb01b190d`. SPEC-0001's squash merge remains `c153ba7d26c2323b67236c61297999424b169ac1`. This round does not replay the old stack or import another PR. The PR body SHA256 remains `045d93eaa52081a92bffe677aebd8e03d3b3f6298db08d886202e70a77dcfb86`.

The production increment changes `SectioningPageDetail.tsx` with its 12-case scope test, and patches the existing pinned `@tanstack/history@1.154.14` rollback point (source/ESM/CJS) with thirteen installed-library tests and matching manifest/lockfile patch hash. No dependency was added or upgraded. No API, storage, schema, provider, generic draft/query behavior or Studio string changed. Prior SPEC-0001/SPEC-0002 code and owner UI/spec/INDEX/ADR work remain intact. The new keyed session contains book and page, **not current version**, so same-page refetch/conflict behavior is retained. Successful old requests still invalidate their captured book/page; only retired-session writes to local state and recovery cache are suppressed. Revert's existing child is unchanged so its successful version-keyed remount still releases the same parent's busy state.

## Feedback and evidence

| Item | Result and evidence |
|---|---|
| IR4-1 P1, cross-book Sectioning source overwrite | Fixed at d890b0de. Original independent browser reproduction used equal pg001/section IDs and version2, B edit→original/blur, history back to A, then real confirmed Save. No Revert occurred. It corrupts source while retained original A HTML/Preview stays unchanged; it is not evidence of immediate cross-book rendered output. |
| Baseline attribution | External reviewer also reproduced the defect class on explicit develop, with an extra Discard & leave step. It is a required nondeferred preservation defect, not wholly introduced by this integration. |
| Lifetime safeguards required in addition to a key | Initial old-source regressions: 8 failed/2 passed. Key-only intermediate: 3 failed/7 passed, exposing captured old Save, late failed-session recovery and old reload downgrading reopened cache v4→v3. Final 12 cases pass, with two additional controls added after these initial runs. Original logs/patch retained. |
| IR4-R2 P2, Stay URL/history mismatch | Inherited dependency always called `history.go(1)` after a blocked POP. Separate candidate and built-develop browser checks capture B draft retained, no writes, native URL Home/index1 instead of B/index4. The correction uses the inverse safe nonzero indexed delta and retains the prior invalid-index +1 fallback (no foreign-history repair claim). Three of nine real-library cases failed before. The independent review then exposed ±2**32 wrapping to native zero/reload; d2811b65 adds the signed-32-bit range guard. Four additional fallback cases failed before that guard. All 13 committed cases and the unchanged two native overflow probes now pass. |
| Independent session recheck | 77 committed tests plus 7 additional adversarial probes passed at frozen d890b0de. Same-book page ABA, stale callbacks, busy newer requests, cache downgrade, structural failure and actual-shaped Revert pointer rollback→next Save covered. This is a bounded fix review, not a second fresh full-spec review. |
| Independent final history recheck | 29 committed +10 independently authored ESM/CJS/native navigation controls +2 unchanged overflow probes passed at d2811b65. Exact patch hash matches lock and installed source/ESM/CJS. The first unsafe-integer patch and failed probes remain recorded. |
| IR3-1 / IR3-R2 | Book/open-session quiz consent and fresh post-open query recovery unchanged. Full branch regression execution is separate from the original review's fresh browser/scoring/platform evidence at 29cf08cf. |
| REV-1 / REV-2 / net-clean successor / FIND-1 / FIND-2 | Landing consent scope, exact translation save receipts, duplicate and first-language recovery unchanged. Preserve their original source/transport/actual-browser evidence and current regression coverage. |
| F1 | Stable rendered owner/answer/translation/audio, retirement/prune/restore code unchanged. Ratified ambiguous legacy omission qualification remains. |
| F2 | TOC target/document identity conflict and guarded recovery unchanged; no translation compatibility exception added to TOC. |
| F3 | Fixed positioned tree and HTML pair preservation unchanged, including the separately authorized narrow JSON-null prerequisite correction. |
| F4 | Same-run Sectioning→TOC transition receipts and external writer rejection unchanged; implemented combined flow is not re-deferred. |
| Writer recovery R1 | Unchanged writer source. Earlier Linux forced-crash/PID-reuse evidence remains tied to 99352015; this round's graceful restart cannot substitute for a new forced-crash claim. |

The original completed review and all companion files are in main-checkout `.local-docs/spec0002-independent-review-20261101-162910-codex/`. The new plan, contract ledger, failed-before probes, logs, runtime results and independent source/execution reports are `.local-docs/spec0002-review-round4-fixes-nov01/`. That external ledger includes the complete independently derived requirement matrix; the summary below does not replace it.

## Automated and independent verification

Commands ran from `tmp/spec-0002-implementation`, with Git-dependent commands using `DEVELOPER_DIR=/Library/Developer/CommandLineTools`. The runner strips provider credentials, blocks provider CLIs and rejects external test-network access. Build/package dependency downloads are separate from provider calls. Evidence root below is main-checkout `.local-docs/spec0002-review-round4-fixes-nov01/`.

| Check | Exact outcome |
|---|---|
| Session regressions on old source | 8 failed/2 passed. Key-only intermediate 3 failed/7 passed: retained old Save, dead-session recovery and reopened-cache downgrade. Two additional controls were added later. Original logs and key-only patch retained. |
| Parent focused Sectioning/guard/API suite at d890b0de | 6 files/81 passed, 43.23s. Real SQLite/filesystem survival route coverage is separate from mounted component API mocks. |
| Initial shared-history regressions | 3 failed/6 passed on unpatched installed package. Real native URLs/indexes are asserted for ±1/±4; a later allowed navigation must still work. |
| Range safeguard regressions | 4 failed/9 passed at f13cd2a1; final history/session/guard selection 29 passed, 3.81s. Independent actual native overflow probes separately failed twice before and passed unchanged after. |
| `pnpm build` | Passed final source, exit 0. |
| `pnpm exec vitest run --maxWorkers=2` | **470 files; 5,950 passed, 16 Linux-only skipped, 5,966 collected; 438.97s**, exit 0 at d2811b65. Earlier d890b0de run passed 5,937/16; it is not substituted for this final run. |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Both passed final source. |
| `pnpm lint` | Passed, zero errors; same eight unused-suppression warnings recorded in the preceding d890b0de and reviewed-baseline logs. |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio compile --strict`; `pnpm --filter @adt/studio build` | Passed; 4,475 messages per locale, zero missing in en/pt-BR/es/fr/sq; no catalog change. |
| Invariants / diff | Invariant regressions included in full suite; repository defines no separate invariant command. Working-tree diff check passed; final develop-to-head check recorded with delivery. |
| Independent session review at d890b0de | 77 committed +7 independent adversarial tests passed. Book/page ABA, old request completion versus a new busy request, stale reload/cache, structural failure and Revert pointer rollback→next Save covered. |
| Independent history review at final d2811b65 | **29 committed +10 independently authored ESM/CJS navigation controls +2 unchanged overflow probes =41 passed**. Patch SHA256, lock hash and installed source/ESM/CJS agree. No remaining material finding in this bounded correction. |

Full commands/results are in `results/checks-final.json`, `probes/run-checks.py`, `logs/*-final.log`; independent exact commands and distinctions between execution and inspection are in `independent/execution-recheck-d890b0de.md` and `independent/history-execution-recheck-d2811b65.md`. Counts overlap; they must not be added to the full-suite total. The separate reviewer received the original whole-contract report/spec, wrote its own requirement map, found the unsafe-integer edge case, and rechecked its unchanged failing probes after correction. This does not replace a fresh whole-implementation review of the final branch.

The original independent scratch Revert toast assertion initially failed because the external test resolved a different `sonner` mock. An explicit alias to the Studio dependency made the same assertion pass without a production change. Both failed and corrected logs/configs remain. The history overflow failures were actual patch defects and required the additional source correction; they are not classified as harness failures.

## Final browser, package and compatibility acceptance

All new execution below uses frozen production/test `d2811b65`, with fresh copied fixtures. The image is `sha256:88f27b192b0bec6fbea3218e6cf81facbe0c7c9834f3d8df5d85a42f82330d8d`; its OCI revision matches that head. No paid providers were invoked: final browser, export, restart and compatibility runs record zero transport calls, with credentials stripped and provider CLIs blocked.

| Final check | Result and observable assertions |
|---|---|
| `docker build --network=host --target app --label org.opencontainers.image.revision=d2811b65cc8a65c8c1d02b93f7fb643e450a5ad6 -t adt-spec0002-round4:final .` | Passed fresh combined app build. Own image/container, isolated books and read-only fixture configuration; image/mount/config/transport hashes retained. |
| `python3 probes/browser-batch.py final` | Five actual UI scenarios passed: original net-clean B→history A, dirty Stay then Discard & leave, successful Save & leave, external v3→409→Keep my changes→successful next guarded v4 Save & leave, and old-book Revert consent isolation plus same-page successful restore→next Save. Source current/history, other book, three neighboring pages and retained owner HTML/Preview asserted; zero provider calls/browser errors. |
| `node probes/sectioning-stay.mjs stay-back final`; `... stay-forward final` | Actual dirty multi-entry native Back -4 and Forward +4→Stay keep editor, draft, native URL and native index aligned. No write before explicit Save; next real guarded Save succeeds for the correct book, other book/history/Preview stay unchanged and next ordinary navigation works. Distinct screenshots and native history snapshots retained. |
| `node probes/export-recovery.mjs docker-before`; `docker restart adt-spec0002-round4-final`; `... docker-after`; `python3 probes/check-export.py docker-before docker-after` | Fourteen books exported on both sides of restart. All four pages' current Sectioning, Sectioning/rendering history, quiz current/history, catalog and Preview remain equal. **1,176 ZIP members** have identical bytes and CRCs; exported English texts equal Preview. This is graceful restart, not a newly tested forced-crash scenario. |
| `python3 probes/check-media.py books docker-after-corrected` | All **364 original image/audio/video files across 14 books** remain byte-identical. This corrected run supersedes the first media helper result, which pointed at the preceding round's ten books. |
| `pnpm --filter @adt/desktop build:unpack --publish never --config.directories.output=<evidence>/desktop-unsigned` | Passed fresh macOS arm64 **unsigned** package, with signing/notarization disabled. No installer publication. |
| `node probes/check-packaged-studio.mjs d2811b65cc8a65c8c1d02b93f7fb643e450a5ad6` | All 22 fresh Studio files match the actual package's ASAR renderer bytes, including the built shared-history correction. |
| `python3 probes/desktop-acceptance.py d2811b65cc8a65c8c1d02b93f7fb643e450a5ad6` | Actual packaged API under Node 24.13.0 with PROJECT_ROOT/prompts/templates/resources pinned to the app, fresh copies of all 14 books and two separate API processes. API plus three WASM artifacts and prompts/templates/assets/config hashes match the fresh build. Before/after exports preserve current/history/Preview and all 1,176 member bytes; all 364 media files unchanged; zero provider calls. |
| `python3 probes/check-export.py docker-after desktop-before` | All 14 books/1,176 exported members match between Docker and the packaged API. |
| `python3 probes/check-old-baseline.py`; `node probes/compatibility-retained.mjs --baseline <repo>/tmp/spec-0002-evidence/compat-before` | All 1,822 retained baseline source blobs match `ef31494dc2951b92222c473960fecee2d91f9544`. Current guarded Save of four units→that built-old API reads/Preview/Web export→current reopen passes with authorship, IDs and history unchanged. The retained baseline is a built source snapshot without its own `.git`, not the enclosing main-checkout HEAD. No fresh old-build compilation or downgrade editing/rerun claim. |

Exact commands and logs are in `probes/runtime-final.py`, `results/runtime-final.json`, `probes/desktop-final.py`, `results/desktop-final.json`, `results/desktop-runtime-provenance.json`, `results/packaged-studio-manifest.json` and `logs/`; all probe/source files are retained outside Git. `results/media-docker-after-corrected.json` is the valid current Docker media check. The first media invocation read the preceding round and re-wrote its deterministic generated `media-docker-after.json`; no pre-write hash was captured, so exact preservation of that one prior generated JSON is not claimed. Original books and other prior reports/probes were unchanged. This is a harness correction, not a production fix.

The fixtures model equal book-local IDs/versions with different authored source, protected manual/unknown history, existing rendered HTML and physical assets, plus external-writer conflicts. They are synthetic four-page copies, not the assigned private historical/field books. A source-only Sectioning Save does not regenerate Storyboard HTML: retained Preview correctly stays with its original owner. The source corruption in IR4-1 must not be described as immediately replacing Preview HTML. The actual Revert fixture retains unknown v1, restores manual v3 to explicit AI v2, and next Save creates v4 using baseVersion2; it does not guess AI provenance for v1.

Preserved setup failures include an initial dialog-role selector mismatch and Home's alternate book-card selector. Those are not product failures. The independent actual Back/Stay URL mismatch and native numeric-overflow reproduction were product defects and required code corrections. Final browser Back and Forward both pass. Earlier image/container checkpoints were archived before replacement; unrelated containers, images, volumes and original books were not removed. No Electron GUI, hardened launch, signing, real-cloud or all-platform claim follows from the unsigned API/resource and ASAR-byte checks.

## AC-to-evidence matrix

Passed means the supported behavior exercised by the cited automated/runtime checks, not universal completion. Earlier browser proofs remain attributed to their actual heads; final runtime evidence here covers the affected Sectioning/navigation paths and output/restart. The full independent requirement/clarification map is preserved in the external ledger and original whole-contract review.

| AC | Status | Evidence and qualification |
|---|---|---|
| 1 | Passed exercised behavior | Full route/editor stamping, no-op/unknown provenance, exact transaction receipt, successor/neighbor/history and zero Save-call regressions. No translation implementation changes this round. |
| 2 | Passed automated; field acceptance not run | Complete ordered windows before filtering, current-output skipping, payload exclusion and separate skipped/adapter/cache/provider/retry/cost assertions; 8,850-entry/177-window experiment remains distinct. No force-fresh or STD5 field claim. |
| 3 | Passed | Quiz changed/new-only stamping, no-op/reorder, stable quiz/option identity and history regressions. Prior actual-browser/scoring evidence remains at its recorded head. |
| 4 | Passed | Complete source-page grouping, partial overlap/all-protected/no-eligible/repeat-run and dependent/order regressions. No regrouping exception introduced. |
| 5 | Passed | Whole-document TOC stamps/protection/history regressions; unchanged implementation. |
| 6 | Passed supported paths; D3 explicitly deferred | Named TOC consent/cancel/stale/combined-run coverage. Saved-empty protected landing Run no-op remains D3. |
| 7 | Passed required stamping; D4 explicitly deferred | Structural/both-page/no-op provenance and server guards. Unnecessary unchanged AI-edit versions remain D4. |
| 8 | Passed | Whole-page/empty/unknown protection and fixed tree+HTML pair success/failure/cancel/restart regressions. |
| 9 | Passed exercised chain, qualified; private acceptance blocked | Real-storage HTTP Save→own/upstream run→read/history/output suite and affected final Docker/package acceptance. Private/field-book tests unavailable; ratified legacy omission policy retained. |
| 10 | Passed required controls; D6 explicitly deferred | Controls/badges and five-locale extraction/strict compilation. No new Studio string; exact adjacent-page error remains D6. |
| 11 | Passed bounded reading | Unknown protection/migration regressions and final guarded current Save→built-old API entity reads/Preview/export→current reopen. No safe downgrade editing/reruns or general pre-schema-14 certification. |
| 12 | Passed supported restore; D1 explicitly deferred | Selected-page highest earlier explicit AI Revert, guarded restore/stale/busy/cancel/neighbor/history tests; actual version rollback→editable next Save. The exact same-page net-clean-after-Revert D1 is untouched. |
| 13 | Passed | Delete-last/empty manual pages, both cross-page merge sides, stale neighbors and moved-content uniqueness in real-storage tests. |
| 14 | Passed supported retirement; ratified repair deferred | Retired active membership with history/physical assets preserved and legacy translation pass-through. K3/ownership reconstruction remains follow-up. |
| 15 | Passed | Named/default-off replacement, frozen versions and scope revocation/stale refusal across landing and run route. |
| 16 | Passed exercised publication | Failure/cancel/publication retirement and book/open-session replacement consent regressions. No claim that closing a dialog rolls back an already committed request. |
| 17 | Passed supported output; platform finding open | Stable-owner/navigation/Webpub/quiz association regressions and current/history/Preview/export/restart/media checks. P2 cross-origin SCORM remains open, not deferred. |
| 18 | Passed corrected required paths; D1/D2/D5 explicitly deferred | New book/page session reset and ABA/late callback/cache guards; history Stay rollback with no native overflow reload; actual rejected Save→recovery→next Save, Stay/Discard/Save & leave and next navigation. Exact three deferred failures remain. No exhaustive interleaving claim. |
| 19 | Passed bounded contract | CLI/DAG AI stamping and shared quiz-batching regressions. Not general CLI preservation/resume or SPEC-0010 completion. |

## Explicit scope and remaining acceptance

Only [PR880 comment 6137679220](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220) authorizes D1–D6:

| Deferral | Exact remaining case and boundary |
|---|---|
| D1 | Net-clean guarded Sectioning draft after SAME-page Revert. Cross-book/page session leakage is not this case. |
| D2 | Quiz deletion after unresolved Save conflict. Does not waive Add/Replace consent or recovery. |
| D3 | Saved-empty protected TOC landing Run silently skips. |
| D4 | Unnecessary unchanged AI-edit page-sectioning versions. |
| D5 | Stale Save-error banner after Discard. |
| D6 | Exact untranslated “Adjacent page no longer exists” error. |

No new product decision or deferral is inferred. These known exact failures remain visible, not counted as passed or silently corrected.

[SPEC-0001 final ratification/Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170) retains positional activity carry-over; ownership repair/history reconstruction including K3; staged Speech publication; SPEC-0013 preparation classification; named bulk/projection/Storyboard-no-op follow-ups; historical blank-ID repair and uncertified pre-schema-14 books. The [later mandatory timing/draft/harness decision](https://github.com/unicef/adt-studio/pull/879#issuecomment-6340376966) remains required. Unverifiable/contradictory owners are retained raw/history/assets but omitted from Preview/export with disclosure. Performance #995–997 stays out of scope; necessary integrity checks remain.

Full Storyboard-rerun preservation, new scoped generation, broad Sectioning-mode lifecycle, a fifth Easy Read slice, general CLI preservation/resume and EPUB/PNLD redesign remain documented non-goals. Private Frankenstein/De-codable/STD5/Tanzania, live-provider quality, real cloud, low-end hardware and signed/all-OS release acceptance are not established by synthetic fixtures. Exact unpublished-head hosted CI cannot run under this round's no-publication instruction.

P1 default ad-hoc hardened Mac launch and P2 cross-origin SCORM exception remain open prior platform findings, **not approved deferrals**. Unsigned packaged API/resource checks and same-origin reader behavior do not close them. Mac's 16 Linux-only skipped tests remain explicitly skipped; prior Linux writer/forced-crash evidence is checkpoint-specific.


## Readiness assessment

The independent reviewer also inspected the completed evidence and both handoff prompts without running competing workloads. It requested qualification of the prior-media-JSON preservation statement; that correction was rechecked. No remaining material reporting/scope concern was found. This read-only pass is recorded in external `independent/evidence-scope-review-d2811b65.md`; it is not another full independent runtime or whole-spec certification.

The new confirmed preservation/navigation defects are corrected, independently rechecked and covered by final whole-branch automation and affected real-browser/package acceptance. This is ready for another independent whole-implementation review within the agreed scope. It is a **qualified implementation**, not unconditional completion of every original acceptance promise or release readiness: exact owner deferrals, ratified legacy limitations, open platform findings and private/release acceptance remain above. No additional waiver was inferred, and no publication occurred. The final handoff prompts pin a documentation-only delivery commit after the tested source head; no production change follows the final runtime checks.
