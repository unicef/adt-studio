# SPEC-0002: current-develop readiness audit — 31 October 2026

## Assessment

> **Later acceptance update:** [additional platform, offline and crash findings](spec-0002-additional-acceptance-2026-10-31.md) supersedes this readiness recommendation. Actual forced Docker restart exposed a shared PID-reuse writer-admission blocker; default local Desktop launch and cross-origin SCORM qualifications are also recorded. No new product deferral is authorized.

The local branch implements the non-deferred preservation contract on current develop. The audit found and fixed additional defects in TOC replacement entry points, Sharing ownership and historical translation recovery. Two independent reviewers rechecked the fixes. The final production checkpoint passes the full repository suite, browser regressions, combined Docker runtime/export/restart, packaged Desktop API/resources/export/restart, and the bounded built-old-API readability probe.

This supports **independent review within the agreed scope**, not an unconditional claim that the original specification has no remaining failures. The six explicitly owner-deferred defects remain real; the inherited legacy-ownership policy, SPEC-0001 follow-ups and explicit non-goals remain bounded below. Private historical-book and representative Mathematics STD 5 acceptance, paid-provider quality, hosted exact-head CI and release certification are not established by these checks. SPEC-0002 and INDEX remain draft/unapproved.

No changes were pushed. PR #880's title, body, base and review requests were not changed; no GitHub comment, merge or issue closure was performed. Proposed later remote base: **develop**, subject to separate publication authorization. The remote PR remains on its old stack base. No owner walkthrough is requested again.

## Exact revisions and integration

| Reference | SHA |
|---|---|
| Refreshed develop; unchanged at final remote check | `df4df3aa7b5e37114f5e86db3d1cbf9bac3ce2a0` |
| Original/published SPEC-0002; unchanged remotely | `09f0d1c7c9d63662f621db4dcdb6ded8dc2cca89` |
| Genuine original inherited SPEC-0001 boundary | `aefe41855ae63d89c09db5553c50f48eb01b190d` |
| Merged SPEC-0001 squash | `c153ba7d26c2323b67236c61297999424b169ac1` |
| Final SPEC-0001 pre-squash head | `811d14751d6e01a8262d3e34466c1f45875b8ca1` |
| Frozen production/test checkpoint for final full/platform checks | `515735486159133a4906a5535c6a48c3cb2cab87` |

The October 26 integration transplanted the genuine SPEC-0002 net changes from aefe41855..09f0d1c7 onto then-develop 30e5a37b. This avoided replaying obsolete SPEC-0001 ancestors after its squash merge. October 31 rebased only the three resulting local commits onto df4df3aa. Recoverable refs preserve original and intermediate heads, including `backup/spec0002-readiness-oct31-local` and `backup/spec0002-readiness-oct31-develop`. Main-checkout drafts and original books were not modified.

Develop changed 493 files since that prior integration; 15 overlapped the implementation increment. The inventory, range-diff and conflict review are retained locally. The API client conflict preserves develop's single `ApiError` with both status and error code, while retaining SPEC-0002's localized fallback and 409 handling. Locale conflicts retain upstream strings plus the preservation strings. Reader TOC navigation retains upstream follow-mode behavior. Extraction normalizes catalogs; no obsolete duplicate error class or ancestor implementation was replayed.

Final-tree/source review, focused regressions and whole-branch checks retain the SPEC-0002 specification, INDEX row, relevant ADR changes, accepted Revert UI, current shared admission/freshness/ownership/publication mechanisms and newer upstream provider, sharing, speech and reader behavior. No descendant branch was merged or broadly imported. Narrow shared-resolver and Sharing corrections were explicitly authorized by the owner. The production increment is 136 files; the majority predates this renewed audit. The latest fixes add no dependency or competing storage/locking/ownership system.

Local commits after integration:

- `f9b5d2cf` — reconcile SPEC-0002 preservation with merged SPEC-0001.
- `e69aefc6` — protected quiz input-review and concurrent-publication regressions.
- `bfedc39d` — October 26 audit and acceptance limits.
- `964dbb7c` — exact named TOC replacement from source notices, including book/stage scope reset.
- `40ea2bb0` — Sharing feedback uses actual stable section owners.
- `51573548` — recover restored manual translations past unrelated legacy duplicates.

This report and evidence pointers are documentation after the frozen production checkpoint. They do not claim that an unpushed documentation commit has hosted CI.

