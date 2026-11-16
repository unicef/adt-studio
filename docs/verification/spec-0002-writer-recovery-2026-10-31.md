# SPEC-0002 writer recovery follow-up — 31 October 2026

This follow-up addresses R1 from the [additional acceptance audit](spec-0002-additional-acceptance-2026-10-31.md). The owner explicitly authorized the narrow shared-writer correction after the original forced-restart failure. All work remains local; no GitHub state changed and specification approval remains pending. **R1 is fixed and reverified at `1669c1f5`. The candidate is ready for the requested independent reviews within the documented scope, with the open platform findings and acceptance limits below.**

## Implementation and proof boundaries

The existing book lease and serialized recovery sentinel remain the only writer admission mechanism. Newly written Linux leases carry kernel boot ID, PID namespace and process start ticks. A different process incarnation in the same kernel/namespace can be recovered even when the numeric PID is live. An unreadable, malformed, remote or unprovable owner remains busy; lease age is never evidence.

A default Docker restart recreates the PID namespace. Recovery across that boundary additionally requires the same full container identity from three corroborating daemon-owned mount records (`hostname`, `hosts`, `resolv.conf`), independently of configurable hostname text. Differing containers cannot inherit recovery authority merely by sharing a hostname/book volume. The proof is restricted to the shipped rootful/default-seccomp layout: privileged capability sets, noninitial user mappings, unfiltered or unrecognized layouts do not supply this container proof. Procfs exposes whether filtering exists, not the identity of a custom seccomp policy; arbitrary custom or nested namespace configurations are not certified. Same-namespace process recovery remains separate.

No content schema migration, authorship inference, provider work, alternate lock, timeout stealing, dependency or UI text was added. Proven-dead ownership may remove the WASM mutex; database bytes, WAL/journal, entity history and physical assets remain intact.

**Upgrade limit:** old leases without incarnation metadata cannot retrospectively establish that a live-looking PID is a different process. Those remain conservatively busy; the original failed lease was retained unchanged as evidence. Native legacy ESRCH recovery remains supported. In recognized Docker, old leases additionally need a default hexadecimal hostname corroborated by the full container ID; a custom/shared hostname or unavailable identity stays busy even when the numeric PID is absent locally. This prevents reclaiming a live old-build writer in a sibling namespace. Default-Docker legacy dead-owner recovery remains tested. The automatic Docker restart correction applies to leases stamped by this build, not a claim that upgrading repairs every already-stranded legacy book.

## Revisions

- Original review candidate: `4587bcda1a2c5d405bfe1d6d6ec6649d06739090`; prior production `515735486159133a4906a5535c6a48c3cb2cab87`.
- Final recovery production/test checkpoint: `1669c1f55f25b95dbcb0d4629cba9934a17e6a1d` (commits `a2e5008e`, `a96ad324`, `1669c1f5`).
- Develop: `df4df3aa7b5e37114f5e86db3d1cbf9bac3ce2a0`; published SPEC-0002 remains `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89`.
- Remote PR base remains `spec/735-per-section-staleness`; proposed later base remains develop.

## Verification

Raw plan, source archive/bundle, probes and results are under main-repository `.local-docs/spec0002-writer-recovery-oct31/`. Earlier evidence is retained separately. The full AC/review map and six explicitly authorized deferrals remain in the [readiness audit](spec-0002-readiness-2026-10-31.md); this increment changes only shared writer identity and recovery.

- Linux focused writer suite: 28/28 passed at intermediate `a96ad324`; all 30 final writer cases passed in the complete suite at `1669c1f5`. Includes real independent processes, six simultaneous contenders, recycled live PID, unknown/remote/legacy identities, kernel read/permission failures, namespace/boot/container mismatches and SQLite mutex/journal preservation.
- macOS final-source build and focused writer suite passed: 13 cases passed, 16 Linux-only cases skipped (29 collected). Linux additionally collects the recycled-owner variant of the six-contender test; all 30 Linux writer cases passed. The bounded AC-11 probe passed again: current guarded Save → independently built pre-change API reads/Preview/Web export → current reopen; four units' authorship, IDs and history remained unchanged. This is not old-build editing/rerun safety.
- Complete Linux checks at `1669c1f5`: **468 files / 5,878 tests passed**, including all 30 writer cases; 142.90 seconds. Root/runtime typechecks, lint, root/pretest build, Studio build, extraction and strict compilation passed. Lint retains the same eight prior unused-suppression warnings; zero errors. All five catalogs have 4,475 messages and zero missing translations. Final rebuilt-app and packaged checks are recorded separately below. Linux extraction produced byte-identical `.po` catalogs in all five locales.

