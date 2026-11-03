# SPEC-0002 third review remediation — 1 November 2026

The latest independent whole-contract review found a P1: Add Quiz could carry book B's protected replacement consent into book A. The remediation audit then reproduced a separate recovery defect: reopening after a competing edit reused a cached old version and repeatedly returned 409. Both are corrected at **`3ffa82bcfe768ebbc187a161c7b7c4c8b73d87c6`**, with failed-before regressions, independent rechecks and fresh browser/output/platform evidence below. This candidate is ready for another independent review within the agreed scope. It is a **qualified implementation**, not unconditional completion of the original contract, approval or release certification.

Everything remains local. No push, remote retarget, PR title/body/comment, review request, merge, issue closure or approval change occurred. Existing deferrals are neither implemented nor broadened here.

## Checkpoints and preservation of prior work

| Checkpoint | Identity |
|---|---|
| Develop comparison and merge base | `df4df3aa7b5e37114f5e86db3d1cbf9bac3ce2a0` |
| Published SPEC-0002 | `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89` |
| Reviewed local predecessor | `99352015d317dfe787fa95a51acd7834727bcf52` |
| Book/open-session correction | `b7827473ca91981e52ca46b25049bb4c1285f3c8` |
| Final production/test correction | `3ffa82bcfe768ebbc187a161c7b7c4c8b73d87c6` |
| Recovery ref | `refs/backup/spec-0002-before-review-round3-nov01` retains `99352015` |

PR #880 remains open on `spec/736-manual-edit-preservation`, remotely based on `spec/735-per-section-staleness`. The proposed later base remains **develop**. Live read-only refresh confirmed these refs and recorded the PR body hash. SPEC-0001's squash merge `c153ba7d26c2323b67236c61297999424b169ac1`, source head `811d14751d6e01a8262d3e34466c1f45875b8ca1` and inherited boundary `aefe41855` are unchanged. The earlier develop integration report records the squash-safe integration; this round does not rewrite history or import another PR.

The entire production increment from `99352015` changes only `AddQuizDialog.tsx` and its test. Prior SPEC-0001/SPEC-0002 implementation, review fixes, spec/INDEX/ADR metadata and owner UI changes remain intact. No schema, writer, ownership model, migration, dependency, provider behavior or new string was introduced. The implementation checkout is `tmp/spec-0002-implementation`; unrelated worktrees, drafts and original books were preserved. Working-tree and explicit develop-to-head diff checks passed before the documentation-only evidence commit.

## Feedback to correction

| Finding | Correction and observable evidence | Status |
|---|---|---|
| **IR3-1 P1:** Add Quiz uses another book's consent when IDs/versions coincide | Scope complete selection, placement, snapshot and async lifetime to a book and one opening. Old responses cannot close/navigate/error/unlock a new session; cache invalidation remains tied to the captured book. Original independent Settings/editor failures, eight failed-before mounted cases, all three actual callers and delayed outcomes rechecked. | Passed required correction |
| **IR3-R2:** repeated conflict after reopening, discovered during remediation | Actual Docker external PUT advances manual v1→v2; replacement v1 gets 409; Cancel/reopen retains v1 and the next request also gets 409. New openings now require a completed post-mount query read. Failed/cancelled reads cannot turn retained cache into consent. Later same-session updates remain frozen. Three regressions failed before; actual final browser sequence is 409(v1)→reopen→200(v2). | Passed required correction |
| Prior REV-1/REV-2/net-clean/FIND-1/FIND-2 | Landing scope, exact translation acknowledgements, successor/duplicate and first-language recovery unchanged. Full final suite re-executed; latest independent actual-browser evidence for these unchanged paths remains at `99352015`. | Regression tests passed; runtime checkpoint retained |
| F1: retained rendering/answers acquire different owners | Shared stable-owner resolver unchanged; current/history/Preview/export/prune/restore regressions pass. Unprovable/contradictory legacy qualification remains. | Passed supported paths |
| F2: TOC positional-ID recovery edits wrong target | Existing whole-document target/conflict policy unchanged; full recovery regressions pass. Translation duplicate exceptions are not applied to ambiguous TOCs. | Passed regressions |
| F3: protected fixed tree/HTML pair lost | Existing paired preservation/publication code unchanged; full success/failure/cancellation/restart regressions pass. | Passed regressions |
| F4: combined Sectioning→TOC skips consented work | Same-authorized-run transition receipts and external-writer rejection unchanged; real-route stage-range tests pass. | Passed regressions; not re-deferred |
| R1: writer recovery after container PID reuse | Writer source unchanged. Independent `99352015` Linux 30-case suite and actual forced Docker crash/PID-reuse/retry passed. This round repeats graceful restart, not a new forced crash. | Prior exact-head evidence retained |

