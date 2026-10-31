# SPEC-0002 additional acceptance — 31 October 2026

## Current assessment

The additional checks **found a material restart/recovery gap**. A forced Docker restart can reuse the previous API PID, leaving the book permanently `BOOK_BUSY` even though the API reports idle. Current content, history and assets survive, but retry cannot proceed. The same failure reproduces against develop's shared writer implementation. It has no approved deferral. The proposed narrow shared-admission correction is awaiting the owner's scope decision; it has not been implemented or bypassed.

This supersedes the earlier [readiness recommendation](spec-0002-readiness-2026-10-31.md). The new evidence strengthens preservation, runtime and offline coverage, but does **not** justify a clean “no material gaps / ready for publication” claim. Hold the final review handoff until the recovery decision is resolved. Two additional Desktop/platform findings remain visible below. Existing explicit deferrals are unchanged; none of these new findings has been silently added to them.

All work remains local. No push, remote retargeting, PR/title/body/comment/review request, merge or issue closure occurred. SPEC-0002 approval metadata is unchanged.

## Revisions and environment

| Reference | Exact revision |
|---|---|
| Tested local HEAD | `f9db200ae54854e28690f0a72b48dc74300b4357` |
| Production/test source checkpoint | `515735486159133a4906a5535c6a48c3cb2cab87` |
| Current develop, rechecked at the end | `df4df3aa7b5e37114f5e86db3d1cbf9bac3ce2a0` |
| Published SPEC-0002, unchanged | `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89` |
| Merged SPEC-0001 squash | `c153ba7d26c2323b67236c61297999424b169ac1` |

The tested local HEAD differs from the production checkpoint only in two evidence documents. This round changes documentation only. Remote PR880 remains open on `spec/735-per-section-staleness`; the proposed later base remains develop. Integration strategy, preserved upstream changes, recoverable refs and range-diff evidence remain in the earlier audit. Neither remote head changed during these checks.

Raw evidence, executable probes, copied books, separate checkpoint exports and exact logs are in main-repository `.local-docs/spec0002-final-acceptance-oct31/`. `PLAN.md`, `FINDINGS.md` and `REPRODUCE.md` are outside Git. Original main-checkout drafts and all 325 hashed files in the two original saved-book directories are unchanged. No production code was changed in this round. Provider fetches use a deterministic transport stub; unknown external transport is rejected. No paid provider or live publishing calls were made.

## Findings

| ID / severity | Observable result, cause and disposition |
|---|---|
| R1 — high, recovery availability | During an explicitly confirmed protected TOC replacement, suspend the real provider transport before its response, SIGKILL the entire app container, then restart it. Prior TOC/current/history, translation history, protected fixed tree/HTML, quiz identities and 211 physical media files remain equal. The API reports idle, but the same replacement retry receives 409 `BOOK_BUSY`. `packages/storage/src/book-writer.ts` identifies a live owner only by hostname/PID; Docker reused PID 8 for the new API, so `kill(pid,0)` cannot prove the old owner dead. A separate minimal container using actual develop source reproduces acquisition at PID 1 followed by the same rejection after SIGKILL/restart. This is an inherited prerequisite defect, not a demonstrated integration regression. Narrow correction proposed; owner scope decision pending. No lease was manually removed to manufacture a passing retry. |
| P1 — medium, default local macOS artifact | The original ad-hoc hardened unpacked app exits in dyld before startup: its Electron Framework mapping fails the Team-ID/library-validation check. Desktop source/config is unchanged versus develop, but no separate default-artifact baseline build was executed; do not infer a behavioral baseline pass. Repackaging with the repository's explicit unsigned option launches the actual packaged GUI. app.asar, API and reader bundle hashes match the original artifact. Unsigned local GUI evidence is valid; signed/notarized release operation remains unverified. No product deferral was inferred. |
| P2 — medium, cross-origin reader embedding | Actual Electron Preview renders but reports a SCORM `window.API` cross-origin SecurityError. The reader and export still work. A two-origin Chromium probe reproduces the same exception with develop's and this branch's byte-identical generated adapter. This is a proven existing embedding defect, not a SPEC-0002 regression demonstrated here. Same-origin Docker Preview and standalone offline readers are unaffected in these checks. It remains an open platform finding, not an approved deferral. |