### Rebuilt combined app and real browser

The final Docker image is `adt-spec0002-writer:final`, ID `sha256:4b7f2d682ceda8901b9e9561c5ac7208a72c15822f08e12b4fe5aa985a0092f3`, labeled with source `1669c1f5`. Actual API/nginx/reader resources ran with isolated fresh fixture copies on port8092. The final build used `--network=host` for dependency downloads; the running app used normal bridge networking, default security and the repository entrypoint.

The actual guarded source/TOC Save → named-version HTTP run → transport pause → container SIGKILL/start → read/history → retry → publication chain passed. The API really reused PID8; the kernel also reused the namespace inode. Current TOC/manual version10, Sectioning, fixed tree/HTML, translations/history and quizzes compared equal after the crash. All **190 physical media hashes** matched. Retry used the original consent, made exactly **one** TOC transport call, published AI version11 and retained manual version10 in history. There was also exactly one TOC call before the kill. No owner/mutex file was removed manually, consent refreshed or provider request sent to a paid service.

Five books passed actual Preview/Web export before and after a further graceful restart: cosmetic, recovered TOC, protected fixed layout, restored French correction and the interrupted TOC. Page responses remained equal; all 437 ZIP members across the five archives passed CRC and byte equality across restart. The published TOC equals Preview and exported `content/toc.json`, while the prior manual TOC remains historical.

The final-image browser journey passed actual French Save/reopen/ordinary Translate rerun and four Preview/Web downloads. Save made zero transport calls. Rerun retained manual translation version7 and made **zero Translation calls**, with one separately classified speech-preparation call. No browser page errors occurred. These fresh exported fixtures do not replace the prior actual Electron GUI/offline/private-book evidence or its limits.

Raw outputs: `results/abrupt-recovery.json`, `lease-before-kill.json`, `api-after-restart.json`, `recovery-transport.json`, `recovery-output.json`, `docker-recovered-to-docker-restarted.json`, `docker-browser-final.json`, plus distinct ZIPs under `exports/`.

Two initial app probes stopped because graceful-to-forced startup changed PID7 to PID8, so they did not exercise the intended reuse case. Their fixtures, interrupted leases and logs are retained in `attempt-pid-not-reused/` and `attempt-graceful-vs-forced-pid/`. The successful fresh-copy probe first established a forced-restart baseline before writing book content, then killed/restarted the actual authorized run and asserted PID8 reuse. This is an explicit harness correction, not a product fix or fabricated PID.

The first final image build failed apt signature verification with Docker's filesystem at 100%; unused build cache was reclaimed without changing signature checks. A retry stalled on Electron download and was stopped. Completed disposable test containers and their temporary dependency image were removed after retaining source, logs, results and catalog equality evidence. The unchanged Dockerfile then built successfully using host build networking. Both failed/stalled logs remain. None is silently described as a passing build.

### Final packaged Desktop check

The explicit unsigned macOS arm64 Electron41.1.1 package rebuilt successfully. Its actual bundled API and WASM bytes match the final build. With `PROJECT_ROOT` and `PROMPTS_DIR` pinned to packaged Resources and a fresh isolated `BOOKS_DIR`, four books passed Preview/export before and after process restart. Page data stayed unchanged, the saved French correction remained present, and all **363 ZIP members** were byte-identical with valid CRC. Both task-owned test runtimes were stopped after acceptance.

This is a final bundled-API/resources check, not a new full Electron GUI walkthrough. The earlier six actual GUI journeys remain tied to their original checkpoint and unsigned-package qualification. Mac writer tests execute native admission/recovery paths; new Linux incarnation metadata is not represented as cross-platform PID-reuse repair.

P1 (default local ad-hoc hardened macOS launch) and P2 (existing cross-origin SCORM embedding exception) remain visible platform findings in the prior audit. Neither was repaired or declared an approved deferral by this narrow R1 authorization.