The new review is main-checkout `.local-docs/spec0002-independent-review-20261101-150858-codex/` (REPORT, MATRIX, ENTRYPOINTS, REPRODUCE and failing probes). This remediation's plan, requirement ledger, logs, probes, screenshots, results and separate reviewer notes are `.local-docs/spec0002-review-round3-fixes-nov01/`. Original evidence is unchanged. All execution workloads were sequential; the main agent was sole production writer.

## Automated and independent verification

Commands below ran from the implementation checkout unless stated otherwise. `<evidence>` denotes the absolute main-checkout `.local-docs/spec0002-review-round3-fixes-nov01` directory. Provider credentials were unset; Git-dependent commands used `DEVELOPER_DIR=/Library/Developer/CommandLineTools`.

| Command/check | Result |
|---|---|
| Before-fix mounted lifecycle cases | **8 failed / 4 passed** on old production. Four later direct-navigation cases do not have separate failed-before evidence. `logs/before-mounted.log`. |
| Before-fix fresh-read cases | **3 failed / 16 passed** at b7827473. `logs/before-fresh-read.log`. |
| Focused four-file suite | **85 passed**, 44.97s. Dialog, quiz history, landing consent and real-storage manual-edit-survival. `logs/focused-fresh-read.log`. |
| `pnpm exec vitest run --maxWorkers=2` | **468 files; 5,925 passed, 16 Linux-only skipped, 5,941 collected; 435.56s**, exit 0 at 3ffa82bc. `logs/full-vitest-3ffa82bc.log`. The earlier b7827473 run passed 5,922 before the final three regressions were added. |
| `pnpm build`; `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck`; `pnpm lint` | Passed on final production source. Lint zero errors and the same eight unused-suppression warnings seen at the reviewed baseline. `results/static-checks-final.json`. |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio compile --strict`; `pnpm --filter @adt/studio build` | Passed; 4,475 messages per locale, zero missing in en/pt-BR/es/fr/sq; no catalog diff. |
| Invariants and diff | Invariant regressions included in the full suite; no standalone invariant command exists. Working-tree and explicit-develop diff checks passed. |
| Independent frozen-head verification | **39 committed focused tests + 5 independent session probes + 3 independent fresh-read probes = 47 passed**. These overlap the full-suite count; the eight custom probes are outside Git. |

The exact focused parent command was:

```sh
pnpm exec vitest run apps/studio/src/components/pipeline/stages/quizzes/AddQuizDialog.authorship.test.tsx apps/studio/src/components/pipeline/stages/quizzes/QuizzesView.history.test.tsx apps/studio/src/components/pipeline/components/LandingPageShell.authorship.test.tsx apps/api/src/routes/manual-edit-survival.test.ts --maxWorkers=1
```

The full command was prefixed with:

```sh
env -u OPENAI_API_KEY -u GOOGLE_API_KEY -u GEMINI_API_KEY -u ANTHROPIC_API_KEY -u CODEX_API_KEY DEVELOPER_DIR=/Library/Developer/CommandLineTools
```

The separate reviewer read the original requirements and new report, built its own map, identified the cached-reopen risk and the cancelled-refetch fallback trap, and rechecked both frozen heads. At final 3ffa82bc it independently ran the dialog/quiz-route/quiz-ID suite and custom race configurations recorded in `independent/execution-recheck-3ffa82bc.md`. Cases include old response/invalidation completion while a newer request is busy, late book-A reads, unknown provenance, failed/cancelled reads, successful superseding reads, frozen consent during newer background reads, and valid empty output with baseVersion 0. No remaining material counterexample was found in that bounded review. Actual browser/platform results below are parent execution, separately inspected by the reviewer in `independent/parent-runtime-evidence-review-3ffa82bc.md`; they were not independently rerun. The final read-only inspection found no material reporting contradiction and retained the bounded old-baseline, package and failure-attribution qualifications.

## Fresh browser, output and platform acceptance

### Combined Docker app and browser

```sh
docker build --network=host --target app --label org.opencontainers.image.revision=3ffa82bcfe768ebbc187a161c7b7c4c8b73d87c6 -t adt-spec0002-round3:nov01 .
```

Passed. Final image: `sha256:03a984e3e47a9936ac503244829bc78c4d0ee7de9a404bab139550bf8b1f06aa`. Actual API/nginx/Studio/reader ran on loopback 8096 using normal entrypoint/security, isolated books/config and recorded transport preload. `results/docker-runtime-provenance-3ffa82bc-configured.json` pins image/revision, mounts, configuration and transport-hook hashes.

`python3 <evidence>/probes/browser-batch.py final3` ran five fresh scenarios sequentially, using ten disposable four-page fixture copies. They model identical book-local quiz/option IDs and aggregate versions, manual quizzes, existing source/media/translation content, competing writers and actual router history. They are not private/field-book acceptance.

| Actual browser scenario | Observed result |
|---|---|
| Settings/General Add Quiz | B→A history invalidates B consent, zero unauthorized POSTs. Cancel/reopen resets selection/placement. External manual edit v1→v2; still-frozen v1 request 409 with zero provider call; reopen displays the external edit; explicit v2 request 200 publishes fresh AI quiz/option IDs at v3 and preserves manual history. B's current/history/catalog/Preview remain exact. |
| Populated quiz editor | Same scope/cancel/default checks; fresh named A replacement publishes v1→v2 with new quiz/option IDs and old manual history. B unchanged. |
| Overview/Specific pages | The keyed landing subtree remounts an **empty destination-book dialog**, rather than closing it: zero selection, Generate disabled, no old question/consent. Actual A→B→A resets remain safe and send zero requests. Cancel then fresh named A confirmation succeeds. This does not claim every caller removes the modal. |
| Delayed success | Hold a real 200 **after server commit**; Escape/reopen creates a fresh session. Releasing the old response cannot close, navigate or unlock it. Only the already-authorized request changed A; B unchanged. This is not a cancellation-rollback test. |
| Delayed stale failure | External edit advances manual content; hold the real 409, Escape/reopen, then release it. The new confirmation keeps the current manual question/version, no old error leaks, and no provider call occurs. |

All five scenarios have zero browser page errors. Four final generation transports were intercepted and returned by the stub, one each for Settings/editor/landing/late-success; late-failure, cross-book navigation, cancellation and manual Save make none. The complete exploratory/final ledger contains six intercepted quiz calls, including two successful earlier harness cases. No paid call occurred. This accounting is separate from AC-2's fixed-window/cache experiment, re-executed in the full suite.

`node <evidence>/probes/quiz-reader.mjs` independently exercises the actual reader UI for the fresh AI replacement in A and the untouched manual quiz in **separate book B**. Displayed question and correct option ID match current data; choosing the correct answer is visibly scored correct, with no page errors, entity/history changes or provider calls.

`export-recovery.mjs docker-before`, actual `docker restart adt-spec0002-round3-nov01`, `export-recovery.mjs docker-after-ready`, `check-export.py docker-before docker-after-ready` and `check-media.py books docker-after-ready` pass. **Ten books / 850 ZIP members** have valid CRC and identical member bytes across restart. Current quiz data, history, catalog and Preview are unchanged. Every active quiz question, option and explanation is compared with Preview, and exported English text equals Preview. **260 original image/audio/video files** retain their seed hashes. Only ephemeral catalog `generatedAt` is excluded; history metadata is not excluded.

### Fresh unsigned packaged Desktop API/resources

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools SKIP_NOTARIZE=ALL CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop build:unpack --config.directories.output=<evidence>/desktop-unsigned
python3 <evidence>/probes/desktop-acceptance.py 3ffa82bcfe768ebbc187a161c7b7c4c8b73d87c6
```

