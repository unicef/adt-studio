# SPEC-0002 second review remediation — 1 November 2026

The latest independent review reproduced two required defects at `d8fd11f4`: replacement consent could follow browser history into another book, and a successful duplicate-normalizing translation Save could leave newer typing impossible to save. Both are corrected at **`1ab6befa3d90d6054e6a6d81c9918465afe5f020`**. A further net-clean successor case found by the separate remediation reviewer is also corrected. This report records the evidence for another independent review; it does not claim unconditional specification completion or release certification.

Everything remains local. No push, remote retarget, PR title/body/comment, review request, merge, issue closure or approval change occurred. The six owner deferrals and ratified SPEC-0001 limits remain unchanged. The earlier reports remain historical evidence, with their original test/runtime checkpoints.

## Checkpoints, integration and local commits

- Current develop comparison and merge base: `df4df3aa7b5e37114f5e86db3d1cbf9bac3ce2a0`.
- Original published SPEC-0002: `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89`.
- Previous local review candidate: `d8fd11f4faeb242d80800e42da94e9c040b2566f`, production `4fb92b289a37d801e0b49d1a2ea7c2f71fd417e4`.
- Final production/test head: `1ab6befa3d90d6054e6a6d81c9918465afe5f020`. A subsequent evidence commit changes documentation only.
- `c09b93f3`: bind landing replacement consent to book and stage.
- `aae474ef9775e1ee3ed9d3d2f28577b52bb159f7`: acknowledge the persisted translation shape before successor edits.
- `1ab6befa3d90d6054e6a6d81c9918465afe5f020`: settle reverted successor drafts after acknowledgement.
- Recovery ref `refs/backup/spec-0002-before-review-round2-nov01` retains the previous candidate.
- PR #880 remains open on `spec/736-manual-edit-preservation`, with remote base `spec/735-per-section-staleness`; proposed later base remains **develop**. SPEC-0001 was squash-merged as `c153ba7d26c2323b67236c61297999424b169ac1` from `811d14751d6e01a8262d3e34466c1f45875b8ca1`.

The [develop integration report](spec-0002-develop-integration-2026-10-26.md) records the actual old prerequisite boundary and squash-safe integration. This increment neither replays that stack nor changes ownership/admission/storage architecture. The implementation checkout is `tmp/spec-0002-implementation`; original books, unrelated branches and drafts remain untouched. The final read-only remote refresh confirms the same develop/prerequisite/PR heads and base; the production worktree is clean and both diff checks pass. The complete plan/ledger, original review, failed probes and final runtime artifacts are in main-checkout `.local-docs/spec0002-review-round2-fixes-nov01/` and `.local-docs/spec0002-independent-review-20261101-02/`. All execution workloads were sequential and provider transport was stubbed/refused.

## Feedback to correction

| Finding | Implementation and observable checks | Status |
|---|---|---|
| REV-1 P1: B's landing replacement consent survives browser history into A with the same version | Scope the entire landing warning/confirmation/opt-in lifecycle by book and stage. Recheck run availability in final handlers; retain frozen same-scope versions. Mounted cases cover both stages, A→B→A, stage changes, warnings, cancellation/reopen and default-off Sectioning. Actual browser multi-entry history/HTTP checks described below. | Fixed and rechecked |
| REV-2 P2: server normalizes an edited legacy duplicate on successful Save, but successor draft retains the obsolete shape and next Save 400s | PUT returns exact entries with its version inside its publication transaction. Apply only successor edits to that response, never a later GET; retain namespace/source guards. Same/unrelated, delayed refetch, Save & leave, third writers and legacy/canonical namespace races are covered. | Fixed and rechecked |
| Independent reviewer: net-clean successor keeps a phantom pending draft | After acknowledgement, clear only visible id/text equal to the exact saved response and only while its captured guard object still owns the draft. Four before-fix failures now pass. Two independently authored discard/recreate probes prove late cleanup cannot erase a different canonical draft. | Fixed and independently rechecked |
| Prior FIND-1/FIND-2: untouched duplicate loss during 409 recovery; absent first-language recovery | Prior corrections unchanged. Full suite re-executes them, including hidden-copy/receipt/canonical precedence cases. Earlier actual browser evidence remains at its original head. | Regression checks passed |
| Historical F1: retained rendering/answers acquire different owners | Shared stable owner resolver unchanged; full current/history/Preview/prune/restore/identity tests pass. No positional inference. Ratified unprovable-owner qualification remains. | Supported paths passed |
| Historical F2: TOC positional-ID draft confusion | Existing TOC whole-document target/conflict policy unchanged; full mounted/route recovery tests pass. | Regression checks passed |
| Historical F3: protected fixed tree/HTML pair | Existing paired preservation and publication code unchanged; full success/failure/cancel/restart tests pass. | Regression checks passed |
| Historical F4: combined Sectioning→TOC consent | Existing same-authorized-run transitions and external-writer rejection remain; real-route stage-range regressions pass. No silent zero-generation completion or refreshed external consent. | Regression checks passed |
| R1: stale Docker writer PID | Writer code unchanged from 1669c1f5. Current Mac native regressions pass; original Linux/forced-crash acceptance retains its checkpoint. This round repeats graceful runtime restart, not all crash orderings. | Fix retained, proof bounds unchanged |