R1 evidence: `probes/abrupt-recovery.mjs`, `results/abrupt-recovery.json`, `logs/abrupt-recovery-final.log`, `probes/develop-book-writer.ts/mjs`, `pid-reuse-baseline/probe.mjs`, and `logs/develop-writer-before-kill.log` / `develop-writer-restart.log`. The comparison omits only the catalog read model's per-request generatedAt; persisted translation history is compared explicitly.

P1/P2 evidence: `logs/desktop-launch-debug.log`, `desktop-unsigned-build.log`, `desktop-gui-v3.log`, `results/desktop-package-integrity.json`, `desktop-gui.json`, `probes/scorm-baseline.mjs`, `results/scorm-baseline.json`. The Desktop probe deliberately retains its console-error failure instead of suppressing the SCORM exception.

## Sequential acceptance results

| Check | Result and concrete scope |
|---|---|
| Actual Electron GUI | Six journeys passed using the unsigned package: real packaged main/renderer/preload/utility API; native close guard retains a draft; translation Save/reopen; reused TOC identity →409 → retained draft → explicit recovery → next Save; protected fixed-layout Preview; native export IPC; full quit/relaunch retains edits. Native save-dialog path selection was automated, while actual file writing ran. Qualified by P1/P2; not a console-clean default-package pass. |
| Combined Docker browser | TOC identity recovery and independent concurrent edits; selected-page Revert Cancel/Confirm, history and exact neighbor state; quiz Save/two ordinary real HTTP reruns/stable option IDs/actual scoring; restored translation editor; changed manual translation Save/rerun; four actual Preview/Web-download flows. Zero page errors. Save made zero transport calls; Translate rerun retained the same manual version and made one separately classified speech-preparation call, zero Translation calls. |
| Standalone exported readers | Four ZIPs pass CRC and run under `file://` in Chromium with offline enabled from context creation. Nine reader sections visited; chapter destinations, saved French correction, protected fixed output, quiz correct-answer association, images and physical audio playback pass. A separate actual Read Aloud activation selects/plays pg012_tx003's retained recording. No external requests or page errors. |
| Abrupt termination | Prior data/history/neighbor state and 211 media hashes pass. Automatic retry **fails R1**. The test uses an actual container SIGKILL, not a simulated exception or graceful stop. It covers the provider-response/pre-publication checkpoint; it does not claim every possible crash instruction boundary. |
| Real saved-book copies | Available Momo copy starts schema 13 with 20 pages; demo copy starts schema 13 with 0 pages. Read-only doctor initially reports the older schema. Current API migrates only the copies to 14. Momo guarded Save stamps the changed page manual; ordinary Sectioning retains that page and 19 unknown-authorship neighbors with unchanged sectioning versions/renderings and zero transport calls. Actual editor/Preview/export work. Export has 16 eligible reader sections. Afterward both copies pass doctor with no owner/duplicate/detached-output findings. All 325 original-file hashes remain equal. This sample does not certify pre-schema 14 books generally or replace assigned private-book acceptance. |
| Clean Linux branch checks | Node 22.23.3, Debian 12 ARM64, 4 CPU affinity / 8 GiB, fresh Linux filesystem and lockfile install. Exact commit history supplied. All 468 files / 5,857 tests pass, as do root/runtime typechecks, lint, root/pretest build, Studio build, five-locale extraction/strict compilation. 4,475 messages per locale, 0 missing; extracted PO bytes match the checkout. Lint has 0 errors and 8previously recorded warnings. This is local Linux evidence, not hosted Ubuntu/x64 CI. |
| Constrained runtime | Separate app container, 2 CPU affinity / 2 GiB, fresh copies with derived adt/ removed. Browser allows only the local app origin; provider transport remains blocked/stubbed. Editor open 633 ms, guarded Save 363 ms, cold 20-page Preview10,692ms, Web export4,242ms, graceful restart2,537ms. Manual correction survives, zero transport calls/page errors, exported member bytes match the earlier unconstrained archive. Single-run timings are not a benchmark distribution or physical low-end hardware certification. Sampled post-restart memory is not claimed as the full cold-run peak. |