Both passed for macOS arm64/Electron 41.1.1. The actual package's API ran under Node with PROJECT_ROOT/PROMPTS_DIR pinned to its Resources and BOOKS_DIR to fresh `desktop-books` copies. API and all three WASM files match the fresh build hashes. Two actual API processes (before/after restart) pass **10 books / 850 byte-identical members / 260 unchanged source media files**, with the same current/history/Preview/quiz-text assertions and zero new provider calls. Evidence: `results/desktop-runtime-provenance.json`, `results/exports-desktop-before-desktop-after.json`, `results/media-desktop-after.json`. This is not a full Electron GUI, default-signing, notarization or signed-release check. Task-owned runtimes were stopped; unrelated containers remain untouched.

### Bounded old-build readability

```sh
DEVELOPER_DIR=/Library/Developer/CommandLineTools node scripts/probes/spec-0002-compatibility.mjs --baseline /Users/ksokolovic/Development/adt-studio/tmp/spec-0002-evidence/compat-before
```

Passed at final production source (`logs/compatibility-final.log`): current guarded Save→real built-old API reads all four entities/Preview/Web export→current reopen, with authorship, IDs and all history unchanged. Reused built baseline `ef31494dc2951b92222c473960fecee2d91f9544`; the independent prior review audited its 1,822 source blobs. This is fresh execution against that artifact, not a newly rebuilt old artifact or certification of old editing/reruns/pre-schema-14 books.