The production increment adds no user-visible strings, dependencies, migration, locking mechanism or provenance model. Twenty-six committed regressions were added: eight landing cases, seventeen translation editor cases and one real-SQLite publication/receipt case. Server Save still stamps only genuinely changed/new entries; unchanged metadata/history/provenance and neighboring language are asserted. Save makes zero generation calls.

## Automated and independent verification

`<evidence>` means the absolute main-checkout `.local-docs/spec0002-review-round2-fixes-nov01` directory. Commands run from the implementation checkout, with `DEVELOPER_DIR=/Library/Developer/CommandLineTools` for Git-dependent commands.

| Command/check | Actual result |
|---|---|
| Before-fix mounted regressions | At the reviewed baseline, **16 failed / 37 passed** (53 cases). At intermediate aae474ef, net-clean successors produced **4 failed / 46 skipped**. Logs retained; these are actual current-contract failures, not claimed newly introduced integration regressions. |
| Final three-file focused suite | **87 passed**, 35.79s; `logs/focused-final.log`. |
| `pnpm build` | Passed at aae474ef; later net-clean change affects only Studio, whose build was repeated. Fresh final Docker and Desktop builds independently rebuild the complete applicable artifacts. |
| `env -u OPENAI_API_KEY -u GOOGLE_API_KEY -u GEMINI_API_KEY -u ANTHROPIC_API_KEY -u CODEX_API_KEY DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run --maxWorkers=2` | **468 files; 5,907 passed, 16 Linux-only skipped; 5,923 collected; 437.27s** at 1ab6befa on Mac. `logs/full-vitest-final.log`. |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck`; `pnpm lint` | Passed. Root typecheck/lint rerun after final UI fix. Lint zero errors/eight existing unused-suppression warnings. Runtime source unchanged after its successful check. |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio compile --strict`; `pnpm --filter @adt/studio build` | Passed; 4,475 messages per locale, zero missing in en/pt-BR/es/fr/sq; no .po diff. Final UI build repeated. |
| Invariants and diff | Invariant regressions included in full suite. No standalone invariant command exists. Final explicit-develop diff and working-tree diff checked separately. |
| Separate reviewer: four-file focused suite | **132 passed**, 74.64s at 1ab6befa; landing, LanguageView, text-catalog and manual-edit-survival. These overlap the full total. |
| Separate reviewer: custom config/probe | **2 independently authored tests passed**, 2.80s; late alias ack vs newly canonical discard/recreated draft, before/after ack. Next Save uses the canonical receipt and succeeds. |

The independently executed focused commands were:

```sh
pnpm exec vitest run apps/studio/src/components/pipeline/components/LandingPageShell.authorship.test.tsx apps/studio/src/components/pipeline/stages/languages/LanguageView.save.test.tsx apps/api/src/routes/text-catalog.test.ts apps/api/src/routes/manual-edit-survival.test.ts --maxWorkers=1
pnpm exec vitest run --config <evidence>/independent/vitest.independent.config.ts --maxWorkers=1
```

The parent's final 87-case command selects the same landing/editor/catalog files without `manual-edit-survival.test.ts`, with `--maxWorkers=1`.

The earlier full suite at aae474ef was intentionally interrupted (exit 130) after the independent net-clean finding, then replaced by the final complete run. An attempted `pnpm --filter @adt/types build` was unavailable (no script); `pnpm exec tsc -b packages/types` succeeded. Independent scratch probe's initial module-resolution failures are preserved and are harness failures, not product results.