## Contract sources and feedback-to-evidence ledger

Preparation and the renewed review use the complete specification, decisions, AC-1–19, narrative/test/rollout requirements, source issues, paginated PR #880 and #879 discussions/reviews/inline/timeline records, linked decisions, architecture, guidelines, invariants, applicable ADRs and the proposal/SDD reference materials. October 31 source snapshots were refreshed; discussion bodies were unchanged from the prior audit. Original review conclusions are historical evidence, not automatically passing results.

| Finding / contract | Current result and evidence |
|---|---|
| Original review: real admission/preparation, authorship vs freshness, identities/restore, Keep/Edit/Replace, bounded CLI | Retained and exercised through real HTTP run routes and persisted history/output. Manual/unknown units survive ordinary own/upstream runs. Shared writer admission and successful transaction publication remain authoritative. |
| F1 — old HTML/answers acquire new identities | Passed supported-owner regressions in `manual-edit-survival.test.ts`, catalog/ownership/packaging tests. Replacement/reorder/prune/restore retains actual HTML, answer, translation and physical-audio owner; new URLs do not borrow old output. Contradictory ownership fails closed. Legacy unprovable owners retain raw history/assets but are omitted with disclosure under the ratified policy. |
| F2 — positional TOC ID recovery edits another chapter | TOC-specific whole-document conflict policy retained. Mounted editor and actual two-writer browser rejected Save → choice → next Save pass, including independent title/indent edits. A reused toc_001 is not chapter identity. |
| F3 — protected fixed layout loses positioned tree | Paired tree/HTML retention survives ordinary success/failure/cancel/reopen in regressions; actual Docker and Desktop preview/export/restart retain fixed owner pg001_sec009 and unchanged page state. Broader mode lifecycle is not claimed. |
| F4 — combined Sectioning → TOC silently skips confirmed replacement | Exact same-run receipt advancement retained; external SQLite writer cannot inherit consent. Real running API stage-range check made two Sectioning, two intervening Storyboard and exactly one TOC transport call; final TOC is AI and manual history remains. Competing writer refusal is independently covered in route tests. |
| #884 JSON-null prerequisite | Minimum shared resolver correction retained, with failing-before SQLite/HTTP preview/export evidence from October 26 and passing final suite. JSON-null inactive positioned data cannot hide valid semantic data; malformed non-null/conflicting claims are not guessed. No broad SPEC-0003 import. |
| October 26 independent finding: protected quiz run falsely accepts changed inputs | Retained fix and regressions. All-protected run makes zero model calls and leaves the input warning. Partial generation preserves the warning; explicit guarded Keep accepts the basis. Competing source mutation fails before publication. |
| October 31: nonempty protected TOC source-notice Re-run silently skipped | Fixed in 964dbb7c using existing exact-version named replacement confirmation. Actual browser Cancel makes zero calls; stale confirmation rejects 409 with zero calls; fresh confirmation makes exactly one TOC transport call, retains manual history and clears the input warning. This is distinct from deferred D3. |
| October 31: open TOC confirmation survives book/stage switch | Independent mounted reproduction failed before the fix; remounting notice state by book/stage clears consent. Two independent cases pass. Confirmation does not refresh its snapshot to a background writer's version. |
| October 31: new develop Sharing uses section array positions | Owner-authorized narrow fix in 40ea2bb0. Actual persisted IDs drive comments, counters, links and HTML selection; missing/duplicate IDs are unavailable, not guessed. Browser old-link → reordered owner, dashboard navigation, retirement disclosure and restore reconnection pass. Export has distinct A/B HTML and matching title-ID metadata. Publishing-service reads were stubbed; local editor/API/storage/export were real. Live cloud publishing is not claimed. |
| October 31: unrelated duplicates abort manual translation history recovery | Independently failed at 40ea2bb0: after source prune/run/restore/run, AI replaced an unrelated historical manual correction. Fixed in 51573548: current complete ID groups win; newest complete historical group is recovered per missing ID; ambiguity cannot stop other IDs. Independent current/historical-duplicate HTTP cases and committed SQLite restart cases pass. Actual running API/editor/export preserves the correction and duplicates, with zero Translation transport requests. Two legitimate context preparation requests are accounted separately. |
| Stale documentation after SPEC-0001 | October 26 reconciliation retains final labels, input notices, permitted review-baseline migration without authorship inference, legacy unchanged-entry saves, ADR-028 resolution and owner qualifications. October 31 corrects the notice attribution to Quiz/Glossary/TOC, rather than inventing a Sectioning Keep subsystem. No numbered AC was relaxed for these fixes. |