### Preserved setup failures and evidence limits

- First Docker build failed at apt signature checks while Docker's filesystem was 100% full. Only unused build cache was removed (1.528 GB then 19.19 GB); images, containers, volumes, books and earlier evidence were retained. The unchanged build retry passed. Further unused build cache was cleared before the final build.
- The first final browser fixture copied a global `ollama:tinyllama` default intended for earlier cache-only probes. Its new generation could not connect to container-local 11434, then timed out during retry/backoff. Original config and combined Docker stdout/stderr prove this diagnosis. Fresh copies with explicit OpenAI stub configuration passed; no paid provider was contacted. This setup failure is not a passing generation result.
- The first landing assertion required zero dialogs. Inspection showed a new empty safe dialog, not retained consent. The independent reviewer confirmed the contract distinction; the corrected probe tests empty state, disabled generation, no stale question/request, unchanged data, A→B→A and fresh named confirmation. No acceptance criterion or production host was changed to satisfy the probe.
- The first immediate post-restart read raced API readiness and failed before producing its checkpoint. A health gate and distinct `docker-after-ready` export names preserve both the original failure and successful comparison. No failing artifacts were overwritten or mutated fixtures reused to manufacture a pass.

## AC-to-evidence matrix

“Passed” below describes exercised supported behavior. Qualified compatibility, exact deferred failures and unavailable acceptance are not silently promoted to full completion. Earlier actual-browser evidence remains tied to its original head.

| AC | Status | Evidence and limits |
|---|---|---|
| 1 | Passed | Full route/editor tests: changed/new-only stamps, unchanged/unknown provenance, exact normalized receipts, successor edits, neighbors/history and zero Save provider calls. |
| 2 | Passed automated; field check not run | Complete ordered windows before filtering, current-output skipping, payload exclusion, separate adapter/cache/provider/retry/cost checks; 8,850 entries/177 windows in full suite. No force-fresh or actual STD5 claim. |
| 3 | Passed | Quiz save/no-op/reorder/identity tests; server stamping unchanged. Actual new replacement and untouched manual-book controls preserve expected identities/history. |
| 4 | Passed | Complete source-page grouping, partial overlap, all-protected/no-eligible and repeated-run regressions; IDs/options/dependents/order retained. Prior independent actual two-rerun/scoring check at `99352015` remains attributed there. |
| 5 | Passed | Whole-document TOC manual/AI stamp and history tests; implementation unchanged. |
| 6 | Passed supported paths; D3 deferred | Named TOC consent/cancel/stale and combined-run tests; prior actual landing recovery. Saved-empty protected landing no-op remains D3. |
| 7 | Passed stamping; D4 deferred | Structural/both-page/no-op provenance regressions. Unnecessary unchanged AI-edit versions remain D4. |
| 8 | Passed | Whole-page, empty-page and unknown/manual protection; fixed tree/HTML pair success/failure/cancel/restart tests. |
| 9 | Passed exercised chain, qualified; private acceptance blocked | Real HTTP Save→own/upstream run→read/history/output suite across six units; fresh affected Docker/packaged runtime checks. Ratified legacy omission policy remains; private/field books unavailable. |
| 10 | Passed required controls; D6 deferred | Badge/control tests and five-locale strict compile/lint; no new strings. Exact adjacent-page error remains D6. |
| 11 | Passed bounded reading | Unknown protection/review-baseline tests plus fresh actual built-old API read/Preview/export/current-reopen probe. No downgrade editing or general pre-schema-14 certification. |
| 12 | Passed supported restore; D1 deferred | Provenance-preserving restore, selected-page earlier explicitly AI Revert, stale/busy/cancel/neighbor checks. Exact Sectioning net-clean draft remains D1. |
| 13 | Passed | Delete-last/empty manual pages, both cross-page merge sides, stale neighbors and moved-content uniqueness in real-storage tests. |
| 14 | Passed supported retirement; repair deferred | Active removal with retained history/assets and legacy translation pass-through regressions. K3/history reconstruction remains ratified follow-up. |
| 15 | Passed | Named/default-off Sectioning opt-in, frozen versions, scope revocation and stale refusal; full landing/run-route tests. |
| 16 | Passed exercised publication/replacement | Full failure/cancel/retirement tests; IR3-1 named quiz replacement now uses the actual book and fresh IDs only on publication. Fresh real 409, manual history and separate-book preservation; delayed UI completion is distinguished from abort/rollback. |
| 17 | Passed supported output; platform findings open | Full stable-owner/navigation/Webpub tests plus fresh actual quiz scoring, current text/option/explanation→Preview→export and Docker/Desktop restart/media checks. P2 SCORM remains open. |
| 18 | Passed corrected required paths; D1/D2/D5 deferred | Full guarded PUT/restore/draft/receipt tests; new actual repeated-conflict recovery fixed, async session races independently checked. Prior translation browser proofs remain at `99352015`. No exhaustive interleaving claim. |
| 19 | Passed bounded contract | CLI/DAG AI stamping and shared quiz-batching tests. Not general CLI preservation/resume or SPEC-0010 completion. |