## Fresh runtime, output and compatibility acceptance

### Combined Docker app and actual browser

`docker build --network=host --target app --label org.opencontainers.image.revision=1ab6befa3d90d6054e6a6d81c9918465afe5f020 -t adt-spec0002-round2:nov01 .` passed. Image: `sha256:2b82f41f357cf1d095d64c55e064842298d337d01c3315c2ce9f2fb0c1a676d1`. Actual API/nginx/Studio/reader ran on loopback 8096 with this task's isolated books, normal entrypoint/security and a recorded transport preload. `results/docker-runtime-provenance.json` records the running image/revision/environment/mounts/hook hash.

Commands used `REVIEW_ORIGIN=http://127.0.0.1:8096 REVIEW_HEAD=1ab6befa3d90d6054e6a6d81c9918465afe5f020 node <evidence>/probes/<script> <case>`. The original failing round 02 probes were copied with attribution and extended; originals remain unchanged. All six actual browser cases pass with zero page errors:

| Script/case | Observed result |
|---|---|
| `landing-history.mjs toc` | Real multi-entry browser Back from B to A closes B's consent; zero unauthorized POSTs, exact unchanged A/B current records. Cancel/reopen then fresh A confirmation sends one named/versioned run 200, publishes A manual 12→AI 13 and retains every older history version; B remains exact. |
| `landing-history.mjs sectioning` | Same scope/history jump produces no run and leaves both books unchanged. Reopen defaults replacement off; check/cancel/reopen defaults off again. This specific probe does not execute a confirmed Sectioning generation. |
| `delayed-success.mjs unrelated` | Hold the real 200 response after storage commits duplicate normalization; type unblurred unrelated successor; next Save 200. Versions 3→4→5, one B copy, correct successor in current/Preview, exact untouched entries and prior history. |
| `delayed-success.mjs same` | Same flow with successor on the normalized entry itself; 200→200, versions 3→4→5, current/Preview/history correct. |
| `delayed-success.mjs third` | Independent HTTP writer commits C after first storage publication and before its acknowledgement. Local next Save uses its own version and receives 409; recovery/next Save 200 retains external C and local A, history exact. Browser sequence 200→409→200, versions 3→4→6. |
| `delayed-success.mjs leave` | After the held 200 and newer typing, actual Back to books→Save & leave persists the successor and navigates home; 200→200, versions 3→4→5, current/Preview/history correct. |

The authorized TOC run uses one recorded **cache hit**, not a new provider request (`results/authorized-toc-llm-log.json`). It is a newly executed replacement/publication. Wrong-book/cancel actions make zero run requests; Saves and the complete runtime acceptance make **zero actual external provider transport calls**, recorded in `results/transport-counts-docker.json`. No force-fresh semantics or paid generation is claimed.

`node <evidence>/probes/export-recovery.mjs docker-verified-before`, actual `docker restart adt-spec0002-round2-nov01`, `node <evidence>/probes/export-recovery.mjs docker-verified-after`, and `python3 <evidence>/probes/check-export.py docker-verified-before docker-verified-after` passed. All **eight books / 632 ZIP members** have valid CRC and identical member bytes across restart. The affected entity's current/history, catalog and Preview remain unchanged across restart; exported locale text equals Preview. The restart checker does not separately compare every TOC/page semantic field with its exported representation; targeted output and old-build compatibility coverage are separate evidence. Only ephemeral catalog `generatedAt` is excluded, not persisted history metadata. `python3 <evidence>/probes/check-media.py books docker-verified-after` proves all **212 original image/audio/video files** still match seed hashes.

The initial export checker expected French output for English-only consent fixtures and failed with StopIteration. Inspection showed only English configured/output for those fixtures; French Preview was a fallback, not a configured export language. The corrected probe selects English for consent fixtures and French for translation fixtures, checks the affected TOC/page/translation history, and repeats both checkpoints across another actual restart under distinct `docker-verified-*` filenames. Original failure/log/exports are retained. This was a harness correction, not a hidden product failure or weakened preservation assertion.

### Unsigned packaged Desktop API/resources