The initial real-book export received 409 while Preview packaging still held the shared writer. After that task completed, the actual UI retry downloaded successfully. This is recorded rather than bypassing writer admission. Initial probe failures involving conditional readiness banners, localized control labels, quiz selectors, TOC menu behavior and an extra audio toggle were corrected as harness assumptions; final assertions follow actual user controls. Initial Linux archive-only execution passed 5,855 tests but failed two release tests requiring Git metadata. Adding the exact frozen history and rerunning all 468 files passed; no product code was changed for that setup failure.

## Commands and artifacts

All paths below refer to the raw evidence directory unless otherwise stated. `REPRODUCE.md` specifies fresh seeds, exact roots/ports, preparation and ordering; do not rerun mutation probes over this recorded checkpoint or original books.

- Desktop unsigned build: `SKIP_NOTARIZE=ALL CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop exec electron-builder --dir --config.directories.output=<evidence>/desktop-unsigned`; `node probes/desktop-gui.mjs`. The package's actual Electron executable runs with a new isolated `--user-data-dir`.
- Docker app image: `adt-spec0002-oct31:final`, imageID `sha256:bc48f01a7d52f38a37744d65c79190db36b82ef2021e3aba39defe1feb48f11d`. Browser scripts: `docker-toc-browser.mjs`, `docker-revert-browser.mjs`, `docker-quiz-browser.mjs`, `docker-translation-recovery-browser.mjs`, `docker-browser-final.mjs`.
- Offline: `node probes/offline-readers.mjs`, `node probes/offline-reader-audio-ui.mjs`; final JSON and screenshots under results/.
- Crash: `node probes/abrupt-recovery.mjs`; actual develop reproduction uses the preserved bundled writer in a separate disposable container across `docker kill --signal KILL` / `docker start`.
- Saved books: `node packages/pipeline/dist/cli.js doctor <isolated-books> --label <label> --json`; `node probes/real-book-copy.mjs`; `node probes/real-book-export.mjs`. Before/after doctor JSON and original hash manifest retained.
- Linux: `docker build -f probes/Dockerfile.ci -t adt-spec0002-ci:node22 probes`, then sequential `probes/linux-checks.sh` inside the fresh container. Commands are `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm --filter @adt/runtime typecheck`, `pnpm test`, `pnpm lint`, Studio `extract`, `compile --strict`, and `build`. Exit codes/timestamps are in results/linux-checks.tsv; all final exits 0. Full suite duration 138.91 s. Root build runs through pretest. Initial missing-Git failure log is retained separately.
- Constrained: `node probes/constrained-browser.mjs`, actual Docker limits in results/constrained-host-config.json, times in results/constrained-browser.json, ZIP member comparison in results/constrained-export-comparison.json.
- Final local diff check: `DEVELOPER_DIR=/Library/Developer/CommandLineTools git diff --check`.

## AC and feedback evidence after these checks