## Explicit deferrals and remaining acceptance

Only [PR #880 comment 6137679220](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220) authorizes these six failures:

| Item | Exact deferred case |
|---|---|
| D1 | Net-clean guarded **Sectioning** draft after Revert. Translation successor/net-clean handling and Add Quiz recovery are separate required behavior. |
| D2 | Quiz deletion after an unresolved Save conflict. Does not exempt named replacement or its recovery. |
| D3 | Saved-empty protected TOC landing Run silently skips. |
| D4 | Unnecessary unchanged AI-edit page-sectioning versions. |
| D5 | Stale Save-error banner after Discard. |
| D6 | Exact untranslated “Adjacent page no longer exists” error. |

[SPEC-0001 final ratification/Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170) retains positional activity carry-over; ownership repair/history reconstruction including K3; staged Speech publication; SPEC-0013 preparation classification; named bulk/projection/Storyboard-no-op follow-ups; historical blank-ID repair and uncertified pre-schema-14 books. The [later mandatory timing/draft/harness decision](https://github.com/unicef/adt-studio/pull/879#issuecomment-6340376966) remains required. Unverifiable or contradictory owners retain raw content/history/assets but are omitted from Preview/export with disclosure. Performance #995–997 remains outside scope; integrity checks remain.

Explicit non-goals remain full Storyboard-rerun preservation, new scoped generation, broad Sectioning-mode lifecycle, a fifth Easy Read slice, general CLI preservation/resume and EPUB/PNLD redesign.

| Remaining item | Status and reason |
|---|---|
| Private Frankenstein/De-codable and representative STD5/Tanzania acceptance | Blocked/unavailable in these fixtures; original private/field assignments remain. Synthetic evidence does not replace them. |
| P1 default ad-hoc hardened Mac launch | Open prior platform finding, **not an approved deferral**. No equivalent fresh default-signing develop artifact attribution; unsigned bundled API does not fix or certify GUI launch. |
| P2 cross-origin SCORM exception | Open prior finding reproduced on develop and branch, **not an approved deferral**. Current same-origin reader scoring does not close it. |
| Exact unpublished-head hosted CI | Not run: publication is prohibited this round. No new CI link or hosted pass is claimed. |
| Real cloud, live-provider quality, low-end hardware, signed/notarized/all-OS releases | Not run here; existing ownership/gates remain. |
| Fresh complete Linux suite and forced crash at `3ffa82bc` | Not run anew. Current full suite is Mac with 16 Linux skips. Independent `99352015` Linux writer/forced-crash results remain exact-checkpoint evidence for unchanged writer source. |

Confidence is high in the reproduced corrections and their exercised boundaries. The next review should inspect the complete develop-to-candidate implementation and public paths, not only these two fixes. The evidence supports another official review within the agreed scope; it does not establish absence of every regression, unconditional full-spec completion or release readiness. No new product decision or deferral was invented.
