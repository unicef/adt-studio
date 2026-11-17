# SPEC-0002 translation recovery review fixes — 1 November 2026

The independent Codex review found two non-deferred defects at `e9acc09b`: stale translation recovery could silently collapse untouched duplicate entries, and a first-language draft could remain stranded after a source-receipt conflict. Both are corrected at **`4fb92b289a37d801e0b49d1a2ea7c2f71fd417e4`**, with committed regressions, an independent source/execution recheck, fresh browser acceptance, and rebuilt Docker and unsigned Desktop checks.

The evidence supports another official implementation review within the agreed scope. It does **not** establish unconditional completion of the original unqualified specification or release readiness. Six explicitly deferred failures, the ratified compatibility limits, two open platform observations and pending private/release acceptance remain below. Specification and INDEX approval metadata are unchanged. Everything remains local; no push, remote retarget, PR edit/comment, review request or merge occurred.

## Checkpoints and scope

- Develop and local merge base: `df4df3aa7b5e37114f5e86db3d1cbf9bac3ce2a0`.
- Original published SPEC-0002: `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89`; original local review candidate: `e9acc09b5c87d7ea8761c2e6d0b2277ae556a17f` (production `1669c1f55f25b95dbcb0d4629cba9934a17e6a1d`).
- Current production/test commit: `4fb92b289a37d801e0b49d1a2ea7c2f71fd417e4`, `fix(translations): preserve duplicate drafts and bind recovery receipts`. The subsequent evidence commit changes documentation only.
- Read-only final refresh confirms PR #880 remains open at the published head, based on `spec/735-per-section-staleness`; that prerequisite branch now resolves to `811d14751d6e01a8262d3e34466c1f45875b8ca1`. SPEC-0001 was squash-merged as `c153ba7d26c2323b67236c61297999424b169ac1`. Proposed future remote base remains **develop**.
- The earlier [develop integration](spec-0002-develop-integration-2026-10-26.md), [whole-contract audit](spec-0002-readiness-2026-10-31.md) and [writer-recovery evidence](spec-0002-writer-recovery-2026-10-31.md) retain their source/history and runtime checkpoints. This increment does not replay the old stack or change their integration strategy.

The plan, detailed tracking ledger, untouched original failed review, logs, fixtures, screenshots and independent notes are outside Git in the main checkout: `.local-docs/spec0002-review-fixes-nov01/` and `.local-docs/spec0002-independent-review-20261101-01/`. The implementation checkout is `tmp/spec-0002-implementation`. Original books and unrelated drafts were not changed. All acceptance workloads ran sequentially with external provider requests stubbed or refused.

## Feedback to implementation and evidence

The November FIND-1/FIND-2 identifiers are distinct from the historical F1/F2 rendering/TOC findings.

| Finding | Correction and observable evidence | Disposition |
|---|---|---|
| FIND-1, P1: local A draft + external C edit collapses untouched duplicate B during 409 recovery | Translation-specific recovery compares complete ordered ID groups, preserves unchanged groups and global interleaving, and asks for an explicit choice on ambiguous overlap. Dirty state follows the visible first copy. Real browser Save 409 → recovery → Save 200 retains both B copies/provenance/metadata, independent A/C changes, prior history and correct Preview. Keep/Latest cases also pass after a competing writer changes B from two copies to one. | Fixed and rechecked |
| FIND-2, P2: first configured language with no entity cannot recover after its receipt changes | Initial read and reload share one selector. Valid absence with a current receipt is entries `[]`/baseVersion 0; unavailable data is not fabricated as an empty document. Actual model/config change → Save 409 → recovery → Save 200 creates version 1 with the preserved draft and refreshed receipt. French content/history remains unchanged. | Fixed and rechecked |
| Reviewer: equal-version legacy/canonical namespace race | Receipt includes the selected physical item ID. Draft, item ID and source/version guards travel together. Canonical empty/nonempty appearance at the same version rejects the old legacy receipt; legacy content/history stays intact. Logical UI scope does not change merely because the storage alias changes. | Fixed; SQLite route and mounted regressions |
| Reviewer: malformed canonical data must not resurrect legacy content | GET reports unreadable present translation namespaces. PUT refuses them rather than overwriting them or falling back. Null, malformed entries and malformed text are covered. | Fixed; no repair/migration promise |
| Reviewer: hidden-copy dirty state, net-clean visible edit, changed duplicate count, overlapping old/new-book reloads | First-visible comparison, current-group Keep semantics and scope-gated recovery guards preserve actual user intent and current server copies. Both conflict choices and later independent typing are covered. | Fixed; mounted tests and independent adversarial execution |
| Historical F1: retained rendering/answers acquire new owners | Existing shared owner policy and regressions retained. Full survival/ownership/current/history/Preview/prune/restore suite passes. No positional inference introduced. | Passed supported paths; legacy ownership qualification retained |
| Historical F2: TOC positional-ID draft confusion | TOC-specific whole-document conflict policy and generic merger are unchanged. Full mounted/route recovery regressions pass. Earlier actual two-writer journeys remain attributed to their original checkpoints. | Passed regression checks |
| Historical F3: protected fixed tree/HTML pair | Existing pair publication/preservation code unchanged; full failure/cancel/restart regressions pass. Earlier actual fixed-layout acceptance remains at its recorded checkpoints. | Passed regression checks |
| Historical F4: combined Sectioning → TOC consent | Same-authorized-run version transitions and external-writer refusal retained; full actual-route stage-range regressions pass. No renewed-consent shortcut or silent zero-work acceptance. | Passed regression checks |
| R1: Docker reused writer PID | Writer code unchanged from `1669c1f5`; current Mac suite passes native cases. Prior final Linux30-case and actual forced-crash/retry evidence remains valid for that unchanged source. This increment repeats graceful output restart, not the forced-crash experiment. | Prior fix retained; old/unprovable lease limits remain |