Source decisions: [original review](https://github.com/unicef/adt-studio/pull/880#issuecomment-5776174130), [follow-up](https://github.com/unicef/adt-studio/pull/880#issuecomment-5868235633), [F1–F4](https://github.com/unicef/adt-studio/pull/880#pullrequestreview-5486314026), [prior fixes](https://github.com/unicef/adt-studio/pull/880#issuecomment-6123311666), [ADR discussion](https://github.com/unicef/adt-studio/pull/880#issuecomment-6129794433), [six owner deferrals](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220), [SPEC-0001 Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170).

## AC-to-evidence matrix

Passed means the specified development observations passed within the named compatibility bounds. A row carrying a deferred failure is not an unconditional pass for the original AC. The full-suite checkpoint includes all committed regressions cited below. No AC checkboxes or approval status were changed.

| AC | Status | Concrete evidence and limit |
|---|---|---|
| 1 | Passed | Translation route tests: changed/new-only server stamps, no-op provenance, receipt/baseVersion guards, first language and unchanged duplicate/retired full-list compatibility. Actual legacy French/Spanish saves reopen correctly. |
| 2 | Passed; real-book scale acceptance not run | `catalog-execution.test.ts`: complete-source fixed windows before filtering, payload exclusions, skipped vs adapter/cache/provider/retry/cost accounting; 8,850 entries/177 windows. Ordinary current skipping and separate warmed full-eligibility experiment remain distinct. History-recovery regression and real transport check preserve restored corrections. Mathematics STD 5 harness is not substituted by synthetic scale. |
| 3 | Passed | Quiz edit/no-op/reorder/new ID tests; actual editor save preserves protected quiz and option IDs through two ordinary runs and reader scoring. |
| 4 | Passed | Complete protected page groups, overlap/order independence, no eligible/all protected and repeated-run batching tests. Protected quiz content/IDs/translations/audio/reading order retained. Aggregate generatedAt/version may advance; no claim of unchanged aggregate metadata. Protected input warning is not falsely accepted. |
| 5 | Passed | Changed-only whole-document TOC save stamps and generation stamp tests; no-op AI/unknown tags retained; actual browser save/history. |
| 6 | Passed except explicitly deferred D3 | Named confirmation, cancel/failure/history and combined API path. New source-notice path has browser stale/cancel/confirmed call evidence. Saved empty protected TOC landing card still offers the deferred no-op run. |
| 7 | Passed except explicitly deferred D4 | Structural and AI-edit tests stamp genuinely affected pages via shared mechanisms; no-op authorship retained. Extra unchanged AI-edit versions remain deferred. |
| 8 | Passed | Whole-page manual/unknown/empty preservation with no protected model call/write/retirement; fixed tree/HTML pair and eligible neighbors covered. |
| 9 | Passed within ratified legacy bounds | Six-unit real Save → own/upstream HTTP run → current/history → preview/export survival suite. Actual scoped/fallback browser flows retain manual French and neighbors. Private historical books remain pending. |
| 10 | Passed for required indicators; D6 deferred | Badge/control component suites, five-locale extraction (4,475 messages each, zero missing), strict compile and lint pass. Exact old adjacent-page error remains untranslated by owner direction. |
| 11 | Passed within bounded readability promise | Unknown protection and first-open review baseline regressions; built old API reads all four units, preview and Web export, then current reopen retains IDs/authorship/history. No downgrade editing/rerun, pre-schema-14 certification or authorship migration promise. |
| 12 | Passed except explicitly deferred D1 | Restore preserves provenance; selected-page Revert chooses highest earlier explicit AI version; cancel/missing/stale/busy/neighbor checks. Browser Revert and translation prune/restore recovery pass. Net-clean A→B→A pending-draft Revert edge remains deferred. |
| 13 | Passed | Delete-last/empty page and cross-page merge regressions protect both records, preserve moved content exactly once and reject stale neighbor before mutation. |
| 14 | Passed within ratified legacy bounds | Active source retirement, history/asset retention, same-ID recovery and no borrowing for new IDs. New duplicate-history regression covers both current and historical ambiguity of an unrelated ID. K3 reconstruction remains deferred. |
| 15 | Passed | Default-off named page snapshots, frozen versions, queued stale rejection and dialog tests. Ordinary run never replaces unnamed protected work. |
| 16 | Passed | Failed/cancelled/SQLite-failed publication retains prior current unit; successful quiz replacement gets a fresh ID; Sectioning reuses only proven unchanged identities. Retirement follows successful publication. |
| 17 | Passed within specified output scope | Current owner/content in HTTP/browser/Web export, actual quiz scoring/TOC navigation and Webpub tests. Both packaged runtimes preserve all ZIP member bytes across restart; restored manual translation present in export. No EPUB/PNLD navigation redesign or unrestricted legacy-ownership claim. |
| 18 | Passed guards/F2; D1/D2/D5 deferred | Four guarded PUTs/restores, stale/busy/no-write tests, actual two-writer TOC recovery. Actual browser Stay/Save & leave and delayed successful timing acknowledgement retain a newer unblurred draft, then next guarded Save persists it. Deferred draft/delete/banner cases remain visible. |
| 19 | Passed, bounded | CLI/DAG four-node AI stamping and shared quiz batching regressions. Does not establish general CLI preservation/resume or SPEC-0010 completion. |

## Explicit deferrals and remaining limits

All six SPEC-0002 defects below have the same human authority: [elasticsounds, October 13](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220), “None of them is required for this version.” They were not independently promoted into implementation work. Source review confirms these limits remain; this audit does not claim six new browser reproductions or that develop fixed them.

| ID | Status | Exact remaining failure and reason left open |
|---|---|---|
| D1 | Explicitly deferred | Net-clean A→B→A guarded draft can override selected-page Revert. Owner permitted follow-up; other dirty/stale/pending-save protection is still required. |
| D2 | Explicitly deferred | Quiz deletion after unresolved Save conflict can bypass the conflict choice. Owner permitted follow-up; ordinary Save guards remain required. |
| D3 | Explicitly deferred | Saved empty protected TOC landing Run card can queue a run that skips. Owner permitted follow-up; this does not exempt nonempty source-notice Re-run. |
| D4 | Explicitly deferred | AI edits can add unnecessary unchanged page-sectioning versions. Owner permitted follow-up; no-op authorship and safe publication remain required. |
| D5 | Explicitly deferred | Discard can leave the stale Save-error banner. Owner permitted follow-up; retained draft/data correctness is not waived. |
| D6 | Explicitly deferred | The exact client error “Adjacent page no longer exists” remains untranslated. Owner permitted follow-up; changed strings are fully translated. |

SPEC-0001's [ratified Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170) leaves positional activity-ID carry-over; ownership repair/history reconstruction including K3; staged Speech publication between synthesis and timings; provider-wide preparation failure classification to SPEC-0013/#889; bulk review/projection optimization/Storyboard no-op short-circuit and other named Note 7 follow-ups; historical response-space/blank-drift repair and pre-schema-14 certification. Performance #995/#996/#997 remains outside this increment. This does not waive current save acknowledgement, hashless timing save, source receipts, namespace guards, manual speech, retry/cache or retained physical assets.

The earlier “later” treatment of timing draft/save and provider harness defects was superseded by [the explicit before-merge decision](https://github.com/unicef/adt-studio/pull/879#issuecomment-6340376966). Those fixes and regressions are inherited obligations, not deferrals. Ordinary freshness does not acquire media-byte hashing; necessary publication/restore integrity checks remain.

Unverifiable/contradictory legacy owners are retained in raw content/history/assets but omitted from preview/export with disclosure, as ratified in Note 7 C. This is a safety policy, not completed repair. No positional inference was introduced to make a test pass.

Explicit spec non-goals remain: full Storyboard-rerun preservation under #144; new page/section regeneration; broad Sectioning-mode lifecycle; a fifth Easy Read implementation slice; general CLI preservation/resume; EPUB/PNLD navigation redesign. Existing shared Easy Read and other prerequisite behavior still must work. The real-book harness and signed/all-platform release gates are pending acceptance, not newly invented product deferrals.

## Commands and results

Working directory: `tmp/spec-0002-implementation` under the main repository. Git-dependent commands use `DEVELOPER_DIR=/Library/Developer/CommandLineTools`. Raw logs, snapshots, scripts, disposable books and checkpoint exports are in main-repository `.local-docs/spec0002-readiness-oct31/`, outside Git; earlier raw integration evidence remains under `.local-docs/spec0002-develop-oct26/`.

| Exact command / check | Final result |
|---|---|
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test --maxWorkers=2` | **468 files / 5,857 tests passed** at 51573548; 462.67 seconds. Includes `pretest` root build. `logs/full-51573548.log`. |
| `pnpm typecheck` | Passed. `logs/typecheck-final.log`. |
| `pnpm --filter @adt/runtime typecheck` | Passed. `logs/runtime-typecheck-final.log`. |
| `pnpm lint` | Passed, zero errors and eight unused-disable warnings also observed on the initial integrated baseline. `logs/lint-final.log`; no unrelated suppression cleanup. |
| `pnpm build` | Passed through final `pnpm test` pretest (TS, reader and publish-service artifact); actual Studio production build also passed in Docker/Desktop. |
| `pnpm --filter @adt/studio extract` | Passed, 4,475 messages in each locale, zero missing. `logs/i18n-extract-final.log`; no extraction diff left. |
| `pnpm --filter @adt/studio exec lingui compile --strict` | Passed all five locales. `logs/i18n-compile-final.log`. |
| `git diff --check` and `git diff --check origin/develop..HEAD` | Passed. No standalone invariant-check or `pnpm acceptance` script exists; invariant-related tests run in the full suite. |
| `node scripts/probes/spec-0002-compatibility.mjs --baseline /Users/ksokolovic/Development/adt-studio/tmp/spec-0002-evidence/compat-before` | Passed current Save → actual built old API reads/preview/Web export → current reopen; four units' authorship/IDs/history unchanged. `logs/compatibility-final.log`. Baseline source ef31494dc2951b92222c473960fecee2d91f9544, with all 1,822 tracked source blobs re-compared successfully in this audit. |
| `docker build --target app -t adt-spec0002-oct31:final .` | Passed at 51573548. `logs/docker-build-51573548.log`. Combined API/nginx/reader runtime on 127.0.0.1:8089, isolated bind-mounted books. |
| `pnpm --filter @adt/desktop build:unpack` | Passed at 51573548, macOS arm64 Electron 41.1.1 unpacked app, ad-hoc signing, no notarization. `logs/desktop-build-51573548.log`. |
| `PROJECT_ROOT=<packaged Resources> BOOKS_DIR=<isolated desktop-books> PORT=3021 ADT_ENVIRONMENT=electron node <Resources>/api/api-server.mjs` | Actual packaged API/resources started, preview/export checked, stopped/restarted and rechecked. Not a full Electron GUI or signed-release check. |
| `node <evidence>/probes/platform-smoke.mjs <base> <checkpoint>` | Four books on each runtime before/after restart: cosmetic, recovered TOC, fixed layout, restored translation with legacy duplicates. Page responses unchanged. `platform-restart-inspection.json`: ZIP CRC valid, every member byte-identical within each platform before/after restart. |
| Hosted exact-head CI | **Not run**: no push authorized. No historical CI result is presented as evidence for this local head. |

Intermediate failures are retained and classified: initial sandboxed suite hit explicit loopback `EPERM`/Wrangler log permissions; rerunning with appropriate local permissions passed. Docker initially failed apt verification with its VM at 100% disk; a clean base apt check passed, unused build cache was cleared without removing images/containers/volumes, and subsequent full builds passed. Older probe assumptions failed on changed Add Book UI/API response fields, already-edited fixture values, a relative Playwright request URL, and insufficient synthetic Storyboard markup. The final probes corrected these harness assumptions; production validation was not relaxed. The translation live probe initially incorrectly counted two speech-preparation calls as Translation calls; final evidence classifies them separately. The original translation recovery failure was a real implementation defect, with independent before-fix evidence, and was fixed.

## Real journeys, stored data and outputs

PROJECT_ROOT, API/UI/reader and packaged resources were pinned to this checkout. BOOKS_DIR contained disposable copied or synthetic books only. Provider transport was stubbed at actual HTTP fetch; unknown external transport was blocked. No paid generation calls occurred. Fixture copies model stable modern books, schema-14 legacy duplicate/retired entries, absent-language translation, fixed layout, identity replacement and delayed/concurrent writers. They do not substitute for unavailable private historical books.

- Cosmetic Storyboard color/spacing/image changes: actual Save/reload/reader/export, equal consumer outputs, zero generation transport.
- Scoped text, missing inputs, preparation failure/fallback and explicit retry: actual UI stage runs preserve manual French and unrelated neighbors; repeated current/fallback work makes zero new calls; explicit preparation retry makes one preparation call without audio/timing calls where results match. Glossary IDs and image/caption membership remain correct.
- TOC: actual two-writer identity replacement rejects Save and retains draft; explicit recovery and next Save work. Unrelated title/indent changes survive. Reader destination navigation works. New source-notice Cancel/stale/fresh-consent cases and combined HTTP range run are recorded separately.
- Quizzes: actual editor edit, two ordinary real HTTP reruns, exact protected quiz/option identity/content, manual history and zero transport. Built reader scores the saved correct option. No claim that aggregate quiz versions never advance.
- Sectioning: actual selected-page Revert Cancel/Confirm preserves neighboring page and manual history, zero transport. Full structural deletion/cross-page/concurrent-writer/failure cases run in real SQLite route regressions. Matching fixed tree/HTML is exercised in both packaged runtimes and restart exports.
- Sharing: old positional comment URL resolves its actual stable owner after reorder; dashboard link opens that owner; retirement leaves feedback readable but unavailable for editing; restore reconnects same identity. ZIP owner content/metadata inspected. Only external publishing-service reads were stubbed.
- Translation recovery: real Save/prune/run/restore/run recovers manual pg013_tx001 despite duplicates for pg012_tx003. Zero Translation requests; two separately counted preparation requests reflect changed context. Actual editor shows the correction; downloaded Web ZIP and both packaged runtimes retain it across restart.
- Legacy saves: actual French save/reopen carries unchanged ambiguous/retired entries; configured Spanish's first entity save works; caption save retains foreign-page legacy entries. A fresh isolated fixture proves Spanish had no entity/history before Save and exactly version 1 afterward; unrelated ambiguous/retired French entries and foreign captions compare equal. Supported compatibility is not silently generalized to ambiguous TOC identity.
- Save timing: actual settings navigation offers Stay and Save & leave without losing the timing. A separate browser probe delays a real successful HTTP acknowledgement, types a newer unblurred value, then verifies the first acknowledgement retains that draft and a second guarded Save persists it. No provider calls.
- New Book: current upload screen opens without a database or mutation/provider call. Full Extract/live-provider book creation is not claimed; new-book admission regressions run in the full suite.

Each checkpoint export has a distinct filename. Docker and Desktop archives are compared within their own runtime before/after restart, not falsely required to be identical across operating systems.

## Independent review and remaining acceptance

Two separate read-only agents reviewed original requirements and refreshed feedback, built their own maps, challenged public paths and examined the final develop-to-branch increment. The main agent remained the sole implementation writer. Reports distinguish independently executed assertions from inspected parent browser/platform artifacts.

- Requirement/adversarial reviewer: found the source-notice gap, scope carry-over and unrelated-duplicate recovery defect; all fixed. At 51573548 independently ran two real HTTP/SQLite recovery scenarios (2/2) and retained-catalog/TOC-notice suites (25/25). Earlier notice/route 63/63 and scope 2/2 results remain explicitly tied to their earlier checkpoint.
- Develop-compatibility reviewer: independently found the Sharing ownership risk, reviewed its correction and exported owner content, then rechecked the final recovery fix. At 51573548 independently ran retained-catalog plus real HTTP survival suites, 2 files/51 tests passed; diff check passed.
- Neither reviewer reported another confirmed material non-deferred defect at the frozen checkpoint. That is a bounded review result, not proof of absence of bugs.

The local `independent/deferral-register.md` records exact human authority and boundaries; `independent/adversarial-review-brief.md` maps recurring SPEC-0001 review failures to SPEC-0002 probes. Both standalone review prompts point to these and require reviewers to derive their own map first.

Remaining acceptance: private Frankenstein/De-codable books assigned to the owner, Mathematics STD 5/field-scale harness and Tanzania doctor acceptance where required by their owning release gate; live-provider quality and real cloud publishing; full Electron GUI, signed/notarized installers/all OSes; low-end/offline performance measurements; and hosted CI after separately authorized publication. None is marked passed or converted into a product deferral. That earlier audit identified no additional unresolved decision; subsequent actual crash acceptance exposed R1 in the linked update.

Recommendation: submit this local candidate to the requested Codex and Claude Code independent reviews. Address any valid non-deferred finding before publication. The evidence supports the **current contract with its explicit deferrals and ratified compatibility limits**, not unconditional completion of every sentence of the original unqualified spec or release approval.