The [earlier detailed matrix](spec-0002-readiness-2026-10-31.md#ac-to-evidence-matrix) supplies committed test names and full requirement mapping. The whole Linux suite rechecks those tests at the frozen source. “Passed” below retains the stated compatibility bounds; an explicit deferred failure is not an unconditional pass. R1 blocks the broader recovery/readiness claim even where the narrower data-preservation assertions pass.

| AC | Current evidence/status |
|---|---|
|1|Passed: Linux regressions; real guarded translation Save/reopen on Docker/Desktop; changed entry stamp and zero-call behavior.|
|2|Passed automated fixed-window/accounting contract; real STD5/field-scale acceptance not run. Docker distinguishes one preparation call from zero Translation calls.|
|3|Passed: quiz editor, stable quiz/options and actual scoring, including offline reader.|
|4|Passed: protected groups/two real reruns/zero calls plus whole-suite adversarial batching cases.|
|5|Passed: TOC guarded saves/history through Docker and actual Desktop GUI.|
|6|Passed supported named replacement paths; D3 explicitly deferred. Crash retry is additionally blocked by R1.|
|7|Passed required stamping/structural behavior; D4 explicitly deferred.|
|8|Passed: real 20-page manual/unknown preservation and fixed tree/HTML checks; empty-page regressions rechecked in Linux.|
|9|Passed observed preservation paths within ratified owner bounds; private-book acceptance not run; complete restart/retry journey fails R1.|
|10|Passed current required indicators/five locales; D6 explicitly deferred.|
|11|Prior bounded built-old-API readability pass unchanged; no pre-schema 14 certification. Two schema 13 copy observations are supplementary only.|
|12|Passed required restore/Revert paths; D1 explicitly deferred.|
|13|Passed delete-last/cross-page/race regressions in the full Linux suite.|
|14|Passed retirement/history/recovery regressions within ratified legacy bounds; K3 repair remains explicitly deferred.|
|15|Passed named/default-off/exact-version confirmation regressions; crash probe submits exact named TOC consent.|
|16|Prior current/history/assets survive actual SIGKILL; automatic recovery/retry fails R1. Successful-publication/failure/cancel assertions remain passing in the suite.|
|17|Passed supported current output, TOC navigation, quiz scoring, offline and constrained exports; P2 qualifies cross-origin Desktop Preview.|
|18|Passed supported save/draft/F2 guards; D1/D2/D5 explicitly deferred. Restart writer admission fails R1.|
|19|Passed bounded CLI/DAG AI stamping/shared quiz batching regressions; no general CLI preservation/resume claim.|

F1 actual-owner retention remains covered by the prior public-route/SQLite regressions re-run in Linux; new reader/scoring/translation exports agree. F2 has additional actual packaged and Docker two-writer evidence. F3 has additional actual packaged fixed Preview/export, offline output and crash-neighbor preservation evidence. F4's combined-run consent implementation and adversarial tests remain intact and pass the full Linux suite; no new combined-range browser repetition is claimed in this round.

The six exact [owner-approved PR880 deferrals](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220) remain separately visible: D1 net-clean guarded draft after Revert; D2 quiz delete after unresolved conflict; D3 saved-empty protected TOC landing Run no-op; D4 unnecessary unchanged AI-edit versions; D5 stale Save-error banner after Discard; D6 untranslated adjacent-page error. Their authority/bounds are unchanged. SPEC-0001's [ratified Note7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170) ownership/repair, positional activity carry-over, staged Speech, provider classification, performance/no-op and legacy qualifications also remain unchanged. R1/P1/P2 have no new product deferral.

## Review handoff and limits

The two earlier independent reviewers' findings/rechecks remain tied to production 51573548. They did not independently certify the new probes or R1 correction; no correction exists yet. Updated standalone Codex and Claude Code prompts in the raw evidence directory require independent requirement mapping, public-path adversarial checks, scope/deferral scrutiny and specific challenge of these new findings. Do not use the prompts' existence as evidence that either new review ran.

Still unavailable/unperformed: assigned private Frankenstein/De-codable acceptance, Mathematics STD5/field scale and Tanzania historical doctor fixtures; paid-provider quality; real cloud publishing; signed/notarized/all-platform releases; actual low-end hardware; hosted exact-head CI while publication is unauthorized. Available PDFs alone cannot substitute for historical saved books.

The branch retains the current implementation with its explicitly authorized qualifications, but the **complete recovery contract is not established and the known R1 case fails**. The additional audit is complete; the narrow recovery decision and correction/reverification remain before a clean readiness recommendation. No spec criteria were weakened, approval fabricated, or new failure converted into a deferral.