## Independent review

The separate requirement reviewer challenged the initial process-start-only design and demonstrated a concrete live-writer theft counterexample using two simultaneous same-hostname/PID containers. That design was rejected before publication. A later old-format ESRCH path could also reclaim a live sibling writer whose PID was absent locally; `1669c1f5` closes that path while preserving default-hostname/native legacy recovery.

The reviewer independently executed four final-source process/filesystem cases at `1669c1f5`:

- A live legacy owner was PID40 in container A. Same-hostname contender B observed ESRCH for PID40 but was refused with `BOOK_BUSY`; its callback never ran and lease, mutex and retained-file bytes were unchanged. A separate check confirmed A's owner was still live.
- A default-hostname legacy child was refused while live, then recovered after actual SIGKILL/ESRCH; retained bytes survived and normal release worked.
- Two newly stamped containers with the same hostname/PID1 but different namespaces/container IDs could not steal each other's ownership.
- Actual SIGKILL/start of one container reused PID1. Boot/container identity matched, namespace/start ticks changed, recovery issued a new token, removed only the stale WASM mutex, preserved bytes and released normally.

Report: `.local-docs/spec0002-final-acceptance-oct31/independent/r1-final-recheck-1669c1f5.md`. Its database/WAL/media files are sentinel fixtures: this independently proves admission/filesystem behavior, not SQLite/HTTP/export behavior. The application checks below supply that additional evidence. No further material defect was identified for the shipped defaults. This is bounded independent evidence, not specification approval or a proof of no bugs.

The earlier probe's assumption that namespace inode numbers always change was corrected after the kernel reused one; that initial restart had recovered correctly. Both records are retained. No such harness failure occurred in the final independent runs.