`DEVELOPER_DIR=/Library/Developer/CommandLineTools SKIP_NOTARIZE=ALL CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop build:unpack --config.directories.output=<evidence>/desktop-unsigned` passed for macOS arm64/Electron 41.1.1. The actual package's `Contents/Resources/api/api-server.mjs` ran under Node on 8097, with PROJECT_ROOT/PROMPTS_DIR pinned to those Resources and BOOKS_DIR to fresh `desktop-books` copies. The bundled API and all three WASM hashes match the exact fresh `dist-electron` build (`results/desktop-runtime-provenance.json`).

With `REVIEW_API_BASE=http://127.0.0.1:8097/api`, `export-recovery.mjs desktop-before`, actual API process shutdown/restart, `export-recovery.mjs desktop-after`, `check-export.py desktop-before desktop-after` and `check-media.py desktop-books desktop-after` pass: **eight books / 632 members byte-identical; 212 original media files unchanged; current/history/Preview unchanged across restart and exported locale text equal to Preview; zero provider calls**. This is an unsigned bundled API/resources check, not a fresh full Electron GUI or signed/notarized release check. Only task-owned runtimes were stopped; evidence and images remain recoverable.

### Bounded old-build readability

`DEVELOPER_DIR=/Library/Developer/CommandLineTools node scripts/probes/spec-0002-compatibility.mjs --baseline /Users/ksokolovic/Development/adt-studio/tmp/spec-0002-evidence/compat-before` passed (`logs/compatibility.log`): current guarded Save→independently built old API reads all four units/Preview/Web export→current reopen, with authorship/IDs/all history unchanged. Old baseline is `ef31494dc2951b92222c473960fecee2d91f9544`, retaining the prior 1,822-source-blob audit. This does not certify old-build editing/reruns or general pre-schema-14 compatibility.


## AC-to-evidence matrix

Passed means the stated observed checks pass within their bounds. Prior real UI evidence is not relabeled as newly executed. Deferred failures remain failures accepted for later work; pending private/platform checks are not invented product waivers.

| AC | Status | Evidence and limit |
|---|---|---|
| 1 | Passed | Changed/new-only stamps, no-op/unknown protection; exact normalized receipt, successor persistence and unaffected entries/history; zero Save transport calls. |
| 2 | Passed automated; field-scale not run | Full fixed-window/current-skip/payload/cache/retry/provider/cost suite and distinct 8,850-entry experiment. No force-fresh behavior or actual STD5 field certification. |
| 3 | Passed | Quiz/option provenance and identity, edit/no-op/reorder; full suite and prior actual scoring evidence at its checkpoint. |
| 4 | Passed | Complete source-page groups, selection order, partial overlaps, all-protected/no-eligible/repeat runs and dependents; full suite. |
| 5 | Passed | Whole-document TOC save/AI stamps/history; full suite and fresh authorized replacement/current/history check. |
| 6 | Passed required paths; D3 deferred | Named consent/cancel/stale and combined execution pass; new cross-book landing defect corrected. Saved empty protected landing no-op remains exact D3. |
| 7 | Passed stamping; D4 deferred | Both-page/changed-only/no-op authorship regressions; redundant unchanged AI-edit versions remain D4. |
| 8 | Passed | Whole-page/empty-page manual/unknown protection and paired fixed tree/HTML failure/cancel/restart regressions. |
| 9 | Passed exercised paths, qualified; private acceptance blocked | Real-route Save→own/upstream run→read/history/output suite; fresh affected browser and runtime persistence/output checks. Unprovable owners retain ratified omission policy. |
| 10 | Passed required controls; D6 deferred | Component controls and five-locale strict compilation/lint; no new text. Exact adjacent-page error remains D6. |
| 11 | Passed bounded reading | Unknown protection/review-baseline suite and real built-old API probe; no downgrade edit/rerun or general pre-schema-14 certification. |
| 12 | Passed tested restore; D1 deferred | Provenance-preserving restore/selected-page earlier explicit AI Revert, neighbor/stale/busy/cancel controls; exact Sectioning net-clean draft remains D1. |
| 13 | Passed | Delete-last/empty pages, both sides of merge, stale neighbor/moved-content uniqueness; real storage regressions. |
| 14 | Passed supported retirement; repair deferred | Active removal/history/assets and unchanged retired duplicate groups; K3 reconstruction remains ratified follow-up. |
| 15 | Passed | Named/versioned frozen confirmation, default-off Sectioning, scope invalidation and queued stale refusal. Actual cross-book history cannot transfer consent. |
| 16 | Passed exercised failure/publication paths | Full rollback/failure/cancel suite; fresh graceful Docker/Desktop restart and physical assets. Prior forced crash proof has original source bounds. |
| 17 | Passed supported output; platform limits open | Full stable-owner/scoring/navigation/Webpub suite; fresh affected Preview/export/restart. P2 SCORM observation remains open. |
| 18 | Passed corrected required paths; D1/D2/D5 deferred | REV1/2/net-clean, third writer, Save & leave, discard/recreate, namespace/scope/ack cases. No exhaustive certification of all asynchronous orderings. |
| 19 | Passed bounded contract | CLI/DAG AI stamping/shared quiz batching regressions; not general CLI preservation/resume or SPEC-0010 completion. |