Production changes are limited to the translation editor/selector/merge, catalog response typing, and existing GET/PUT receipt validation. No stored content schema, shared locking protocol, ownership resolver, TOC merger or authorship model was replaced. The server still stamps only actual changed/new authored content. No-op/unchanged groups retain their provenance; Save performs no generation. Twenty committed regressions were added: fifteen mounted editor cases and five real-storage route cases.

## Verification on the frozen production head

Three new mounted regressions failed against the original implementation before production changes: duplicate preservation, first-language recovery, and hidden-copy dirty state (`logs/before-mounted.log`: 3 failed, 18 passed). The final mounted suite passes all 33. These are current-contract failures; they are not labeled integration regressions without a separate pre-integration comparison.

Run from the implementation checkout unless stated otherwise. `<evidence>` below means the absolute main-checkout `.local-docs/spec0002-review-fixes-nov01` directory. Commands depending on Git used `DEVELOPER_DIR=/Library/Developer/CommandLineTools`.

| Command/check | Actual result |
|---|---|
| `pnpm build` | Passed; `logs/build.log`. |
| `env -u OPENAI_API_KEY -u GOOGLE_API_KEY -u GEMINI_API_KEY -u ANTHROPIC_API_KEY DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run --maxWorkers=2` | **468 files; 5,881 passed, 16 Linux-only skipped; 5,897 collected; 430.57s**, macOS. Root build was run separately first. `logs/full-vitest.log`. This is not a newly executed full Linux suite. |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Both passed; `logs/typecheck.log`, `runtime-typecheck.log`. |
| `pnpm lint` | Passed, zero errors; same eight previously recorded unused-suppression warnings. `logs/lint.log`. |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio compile --strict`; `pnpm --filter @adt/studio build` | Passed; 4,475 messages per locale, zero missing in en/pt-BR/es/fr/sq. No catalog diff or new user-visible string. Respective logs under `logs/`. |
| Available invariant checks | Invariant tests ran in the complete suite. No standalone invariant command exists; none is claimed. |
| `git diff --check`; `git diff --check df4df3aa7b5e37114f5e86db3d1cbf9bac3ce2a0...HEAD` | Passed. Production worktree clean after verification. Documentation-only changes checked separately. |
| Independent focused command: `pnpm exec vitest run apps/studio/src/components/pipeline/stages/languages/LanguageView.save.test.tsx apps/api/src/routes/text-catalog.test.ts apps/api/src/routes/manual-edit-survival.test.ts --maxWorkers=1` | **3 files, 102 passed**, 58.76s. These overlap the full suite; do not add them to its total. |
| Independent custom probe: `pnpm exec vitest run --config <evidence>/independent/vitest.independent.config.ts` | **8 passed**, 3.74s. Actual Hono admission/routes, SQLite/history and Preview; current duplicate counts 1/3 × both choices, canonical empty/nonempty, and a deterministic 100-case interleaving sweep. All seven persistent Save scenarios assert zero actual fetch calls. |
| `node scripts/probes/spec-0002-compatibility.mjs --baseline /Users/ksokolovic/Development/adt-studio/tmp/spec-0002-evidence/compat-before` | Passed: current guarded Save → independently built old API reads four units/Preview/Web export → current reopen; authorship/IDs/all history unchanged. `logs/compatibility.log`. Baseline `ef31494dc2951b92222c473960fecee2d91f9544`, with the earlier 1,822-source-blob audit retained. No old-build editing/rerun promise. |

### Combined Docker app and real browser

`docker build --network=host --target app --label org.opencontainers.image.revision=4fb92b289a37d801e0b49d1a2ea7c2f71fd417e4 -t adt-spec0002-review:nov01 .` passed. Image: `sha256:c96d7e0769df875b5e226c21220a69c79f7fba78226b0b1a00d0218348606f46`. The actual API/nginx/Studio/reader ran on loopback 8098 with isolated books, the repository entrypoint and normal runtime security. `results/docker-runtime-provenance.json` records the running container's image/revision, transport preload and hook hash, rather than trusting a probe label alone.

The initial build failed apt signature verification when Docker's filesystem was 100% full. Unused build cache reclamation freed 28.4GB; named images, containers, volumes and books were preserved. The unchanged Dockerfile then passed. Both logs remain (`docker-build.log`, `docker-build-retry.log`); signature verification was not disabled.

Four fresh actual browser cases passed with no page errors:

1. `node <evidence>/probes/duplicate-standard-ids-fresh-ui.mjs`: original FIND-1, including persisted versions/history, exact duplicate groups, A/C independent edits and Preview.
2. `node <evidence>/probes/first-language-contract-ready-fresh-ui.mjs`: original FIND-2 with a real config change and first Spanish Save; French entries/version/history unchanged. A source receipt changing with model settings is expected and is not a saved-content mutation.
3. `node <evidence>/probes/duplicate-overlap.mjs mine`.
4. `node <evidence>/probes/duplicate-overlap.mjs latest`.

The latter two use a real competing PUT, explicit conflict choice and next Save; they preserve independent A/C edits while resolving only B. JSON results, screenshots and logs are retained under `results/` and `logs/`.

The copied first-language harness originally asserted409 on both attempts while its final assertion expected200; it was corrected to409 then200 plus refreshed-receipt/persisted-content checks. The original failed review script is unchanged. The duplicate probe's recorded A/C observations were additionally asserted when tightening its assertions; this was not described as another newly executed Save journey.

`node <evidence>/probes/export-recovery.mjs docker-before`, actual container restart, `node <evidence>/probes/export-recovery.mjs docker-after`, and `python3 <evidence>/probes/check-export.py docker-before docker-after` passed. The checker requires the exact four labels/counts. **All 345 ZIP members** had valid CRC and identical bytes across restart; current translations/history/Preview agreed, and exported locale texts equaled Preview. Only the ephemeral top-level catalog `generatedAt` is excluded from read comparison; stored history metadata is compared. All **104 existing media files** match seed hashes. Actual instrumented provider-boundary calls: **zero**.

### Packaged Desktop resources

`DEVELOPER_DIR=/Library/Developer/CommandLineTools SKIP_NOTARIZE=ALL CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop build:unpack --config.directories.output=<evidence>/desktop-unsigned` passed for unsigned macOS arm64/Electron 41.1.1.

The actual package's `Contents/Resources/api/api-server.mjs` ran under Node on 8097, with `PROJECT_ROOT`/`PROMPTS_DIR` pinned to those packaged Resources and a fresh `BOOKS_DIR=<evidence>/desktop-books`. Before/after process restart, the same four books passed `export-recovery.mjs desktop-before` / `desktop-after` and `check-export.py desktop-before desktop-after`: **345 members byte-identical**, current/history/Preview equal, **104 media files unchanged**, **zero provider calls**. The bundled API and all three WASM hashes match the fresh build (`results/desktop-runtime-provenance.json`).

This is an actual bundled API/resources test, **not** a new full Electron GUI walkthrough or a signed/notarized release check. Earlier GUI/offline reader observations retain their original checkpoints. Only this task's runtime processes are stopped after acceptance; fixtures, exports and images remain recoverable.

## AC-to-evidence matrix

“Passed” means the named observable checks passed, with the stated bounds. A deferred failure is not converted to a pass. The full current-source suite includes inherited SPEC-0001 and SPEC-0002 regressions. Earlier real UI evidence is identified as historical instead of being relabeled as freshly executed.

| AC | Status | Evidence and remaining bound |
|---|---|---|
| 1 | Passed | Changed/new-only server stamping and no-op protection; new stale-draft/duplicate/namespace tests and actual browser recovery; unchanged groups/history exact. |
| 2 | Passed automated; real-book scale not run | Fixed complete-source windows, payload exclusions, current-output skipping, adapter/cache/provider/retry/cost counts and separate 8,850-entry experiment rerun in full suite. No force-fresh behavior. STD5/field acceptance unavailable. |
| 3 | Passed | Quiz/option identity, provenance, edit/no-op/reorder regressions; prior actual reader scoring and editor evidence retained. |
| 4 | Passed | Complete protected source-page groups, selection-order/overlap/no-eligible/repeated-run behavior and dependent identities; full suite. |
| 5 | Passed | Whole-document TOC changed-only save/AI stamps and history; full suite and prior actual journeys. |
| 6 | Passed supported paths; D3 explicitly deferred | Named/cancel/stale/replacement and combined stage-range checks pass; saved empty protected TOC landing Run remains a known no-op case. |
| 7 | Passed stamping; D4 explicitly deferred | Both affected pages and no-op authorship regressions pass; redundant unchanged AI-edit page versions remain. |
| 8 | Passed | Whole-page/empty-page manual and unknown protection, eligible neighbors, paired fixed tree/HTML through failure/cancel/restart; full suite. |
| 9 | Passed exercised paths with legacy qualification; private acceptance blocked | Real-route Save→own/upstream run→read/history→output suite passes. New actual translation409 recovery/current/history/Preview/export chain passes. Unprovable owners retain the ratified omission policy. |
| 10 | Passed required controls; D6 explicitly deferred | Full component suite, lint/extract/strict compile; all five locales complete. Exact existing adjacent-page error remains untranslated by owner decision. |
| 11 | Passed bounded read compatibility | Unknown protection and one-time review-baseline tests; built-old-API probe repeated successfully. No authorship migration, safe downgrade editing/rerun or general pre-schema-14 certification. |
| 12 | Passed tested restore; D1 explicitly deferred | Provenance-preserving restore, highest earlier explicit-AI selected-page Revert, neighbor/stale/busy/cancel controls; full suite. Precise net-clean Revert draft case remains. |
| 13 | Passed | Delete-last/empty pages and both sides of cross-page merge, stale-neighbor and moved-content uniqueness checks; real storage suite. |
| 14 | Passed supported retirement; repair explicitly deferred | Active source removal retains history/assets; duplicate-history recovery regressions pass. New unchanged retired duplicate groups survive409 recovery. K3 ownership reconstruction remains outside the accepted scope. |
| 15 | Passed | Exact named/versioned confirmation, default-off Sectioning replacement and queued stale rejection; full suite. No wider authority inferred from section selection. |
| 16 | Passed exercised failure/publication paths | Full rollback/failure/cancel tests and prior actual forced-crash/retry at unchanged writer source; current Docker/Desktop persistent-state and asset restart checks. Arbitrary crash orderings not exhaustively certified. |
| 17 | Passed supported output paths; platform limits remain | Full owner/scoring/navigation/Webpub tests; fresh four-book Docker and packaged-API Preview/export/restart checks. P2 cross-origin SCORM observation remains open. |
| 18 | Passed corrected required paths; D1/D2/D5 explicitly deferred | New mounted/API/actual-browser recovery tests close FIND-1/FIND-2 and receipt edges; inherited four-editor/version/scope/acknowledgement tests pass. No exhaustive claim for every asynchronous ordering. |
| 19 | Passed bounded contract | CLI/DAG AI stamping and shared quiz batching regressions rerun. General CLI preservation/resume and SPEC-0010 completion are not inferred. |

## Explicit deferrals, platform findings and remaining acceptance

The six deferrals come from [the owner's October 13 comment](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220), not from this implementation or the reviewer. They were not independently fixed or broadened here:

| Item | Status and exact remaining case |
|---|---|
| D1 | Explicitly deferred: net-clean A→B→A guarded draft after Sectioning Revert. The translation net-clean correction above is a different, required path. |
| D2 | Explicitly deferred: quiz deletion can bypass an unresolved Save conflict. |
| D3 | Explicitly deferred: saved empty protected TOC landing card offers a run that skips. Nonempty source-notice replacement remains implemented. |
| D4 | Explicitly deferred: unnecessary unchanged page-sectioning versions during AI edits. |
| D5 | Explicitly deferred: stale Save-error banner after Discard. |
| D6 | Explicitly deferred: exact untranslated “Adjacent page no longer exists” error. |

[SPEC-0001's ratified Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170) continues to govern positional activity-ID carry-over; ownership repair/history reconstruction including K3; staged Speech publication; SPEC-0013 provider-wide preparation classification; bulk/projection/Storyboard-no-op and other named follow-ups; historical blank-ID repair and uncertified pre-schema-14 books. Unverifiable or contradictory ownership remains in raw/history/assets but is omitted from Preview/export with disclosure. No positional inference or duplicate storage system was introduced. The later [before-merge timing/save/provider-harness decision](https://github.com/unicef/adt-studio/pull/879#issuecomment-6340376966) remains a required inherited obligation, not a deferral. Performance issues #995–#997 stay out of scope; publication integrity checks remain.

Explicit spec non-goals remain full Storyboard-rerun preservation, new page/section regeneration, broad Sectioning-mode lifecycle, a fifth Easy Read implementation slice, general CLI preservation/resume and EPUB/PNLD navigation redesign. Existing shared prerequisite behavior remains covered by its regressions.

| Outstanding check/finding | Status and reason |
|---|---|
| Private Frankenstein/De-codable and representative Mathematics STD5/Tanzania field acceptance | Blocked/unavailable here; assigned private/field evidence cannot be replaced by synthetic fixture results. No new product deferral. |
| P1 default local ad-hoc hardened Mac artifact launch | Open platform finding from prior acceptance; unsigned bundle tests do not repair or certify that launch. A fresh default-develop artifact comparison has not established attribution. Not an approved deferral. |
| P2 cross-origin SCORM `window.API` exception | Open existing platform finding, independently reproduced on develop and the branch. Reader content rendered in observed cases; exception is not hidden or claimed fixed. Not an approved deferral. |
| Hosted CI, real cloud publishing, live-provider quality | Not run: candidate remains unpublished; cloud/paid-provider acceptance was not performed. Local passing checks are not hosted CI. |
| Full Electron GUI on this new package, signed/notarized/all-OS releases, actual low-end hardware | Not run anew; bundled-resource checks and historical GUI observations are distinguished. |
| Current full Linux suite/custom nested or arbitrary-seccomp runtimes | Current full suite ran on Mac with 16 Linux-only skips. Prior final 30 Linux writer cases/5,878-test suite remain at 1669c1f5; no new full-Linux claim. The writer's documented deployment/old-lease proof bounds remain. |

## Independent review and recommendation

The separate reviewer read the original specification, original review and final source, built its own requirement map, and challenged public editor→HTTP→writer→SQLite→read/Preview boundaries. Its counterexamples caused the namespace, dirty-state, current-count, net-clean and cross-book receipt fixes before the production freeze. It then independently executed the 102-test focused suite and eight adversarial probes above, finding no remaining material non-deferred defect in those paths. It also inspected the parent's browser and runtime evidence with clear attribution; it did not claim to execute the full suite or those browser workloads itself.

Reports: `independent/source-contract-map-20261101-01.md`, `source-recheck-4fb92b28.md`, `execution-recheck-4fb92b28.md` and `parent-browser-evidence-review-4fb92b28.md` under the local evidence root. The original independent findings remain unchanged as the before-state record.

**Recommendation:** proceed to the requested independent/official implementation review of this local candidate within the agreed scope. Both confirmed November review defects and the material related recovery edges found during remediation are fixed and rechecked. Confidence is high in those reproduced corrections and the exercised preservation paths; no assertion of complete path coverage or absence of bugs follows from test totals. This remains a **qualified implementation**, with explicit owner deferrals, ratified compatibility limits and pending acceptance. Publication and remote retargeting still require the owner's separate authorization.