Kernel semantics consulted: [process stat](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html), [process status](https://man7.org/linux/man-pages/man5/proc_pid_status.5.html), and [Docker default seccomp](https://docs.docker.com/engine/security/seccomp/). Runtime claims depend on observed probes, not these documents alone.

## AC and feedback ledger

The unchanged preservation source through `51573548` has the detailed [AC map and exact review ledger](spec-0002-readiness-2026-10-31.md#ac-to-evidence-matrix). Its regressions were rerun in the full final-source Linux suite. Earlier real-browser, offline-reader, actual saved-book copy and constrained-container observations retain their original checkpoints. They are not relabeled as newly executed here.

| AC | Evidence and qualification |
|---|---|
| 1 | Passed: changed/new-only translation stamps; current full suite and prior actual guarded Save/reopen/zero calls. |
| 2 | Passed automated fixed-window/accounting and 8,850-entry experiment; ordinary current skipping retained. Field/STD5 acceptance not run. |
| 3 | Passed: individual quiz/option identity and provenance; prior actual editor/scoring/offline reader plus final suite. |
| 4 | Passed: complete protected source-page groups, repeated runs, overlap/no-eligible coverage; final suite. |
| 5 | Passed: whole-document TOC guarded save/history and prior Docker/Desktop journeys; final suite. |
| 6 | Passed required replacement paths; D3 empty-TOC landing-card case explicitly deferred. Final actual R1 retry/publication passed. |
| 7 | Passed structural stamping; D4 unnecessary AI-edit versions explicitly deferred. |
| 8 | Passed whole-page/empty-page and fixed pair preservation; final suite, prior 20-page copy/Preview/export observations. |
| 9 | Passed tested own/upstream preservation within ratified owner bounds; private-book acceptance not run. Final actual R1 crash/retry passed. |
| 10 | Passed required indicators/catalog checks; D6 exact untranslated adjacent-page error explicitly deferred. |
| 11 | Passed bounded built-old-API readability again at `1669c1f5`. No safe downgrade editing or general pre-schema14 certification. |
| 12 | Passed restore and selected-page Revert semantics; D1 precise guarded-draft case explicitly deferred. |
| 13 | Passed delete-last, both sides of cross-page merge and race regressions in real storage; final suite. |
| 14 | Passed source retirement/history/assets within ratified owner bounds; K3 ownership repair explicitly deferred. |
| 15 | Passed named/exact-version replacement consent and default-off Sectioning; final suite. |
| 16 | Passed transaction/failure/cancel regressions; actual final-image crash/retry/publication passed with old manual history and 190 media hashes retained. |
| 17 | Passed supported output/scoring/navigation; final Docker five-book and Desktop four-book export/restart/member checks passed. P2 remains an existing cross-origin Desktop finding. |
| 18 | Passed required stale-save/draft/F2 guards; D1/D2/D5 precise cases explicitly deferred. Final actual reused-PID restart/retry admission passed. |
| 19 | Passed bounded CLI/DAG AI stamping and shared quiz batching; no general CLI preservation/resume claim. |

| Review item | Disposition / evidence |
|---|---|
| F1 actual retained owner | Preserved implementation; final full-suite ownership/current/history/preview/prune/restore regressions pass. No positional inference added. |
| F2 TOC reused positional identity | Preserved whole-document conflict policy; final suite plus prior actual two-writer Docker/Desktop Save/recovery/next-Save journeys. |
| F3 protected fixed tree/HTML pair | Preserved implementation; final suite plus prior failure/cancel/restart and preview/export evidence. Final app exact neighbor snapshot/190 media hashes and Preview/export/restart rechecks passed. |
| F4 combined Sectioning → TOC consent | Preserved implemented same-authorized-run version transitions; final real-route range regressions including external writers pass. Not reverted to the earlier permitted deferral. |
| R1 reused writer PID | Fixed and rechecked at `1669c1f5`: 30 Linux writer cases, independent real container/PID40 legacy probes and actual combined-app PID8 crash/retry/publication/history/output acceptance passed. |
| P1 default local Mac signing | Open platform finding, not fixed and not an approved deferral. Explicit unsigned package/runtime evidence must be labeled accordingly. |
| P2 cross-origin SCORM | Open existing platform finding, baseline reproduced; not fixed and not an approved deferral. Supported readers still render/export in observed journeys. |

Six [explicit owner deferrals](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220), unchanged: D1 exact net-clean guarded draft after Revert; D2 quiz deletion after unresolved conflict; D3 empty protected TOC landing Run; D4 unnecessary AI-edit page versions; D5 stale error banner after Discard; D6 exact untranslated adjacent-page error. They remain known deferred failures, not clean passes. SPEC-0001's ratified Note7 limits, the later required timing fixes, private acceptance assignments and spec non-goals are unchanged; the prior audit supplies each source link. No new product deferral has been invented here.

## Exact commands and results

Run from `tmp/spec-0002-implementation` unless the command names an external evidence probe. Evidence root is main-repository `.local-docs/spec0002-writer-recovery-oct31`; `REPRODUCE.md` records isolation, fresh seeds and sequencing. Source archives/history bundles pin the final Linux run. Commands ran sequentially; no paid provider calls were made.

| Command/check | Result / raw log |
|---|---|
| `pnpm typecheck` | Passed on final Linux source; host typecheck also passed. `logs/linux-typecheck.log`, `typecheck-legacy-guard.log`. |
| `pnpm --filter @adt/runtime typecheck` | Passed. `logs/linux-runtime-typecheck.log`. |
| `pnpm test` | Passed: 468 files / 5,878 tests; 142.90s; includes root pretest build. `logs/linux-test.log`. |
| `pnpm lint` | Passed: zero errors, same eight recorded unused-disable warnings. `logs/linux-lint.log`. |
| `pnpm --filter @adt/studio extract` and `pnpm --filter @adt/studio compile --strict` | Passed: 4,475 messages/locale, zero missing, all five extracted PO files byte-identical to checkout. `logs/linux-extract.log`, `linux-compile.log`, `results/linux-catalog-equality.json`. |
| `pnpm --filter @adt/studio build` | Passed. `logs/linux-studio-build.log`. |
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm build` | Passed final macOS build. `logs/host-build.log`. |
| `pnpm exec vitest run packages/storage/src/__tests__/book-writer.test.ts --maxWorkers=2` | Final Mac: 13 passed, 16 Linux-only skipped, 1.19s. All 30 Linux cases passed in the final full suite. `logs/mac-writer-final.log`. |
| `node scripts/probes/spec-0002-compatibility.mjs --baseline /Users/ksokolovic/Development/adt-studio/tmp/spec-0002-evidence/compat-before` | Passed current Save → built-old-API reads/Preview/Web export → current reopen. Baseline `ef31494dc2951b92222c473960fecee2d91f9544`, whose 1,822 source blobs were verified in the preceding audit. `logs/compatibility-final.log`. |
| `docker build --network=host --target app --label org.opencontainers.image.revision=1669c1f55f25b95dbcb0d4629cba9934a17e6a1d -t adt-spec0002-writer:final .` | Passed final image. `logs/docker-build-final.log`; failed/stalled attempts retained separately. |
| `node <evidence>/probes/abrupt-recovery.mjs` | Passed real forced crash/reused PID8/retry, exact current/history/neighbors/190 media hashes, one interrupted and one retry TOC call. `logs/abrupt-recovery.log`. |
| `node <evidence>/probes/platform-smoke.mjs http://127.0.0.1:8092 docker-recovered` / `docker-restarted`; `python3 <evidence>/probes/compare-exports.py docker-recovered docker-restarted` | Five books and 437 ZIP members passed before/after actual Docker restart. Separate current/history/Preview/export TOC equality also passed. |
| `node <evidence>/probes/docker-browser-final.mjs` | Actual Save/reopen/rerun and four Preview/downloads passed; zero Save/Translation calls, one separately counted preparation call, zero page errors. `logs/docker-browser-final.log`. |
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools SKIP_NOTARIZE=ALL CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop build:unpack --config.directories.output=<evidence>/desktop-unsigned` | Passed explicit unsigned package. `logs/desktop-build-final.log`; no signed/notarized claim. |
| `PROJECT_ROOT=<packaged Resources> BOOKS_DIR=<evidence>/desktop-books PORT=3023 ADT_ENVIRONMENT=electron CONFIG_PATH=<evidence>/config.yaml PROMPTS_DIR=<packaged Resources>/prompts NODE_OPTIONS='--import <evidence>/probes/host-transport.mjs' node <packaged Resources>/api/api-server.mjs` | Actual final packaged API/resources ran and restarted. `logs/desktop-api-before.log`, `desktop-api-after.log`. |
| `node <evidence>/probes/platform-smoke.mjs http://127.0.0.1:3023 desktop-before` / `desktop-after`; `python3 <evidence>/probes/compare-exports.py desktop-before desktop-after` | Four books /363 archive members passed; packaged API/WASM integrity also passed. `results/desktop-before-to-desktop-after.json`, `desktop-package-integrity.json`. |
| `git diff --check`; `git diff --check df4df3aa..HEAD` | Passed final change review. No standalone invariant-check command exists; applicable invariant regressions are in the full suite. |
| Hosted exact-head CI | Not run: local-only authorization. No historical CI is claimed for this unpublished head. |

Linux used Node22.23.3/Debian12 ARM64, four CPU affinity and 8GiB. Its dependency tree was copied from the preceding same-lockfile Linux install and revalidated by frozen install; this final run is not described as another entirely fresh download. Docker's final image performed its own lockfile installation. Earlier private-book/offline/constrained-runtime observations keep their original source checkpoints and qualifications.

## Readiness and handoff

R1 no longer blocks the **tested newly stamped standard-Docker lifecycle**. The old-lease upgrade limit and conservative ambiguous-runtime refusal remain explicit; no unsafe automatic repair was introduced. The independent reviewer rechecked final source and real process counterexamples. Full final-source Linux checks, actual Docker crash/retry/browser/output and final packaged Desktop API/resources checks now pass.

This supports starting the requested Codex and Claude Code independent reviews of the entire develop-to-branch increment. It does **not** establish an unqualified full-original-spec or release pass: the six owner-authorized defects remain deferred, SPEC-0001's ratified legacy/ownership bounds remain, P1/P2 remain open platform findings, and private historical-book/Mathematics STD5/field acceptance, live-provider quality, cloud publication, hosted CI and signed/all-OS release checks remain unperformed. These are not newly invented product deferrals. Old live-looking leases cannot safely be auto-repaired from metadata they never recorded.

The preservation contract is implemented within the documented scope and compatibility boundaries; acceptance remains qualified as listed. Reviewers should challenge both implementation completeness and evidence, including the original failed attempts. No spec approval, issue closure, remote publication or certainty of no regressions is claimed. Proposed future base is develop; publishing/retargeting still requires separate authorization.