## Exact deferrals and remaining acceptance

[Owner comment 6137679220](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220) is the authority for these six cases. None was implemented or broadened in this round.

| Item | Explicitly deferred case |
|---|---|
| D1 | Net-clean guarded Sectioning draft after Revert. Translation late-ack net-clean was a separate required defect and is fixed. |
| D2 | Quiz deletion bypasses unresolved Save conflict. |
| D3 | Saved empty protected TOC landing card offers a run that skips. |
| D4 | Unnecessary unchanged page-sectioning versions during AI edits. |
| D5 | Stale Save-error banner after Discard. |
| D6 | Exact untranslated “Adjacent page no longer exists” error. |

[SPEC-0001 ratified Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170) retains positional activity carry-over; ownership repair/history reconstruction including K3; staged Speech publication; SPEC-0013 provider-wide preparation classification; bulk/projection/Storyboard no-op and named follow-ups; blank-ID repair and uncertified pre-schema-14 books. Unverifiable/contradictory rendered owners remain raw/history/assets and are omitted from Preview/export with disclosure. The [later mandatory timing/draft/harness decision](https://github.com/unicef/adt-studio/pull/879#issuecomment-6340376966) remains required, not deferred. Performance #995–997 stays outside scope; integrity checks remain.

Spec non-goals remain full Storyboard-rerun preservation, new page/section regeneration, broad Sectioning-mode lifecycle, a fifth Easy Read slice, general CLI preservation/resume and EPUB/PNLD redesign.

| Remaining check/finding | Status and reason |
|---|---|
| Private Frankenstein/De-codable; representative Mathematics STD5/Tanzania field books | Blocked/unavailable here; previous private/field assignments remain. Synthetic copies do not replace this evidence. |
| P1 default ad-hoc hardened Mac launch | Open prior platform finding, not approved deferral. Fresh default-develop artifact attribution remains unestablished; unsigned bundled API check is not a fix/certificate. |
| P2 cross-origin SCORM window.API exception | Open existing finding reproduced on develop and branch; observed reader rendering does not erase the exception. Not an approved deferral. |
| Hosted CI, real cloud/live-provider quality | Not run: candidate remains unpublished, cloud/paid-provider acceptance not performed. |
| New full Electron GUI, signed/notarized/all OS releases, low-end hardware | Not run anew; actual unsigned package/API/resources checks have narrower scope. |
| Current full Linux suite, arbitrary nested/seccomp/old-lease upgrades | Current full suite on Mac with 16 Linux-only skips. Earlier final Linux 30-writer-test/5,878-test suite and round-02 Docker writer evidence retain their heads; no new full Linux claim. |

## Independent assessment and next review

The separate reviewer read the original spec/latest review/deferrals and built its own requirement map. It found the net-clean successor issue during implementation, then independently rechecked final source and executed 132 focused tests plus 2 new adversarial probes. No remaining material counterexample was found in that bounded remediation review. It did not independently rerun the parent's full suite or browser/platform workloads; it separately inspected the parent's raw browser/export/runtime/compatibility evidence. That inspection found no material unsupported claim and tightened the restart wording to distinguish unchanged snapshots from complete semantic output equivalence. Reports are `independent/source-contract-map-initial.md`, `execution-recheck-1ab6befa.md` and `parent-runtime-evidence-review-1ab6befa.md` under the local evidence root.

Recommendation: proceed to another independent whole-implementation review of this local candidate within the agreed scope. Confidence is high in the reproduced corrections and exercised preservation boundaries. This remains a **qualified implementation**, not unconditional completion of the original unqualified contract: exact owner deferrals, ratified limits and pending acceptance remain. The next-review prompt requires a fresh requirement map/full develop diff/public entry path audit, not merely rechecking these fixes. Publication remains separately unauthorized.
