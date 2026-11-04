# SPEC-0003 — local recovery final disposition, 2026-11-04

> Historical disposition at runtime `2202e903`. The [additional dual review and correction](spec-0003-final-dual-review-2026-11-04.md) supersedes this readiness conclusion at runtime `758af4d1613317dedde9bc785dfb0ed9bff2cbff`. Its complete 26/18 matrix, new findings, both bounded rechecks and exact-head verification are the current local acceptance record. Evidence below retains its original head and scope.

**Local implementation and verification are complete within the amended B1
contract; ready for final human review with the qualifications below.** The final
tested runtime is `2202e903b81b3644ec47282d04e3f005b0864f33`, based on
`4b9e40cc185cdbceb3ef248248e440c08f25fa82`. This closes the F-2 implementation
decision and its bounded verification. It is not unqualified platform/release
acceptance: the inherited hardened Electron and cross-origin SCORM findings
remain open. The spec remains in review and ADR 025 proposed. No GitHub state,
publication or human approval was changed.

On November 4 the owner replied "use your best judgement here" to the two-option
compatibility question. Root selected one-time capture of readable, previously
untracked identity history on first open. The spec/ADR record that amendment;
repair, regeneration and later checkpoints remain explicit. The correction at
`2202e903` has passing before/after, full-suite, actual older-runtime, independent
bounded, packaged and Linux evidence. Documentation-only commits after this
runtime do not imply another runtime/platform run.

`E` is the main repository's `.local-docs/spec0003-recovery-remediation-20261103/`;
`Q` is `.local-docs/spec0003-recovery-recheck-20261103-codex/`; `F` is
`.local-docs/spec0003-recovery-f2-20261104/`. These private probes
used disposable books, stripped provider credentials and stubbed transport. The
owner's draft SHA256 remains `ee0f3e2c78365841c337aaca7efcd3d9edc83940bd01780af7c84e278aba2861`;
the untracked draft and `tmp/` were not edited or committed. Workloads were
serialized under the existing shared acceptance claim, released after completion.

## Independent findings and disposition

Both requested whole-contract reviews are final at
`bdbc9603823ef506198cec340019cebd85f81bde`, with their own
requirement maps, original/revised matrices and commands:
`.local-docs/spec0003-recovery-review-codex-20261103/` and
`.local-docs/spec0003-recovery-review-claude-code-20261103/`.
The [feedback ledger](spec-0003-recovery-review-remediation.md) retains every
finding and before/after evidence. Corrections were committed as `401247f4`
(continuity, import, performance, route errors), `189cf83d` (intrinsic package
resources), `00b4a5c2` (recovery request/audit schema guard), and `2202e903`
(one-time legacy capture). Review artifacts remain separately attributable:
[Codex whole-contract report](../../../../.local-docs/spec0003-recovery-review-codex-20261103/REPORT.md),
[Claude whole-contract report](../../../../.local-docs/spec0003-recovery-review-claude-code-20261103/REPORT.md),
[first bounded recheck](../../../../.local-docs/spec0003-recovery-recheck-20261103-codex/REPORT.md),
[RC-1 recheck](../../../../.local-docs/spec0003-recovery-recheck-20261103-codex/REPORT-RC1.md),
[F-2 recheck](../../../../.local-docs/spec0003-recovery-recheck-20261103-codex/REPORT-F2.md).

- **C-R1/C-R2/C-R3:** independent bounded recheck at `189cf83d` verified missing
  tracking remains untrusted, contradictory part proof is refused before target
  mutation, retired identities remain reserved, future target tuple reuse cannot
  inherit source repair authority, and required image-input/SVG resources are
  checked. 48 focused tests plus independent positive/negative probes passed.
- **RC-1 (P3):** that recheck found untyped 500s when recovery request tables were
  absent. The common transaction now validates schema before request/audit SQL.
  Root's new regression failed before and passed after (30 tests, 58 title-filter
  skips). The separate final recheck at `00b4a5c2` passed all 12 missing-table/route
  combinations, preservation and healthy receipt replay controls, including
  later damage and schema loss, plus three adjacent tests. No further defect was
  confirmed within this correction. See `Q/REPORT-RC1.md` and `STATUS-RC1.json`.
- **F-1:** compressed exact witnesses, scoped SQL, incremental snapshot reads and
  extant-row deduplication substantially improve the measured workload. The
  40.4MB/750-row fixture now has a 44.1MB DB and 2.2MB witnesses; scoped scans were
  approximately 0.6–2.5ms. Root's 34MiB warm-process RSS delta is **not** a ceiling:
  independent fresh inspection increased high-water RSS by 254.56MiB, with
  325.45MiB total peak. No OOM or specified device-budget failure was established;
  low-end/large-book performance is not certified.
- **F-2:** corrected under the owner-delegated amendment. First open captures
  eligible exact bytes in the tracking-installation transaction; it preserves
  content/current selections/assets and never blesses existing damaged proof or
  tracked changes. Eight actual older-runtime before cases reproduce the dead
  end; all eight pass after. The independent recheck passes 13 probe groups and
  six tests, including rollback/fresh-process retry and negative lost-evidence
  controls. No new defect was confirmed. No SQL guard after old image deletion
  remains. Later old-only born/deleted records remain unprovable; this is not a
  rolling backup or undo for intentional media deletion.
- **F-3/F-4:** the authorized unverifiable-history refusal remains; a valid changed
  incarnation can be explicitly checkpointed but cannot use an older incarnation
  for repair. Earlier verified identities stay reserved. These are not claims of
  universal recovery or freshness acceptance.
- **F-5/H-1:** original route errors are typed and translated; retired imported
  identity reservations are covered by C-R2. RC-1 closes the adjacent missing-table
  error path. No finding is silently assigned to SPEC-0010.

These independent runs are distinct from root's results; overlapping test totals
are not summed into a larger coverage claim.

## Baseline evidence at 00b4a5c2

N1–N12 retain their original runtime attribution
`00b4a5c2705f2be1d2c7a599e90fe3192ff0ffe7`; N4 identifies its separate review
heads. The final-head refresh follows as N13–N20. In particular, N3's real browser
journeys and N12's actual CLI runs are not relabeled as executions of `2202e903`.

| Key | Command / boundary | Result and exact scope |
|---|---|---|
| N1 | `pnpm test --maxWorkers=2` (including pretest build) | **507 files, 6,471 passed, 16 Mac skips**, 885.8s command wall time. `E/logs/final-full.log`; no failing tests. Includes actual storage/API, queue, targeted/DAG, preservation, retry/cache and crash regressions; this is not a claim of every possible race. |
| N2 | `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck`; `pnpm --filter @adt/desktop typecheck`; `pnpm lint`; `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio exec lingui compile --strict` | All exit0. 4,575 entries per locale, zero missing, strict compile passed. Extraction left tracked files unchanged. Available invariant regressions run in N1; no invented `lint:invariants` command. |
| N3 | `python3 E/probes/run-browser4.py` | Four actual Chromium journeys: fixed/reflowable × whole/part. Explicit checkpoint; exact SQLite leaf-cell damage with every tracking trigger intact; zero-call pre-reset refusal; default-off recovery/Cancel; verified repair; stale consent refusal; preference change; explicit Sectioning; split/clone/merge/delete/add; Storyboard and Preview. Original history and all 26 media per book retained. This refresh replaces the earlier dropped-trigger positive fixture. |
| N4 | Independent `Q/{REPORT,COMMANDS}.md` and `Q/{REPORT-RC1,COMMANDS-RC1}.md` | Corrections verified with independent public/shared-boundary probes, 48 focused tests at189cf and 3 adjacent tests/12 route controls at00b4. No new confirmed finding after RC-1. Full-contract maps remain those of both original independent reviews. |
| N5 | `python3 E/probes/compatibility-reviewed.py` | Old source `ef31494dc2951b92222c473960fecee2d91f9544` independently checked against 1,822 Git blobs; old API reads/Preview/web export, then current reopen preserve four authored units, IDs and history. **Does not test or certify destructive older-build edits.** |
| N6 | `python3 E/platform/probes/linux-overlay.py` | **92 tests/7 files**, including independent-process reader/writer/crash cases skipped on Mac. Existing image supplies dependencies only; manifests/lockfile verified, exact candidate source/dist mounted read-only. Not a standard packaging substitute. |
| N7 | Standard `docker build --network=host --target app --label org.opencontainers.image.revision=00b4a5c2705f2be1d2c7a599e90fe3192ff0ffe7 -t adt-history-recovery-20261103:app-00b4a5c2 .`; actual bundled API/nginx runtime | Retry exit0, 140.8s. Image `sha256:2350cf9a7ef0b3b9f254d606d6ebf0e97c5f868f770d8b493d628d062d7d65f1`. Four books, both layouts/part scopes; ordinary rendering, corrupt Library isolation, export and restart passed. 320 ZIP members byte-identical, 104 original image/audio files unchanged, current/history/Preview equal, zero additional provider calls. |
| N8 | `pnpm --filter @adt/desktop build:unpack --publish never --config.directories.output=<E>/platform/desktop-final-review-unsigned`; actual packaged API/resources under Node | Fresh unsigned macOS arm64 build exit0, 16.87s. Bundle/WASM/prompts/templates/assets/config hashes match the build. Two API processes before/after restart; four books, 320 ZIP members and 104 media unchanged, zero provider calls. **Not Electron GUI, hardened launch, signing or release certification.** |
| N9 | `python3 E/platform/probes/formats-final.py` | Eight actual Docker/Desktop API Webpub/SCORM downloads, both layouts, 584 archive members; manifest/href/history checks passed, zero provider calls. Not external reader/LMS or cross-origin SCORM certification. |
| N10 | `focused2`, `public-recovery4`, part ZIP and package resource probes; N4 recheck | 149 tests/7 files plus eight public cases; source physical-damage refusal and repaired-source positive; entire target file comparison; retired identities. Healthy exported image-input/SVG assets return200 in Chromium; cache reuse/deleted-file rebuild and missing-resource409 retain prior publication. See `E/results/part-evidence.json`, `package-elements.json`. |
| N11 | Git ancestry and manifest/lock diff | Prerequisite is an ancestor. No package manifest or lockfile diff against it; no new dependencies. Approval metadata unchanged. |
| N12 | `python3 E/probes/fresh-cli-current.py <fixed/reflowable> <whole/partial>` invoking the actual built CLI in separate processes | Four fresh full-DAG runs exit0; fixed whole/partial use14/13 stubbed transport calls, reflowable17/16. Each repeated existing-book run refuses exit1 with zero additional calls and exact original PDF retained. Persisted page windows are pg001/pg002 or pg002 only, one generated section per page, and fixed/reflowable HTML types match. See `E/results/cli-*.json` and `cli-output-shapes.json`. This is fresh source-window execution, not existing-book resume. |

Exact arrays, exits, timestamps and durations are in `E/results/checks.jsonl` and
platform result JSON. The initial standard Docker build failed during Debian
signature validation with the VM at100%/zero free space. Authorized dangling-image
cleanup reclaimed0B; unused build-cache cleanup reclaimed17.14GB (13GB available).
All other images/containers/volumes were preserved. The unchanged standard build
then passed. Original failure/cleanup logs remain; verification was not weakened
by disabling signature checks or using an alternate target.

N3 is the baseline browser scope. Earlier real-browser slow-page and actual-layout-
switch journeys remain explicitly historical in the round-four audit; current
N1 reruns their public/component regressions. No claim is made that both reviewers
independently reran every UI/platform flow or that development tests prove release
readiness. The fixture media hashes above cover image/audio; fresh-CLI PDF retention
is independently measured in N12, not counted as an extra platform PDF.

## Final-runtime evidence at 2202e903

All rows below refer to `2202e903b81b3644ec47282d04e3f005b0864f33` unless a
before baseline is explicitly named. Exact commands, exits, times and log links
are in [F/COMMANDS.md](../../../../.local-docs/spec0003-recovery-f2-20261104/COMMANDS.md)
and `F/results/checks.jsonl`. Overlapping test counts are not additive coverage.

| Key | Command / boundary | Result and exact scope |
|---|---|---|
| N13 | `pnpm typecheck`; `pnpm test --maxWorkers=2` including pretest build | Both exit0. Full suite **508 files, 6,477 passed, 16 Mac skips**, 924.03s command wall time. The full suite reruns the B1/public/component regressions behind N1; six first-open tests are new. Runtime/Desktop typechecks, lint and five-locale extraction/strict compile remain N2 evidence at00b4; no new user-visible strings were added. |
| N14 | `pnpm exec vitest run packages/storage/src/__tests__/history-legacy-open.test.ts packages/storage/src/__tests__/history-proof-continuity.test.ts packages/storage/src/__tests__/history-recovery.test.ts --maxWorkers=1`; `node F/probes/old-destructive.mjs before/after` | Four initial regressions fail before; **31 tests/3 files** pass after. A first after run corrected a test's null-versus-undefined expectation, not production behavior. Actual old runtime `ef31494dc2951b92222c473960fecee2d91f9544` reproduces eight before failures and passes all eight after: fixed/reflowable × whole/partial source window × deletePage/clearExtractedData. Capture preserves logical content/current/assets; intended old image deletion completes, unrelated images/audio and retired identity reservations survive. Old-only later born/deleted history still refuses checkpoint/allocation. Source audit: 1,822 matched blobs, zero missing/mismatched. |
| N15 | Independent `Q/COMMANDS-F2.md`, `REPORT-F2.md`, `STATUS-F2.json` | **13 independent probe groups and six focused tests**, zero failures/network attempts/new confirmed defects. Four actual old-runtime delete/clear combinations, exact bytes/null types, older selected version, malformed siblings, prior-installation adoption, later explicit checkpoint, changed incarnation, physical damage and missing tracking controls. Injected capture exception rolls back proof/slots/authority; retry in a fresh process succeeds. This is not arbitrary SIGKILL/power-loss certification or another whole-contract review. |
| N16 | Standard `docker build --network=host --target app --label org.opencontainers.image.revision=2202e903b81b3644ec47282d04e3f005b0864f33 -t adt-history-recovery-20261103:app-2202e903 .`; actual API/nginx | Exit0, 128.94s build. Image `sha256:96f7c02192eddadce51646b60370a179cc7ec36c6c849b82497a5383736a8245`. Four books, both layouts/part scopes, rendering, corrupt Library isolation, exports/restart pass. **320 ZIP members byte-identical, 104 original media unchanged**, current/history/Preview equal, zero extra provider calls. No cleanup or signature bypass needed for this build. |
| N17 | `pnpm --filter @adt/desktop build:unpack --publish never --config.directories.output=<F>/platform/desktop-final-review-unsigned`; actual packaged API/resources under Node | Exit0, 18.78s build; fresh unsigned macOS arm64 package. Bundle/WASM/resources match build hashes. Four books before/after restart: **320 identical members, 104 unchanged media**, current/history/Preview equal, zero extra provider calls. API bundle SHA256 `343d33eb4528dfa1f0e01477006240deb559bcd345a67f220dbca41b219754e8`. Not Electron GUI/hardened launch or release certification. |
| N18 | `python3 F/platform/probes/formats-final.py`; `python3 F/platform/probes/packaged-legacy.py` | Eight Webpub/SCORM downloads, **584 members**, manifest/href/history checks pass, zero provider calls. Separately, each actual Docker/Desktop bundle first-opens a genuine old book, captures two records without logical content/current/assets changes, then reopens cleanly after actual old deletePage with intended image removal, unrelated image/audio retained and witnesses unchanged. Desktop API runs under Node. No external reader/LMS/cross-origin GUI certification. |
| N19 | `python3 F/platform/probes/linux-overlay.py` | **98 tests/8 files**, including the six new capture cases and cross-process/recovery paths skipped on Mac. Exact current source/dist read-only overlay; dependency-image manifests/lockfile verified. This supplements standard packaging and is not a substitute for it. |
| N20 | `node F/probes/legacy-large-seed.mjs <fixture>` using actual old runtime; fresh-process `node F/probes/legacy-large-open.mjs <fixture>` | 120-page/750-record fixture, **40,369,770 payload bytes**; all750 captured in1,133.10ms, repeat open20.48ms. DB41,558,016→44,072,960 bytes; compressed proof2,207,650 bytes. Fresh-process high-water RSS80.00→275.34MiB (**+195.34MiB**, total275.34MiB). Different operation from F-1 inspection; neither measurement is a universal peak bound or low-end-device certification. |

All runtime workloads completed and the shared claim was released. Source stayed
frozen during the independent review and platform refresh. N13 reruns current
regressions; unchanged historical browser, CLI, locale and earlier-review artifacts
remain attributed to their own heads. No new source change followed these checks.

## Original AC-1–26 mapped to the authorized contract

Original wording is preserved below. “Passed” evaluates the mapped revised
contract, never an obsolete restriction. N13 reruns all full-suite regressions
referenced as N1 below; N16–N19 refresh the listed package/process boundaries.
The first-open amendment and N14/N15/N18 close F-2 within its exact scope; no
unrestricted downgrade guarantee is inferred from these mode-specific criteria.

| Original criterion | Disposition → revised criterion | Current evidence / status |
|---|---|---|
| AC-1: Dynamic to By Page invalidates Sectioning and every downstream step. | Revised → RAC14 | Passed — informational preference, N1/N3. |
| AC-2: By Page to Dynamic invalidates the same dependency closure. | Revised → RAC14 | Passed — reverse/inherited preference, N1. |
| AC-3: Extract completion and extracted data remain unchanged. | Retained → RAC14/18 | Passed — Extract/no-op and original assets, N1/N3/N7/N8. |
| AC-4: Every existing content version and referenced media byte survives a mode change. | Retained → RAC7/14/18 | Passed — version/asset comparisons for preference/reset/recovery, N1/N3/N4. |
| AC-5: Saving an unchanged effective mode causes no invalidation. | Retained → RAC14 | Passed — no-op effective preference, N1. |
| AC-6: An unrelated config edit causes no mode invalidation. | Retained → RAC14/18 | Passed — adjacent config/cosmetic save preservation, N1. |
| AC-7: A mode transition during active/conflicting work returns 409 with no mutation. | Shared guard retained → RAC15 | Passed — 409 before mutation, N1/N6. |
| AC-8: Studio confirms a transition when retained or completed downstream output exists. | Revised → RAC6/14 | Passed — separate named/default-off regeneration consent, N1/N3. |
| AC-9: Cancel leaves configuration unchanged and sends no mutation request. | Retained → RAC6/8 | Passed — Cancel without mutation, N1/N3. |
| AC-10: A failed update restores/refetches the persisted selection and surfaces the error. | Retained → RAC14/18 | Passed — failed/stale response and retained drafts, N1. |
| AC-11: Successful transitions refresh config, debug config, step and relevant page/stage state. | Revised → RAC12/13/14 | Passed — consistent coverage/informational status, N1/N3. |
| AC-12: By Page preflight rejects a missing latest Sectioning result. | Superseded → RAC4 | Passed — per-page isolation and authorized verified-recovery boundary, N1/N3/N4. |
| AC-13: By Page preflight rejects zero sections. | Superseded → RAC2/12 | Passed — valid empty edit and honest missing coverage, N1. |
| AC-14: By Page preflight rejects multiple sections. | Superseded → RAC2 | Passed — manual multi-section By Page rendering, N1/N3. |
| AC-15: Any preflight failure preserves all rendering versions and starts no rendering call. | Revised → RAC9/10 | Passed — immediate successful-page publication and failed-page retention, N1. |
| AC-16: Exactly one valid section per source page permits Storyboard subject to other prerequisites. | Retained and broadened → RAC1/2 | Passed — generation-only count validation/saved-tree rendering, N1/N3. |
| AC-17: Dynamic mode continues to accept multiple sections. | Retained → RAC2 | Passed — Dynamic multiple saved sections, N1. |
| AC-18: Historical/imported inconsistencies are caught without an observed config transition. | Superseded → RAC3/13 | Passed — usable legacy access/owner qualification, N1/N5/N13; first-open capture and bounded older-writer compatibility N14/N15/N18. |
| AC-19: API, queued, targeted and DAG/CLI paths enforce the same rule, including fixed layout. | Revised with explicit CLI limit → RAC4/17 | Passed — immediate/queued/targeted/combined/DAG regressions N1, actual fresh CLI N12; recovery workflow N3; expanded resume excluded. |
| AC-20: All new UI copy is translated in the five supported locales. | Expanded → RAC16 | Passed — typed HTTP/SSE errors and all five catalogs, N1/N2/N4. |
| AC-21: The implementation adds no dependencies. | Retained → RAC17 | Passed — empty manifest/lock diff, N11. |
| AC-22: Effective override removal/default resolution is correct; invalid modes change nothing. | Retained → RAC14 | Passed — resolver/removal/default/invalid mode controls, N1. |
| AC-23: Injected file/DB failures and restart at each journal boundary never expose new mode with old current status. | Revised → RAC7/15 | Passed — real-process transaction/recovery evidence, N1/N4/N6. |
| AC-24: Admission races and post-preflight edits cannot publish output based on obsolete configuration or section versions. | Retained → RAC6/10/15 | Passed — consent/input/publication revalidation, N1/N3/N4/N6. |
| AC-25: Errors contain the full failure count and at most 20 displayed page identities, including malformed/null results. | Revised → RAC4/16 | Passed — bounded/full-count malformed/null diagnostics, N1/N2. |
| AC-26: Invalid cached multi-section responses follow #692's eviction/retry behavior; valid cache reuse remains possible. | Retained → RAC1 | Passed — actual stub transport/cache validation and retry counts, N1. |

## Revised RAC-1–18 matrix

| Criterion | Status | Evidence / qualification |
|---|---|---|
| RAC-1 generation/cache | Passed | N1 `page-sectioning.test.ts`: invalid cached/live count retries and valid cache reuse, actual stub transport boundary. |
| RAC-2 saved-tree editing | Passed | N1/N3; By Page manual additions/split/clone/merge/delete remain renderable; unrelated target has no count gate; fixed layout retains its positioned-input semantics. |
| RAC-3 legacy lifecycle access | Passed with existing owner qualification | N1/N5/N13; usable older content needs no initialization run. Under the owner amendment, first open captures readable previously untracked identity history once; later inspection does not silently checkpoint old-writer additions or changed tracked incarnations. N14/N15/N18 verify scoped destructive older-writer compatibility. |
| RAC-4 missing/unreadable input | Passed under authorized recovery boundary | N1/N3/N4/N10; per-page Storyboard isolation, early zero-call allocation refusal where hidden historical IDs cannot be proven, explicit verified repair then successful unrelated work. Unwitnessed irrecoverable history is the exact documented qualification, not an invented bypass. |
| RAC-5 missing-only Sectioning | Passed under same boundary | N1; existing AI/manual/unknown/null records retained, actual missing work selected, unaffected versions/assets compared. Damaged reservation history fails before reset/provider work. |
| RAC-6 explicit consent | Passed | N1/N3/N4: default-off affected IDs/versions, stale/cross-book/source/config/rendering rejection, queued revalidation, Cancel unchanged. |
| RAC-7 scoped reset and recovery | Passed | N1/N3/N4/N6: atomic versioned deactivation, retained authored source/assets on failed generation, truthful restart, exact-byte recovery audit/receipt. |
| RAC-8 mode/reset/edit/Storyboard | Passed under authorized recovery boundary | N3 four whole/part × fixed/reflowable journeys and N1 both directions/structural cases. Unverified history is refused, not silently skipped or overwritten. |
| RAC-9 immediate successful-page publication | Passed | N1 real storage/public API and Studio availability regressions; page HTML/tree transaction. Earlier slow-page browser evidence remains historical, not rerun by N3. |
| RAC-10 failure/Skip/cancellation | Passed | N1; already-published pages and failed same-layout previous output retained; stale publication refused. |
| RAC-11 actual layout switch | Passed in current regressions | N1 active-window all-success publication and targeted/partial/failure controls; N7/N8 both-layout packaged runs. Earlier actual switch browser journeys are historical. |
| RAC-12 honest coverage/package | Passed | N1/N4/N7/N9/N10; partial section patch/reset history cannot certify complete; real members/intrinsic resources/cache deletion/refusal preserve prior bundle. Not universal CSS/reader conformance. |
| RAC-13 consistent accessible output | Passed with inherited owner qualification | N1/N3/N5/N7/N8; usable retained output, Library corrupt-book isolation, preview/export and warning/missing-work projection. Unverifiable owners stay omitted with disclosure, raw/history/assets retained. |
| RAC-14 informational preferences | Passed | N1/N3; inheritance/removal/no-op/adjacent config/cosmetic saves preserve appropriate content freshness, attempts and Extract. |
| RAC-15 shared coordination | Passed | N1/N4/N6; all-reader shared admission, queue/publication/version checks, real process death and journal/reset recovery; no anonymous-lock timeout deletion. Older noncooperating concurrent runtimes remain outside the documented coordination guarantee. |
| RAC-16 localized UI/errors | Passed | N1/N2/N4; 4,575 entries/five locales, typed HTTP/SSE/refusal parameters, RC-1 loss cases localized. The inherited exact D6 exception is not broadened. |
| RAC-17 supported CLI and scope | Passed | N1/N11/N12; fresh CLI/DAG and safe existing-book refusal; no B2, automatic cross-page merge, broader CLI resume, new dependency or separate freshness/lock authority. |
| RAC-18 inherited preservation/compatibility | Passed within amended compatibility contract | Authored-unit, baseVersion/draft, restore, identity/audio/TOC consent, NULL/current reads, cosmetic saves, fixed windows/cache/provider accounting pass N13 plus historical N3/N4/N5 and refreshed N16/N17. F-2 has actual old-runtime before/after, independent negative/positive controls and packaged first-open/restart evidence N14/N15/N18. No guarantee for later unobserved old-only history, intentional media undo or noncooperating concurrent old writers. |

The recovery map H1–H9 in [the recovery work record](spec-0003-history-recovery.md)
is exercised by N1/N3/N4/N6/N10 and the current N13/N19 regressions. Its H6
compatibility dimension and the independent review's REC-11 now pass within the
first-open amendment, N14/N15/N18; REC-9/12 do not authorize inventing proof for
lost/unwitnessed records. All 26 original mappings and 18 revised criteria pass
the exercised authorized behavior with their stated qualifications. No failing
old restriction was reclassified as acceptance of the new product behavior.
The nine product-review scenario groups retain the listed regression/UI/platform
scope; open platform findings and human/release acceptance remain separate.

## Product-review feedback to evidence

| Feedback | Disposition / evidence |
|---|---|
| Critical A | Saved By Page manual structure renders; unrelated targeted output has no page-count gate. N1/N3. |
| R1 | Current owned output coverage and actual package completeness; intrinsic dependency/cache corrections independently rechecked. N1/N4/N7/N9/N10. |
| R2 | Version-preserving reset makes historical HTML inactive; lifecycle initialization cannot make it current. N1/N3/N4. |
| R3 | External/inherited preference changes remain informational and do not deny usable output. N1/N3/N5. |
| R4 | Obsolete gates/errors removed; current structured errors translated, including new recovery404s and missing-schema409s. N1/N2/N4. |
| R5 | Per-page HTML/tree transaction and immediate availability, including first output; all-success staging only for actual layout switch. N1. |
| R6 | Dynamic/By Page regeneration then structural operations use the new tree and stable ownership; old history retained, no positional remap. N1/N3/N4. |
| Older-book / preview-export gates | No mode/lifecycle initialization gate; inherited ownership qualification preserved. N1/N5/N13/N16/N17. F-2 first-open amendment verified by N14/N15/N18. |
| Ordinary Sectioning | Missing-only policy deliberately refines SPEC-0002's ordinary eligible-AI replacement; explicit exact-version replacement still protects manual/unknown work. N1/N3. |
| Locking | Shared prerequisite reader/writer safeguards retained; unknown mutexes fail safely, no timeout deletion. N1/N6. |
| CLI scope | Fresh CLI/DAG retained; expanded existing-book resume explicitly belongs to SPEC-0010. N1/N11/N12. |
| Reset versus authored preservation | Confirmed reset and new semantic publication have distinct commit boundaries; failure preserves authored Sectioning, histories/assets and honest missing output. N1/N3/N6. |

## Qualifications, open platform findings and verification limits

1. **F-2 is corrected, not deferred.** The owner-delegated first-open amendment is
   recorded in [the recovery contract](../specs/SPEC-0003-sectioning-modes.md)
   and [ADR 025](../DECISIONS.md), with decision/evidence in `F/DECISION.md` and
   N14/N15/N18. The old implementation deletes images before SQL; no late SQL
   refusal was added. Capture protects eligible history observed on first open,
   not later records created and deleted entirely in an older runtime without
   an intervening explicit checkpoint. Malformed/lost evidence stays untrusted;
   tracked changed incarnations need explicit checkpoint, repair stays explicit,
   and intentionally deleted media is not restored. These are exact evidence
   limits, not a new exclusion for all destructive older-build edits.
2. **Known platform findings are not approved deferrals.** The inherited ad-hoc
   hardened Mac launch/library-validation failure and cross-origin SCORM
   `window.API` SecurityError remain described in the
   [SPEC-0002 platform audit](spec-0002-final-review-2026-11-02.md). This refresh
   did not independently reproduce/close them on the candidate GUI. The former
   lacks an independently built develop launch baseline; the latter has the
   previously documented identical-adapter/two-origin baseline. Node-hosted API
   checks and archive-member checks cannot certify these GUI paths.
3. **Exact existing exclusions only:** B2 modes and automatic cross-page merge are
   excluded by [SPEC-0003's product amendment](../specs/SPEC-0003-sectioning-modes.md#authorized-product-amendment-review-pending);
   expanded existing-book CLI resume is explicitly deferred to SPEC-0010 in that
   spec's coordination/scope contract and RAC-17. No new exclusion was introduced.
   SPEC-0002 D1–D6 remain exactly those authorized by
   [owner comment 6137679220](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220):
   same-page net-clean Sectioning draft after Revert; quiz Delete during unresolved
   Save conflict; saved-empty protected TOC's offered/skipped Run; unnecessary
   unchanged AI-edit Sectioning versions; stale Save banner after Discard; exact
   untranslated “Adjacent page no longer exists”. These do not waive new recovery,
   ownership or reset defects.
4. **Existing safety qualifications:** SPEC-0001
   [Note 7 ratification](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170)
   and its [mandatory follow-up](https://github.com/unicef/adt-studio/pull/879#issuecomment-6340376966)
   retain raw/history/assets but omit unverifiable or contradictory rendered
   owners with a warning; missing authorship alone does not justify omission.
   The owner-authorized exact-byte recovery section of SPEC-0003 cannot repair
   already-corrupt unwitnessed/contradictory evidence and never guesses IDs or
   silently replaces content. These boundaries remain explicit.
5. **Not run/certified:** signed/notarized releases, full Electron GUI/all-OS GUI,
   external LMS/reader interoperability, private partner-book field acceptance,
   live paid-provider quality, low-end-device performance and hosted exact-head CI
   for this unpublished candidate. These are verification limits, not permission
   to ignore a known product defect. Spec/ADR human approval remains pending.

The exercised B1 paths and all confirmed recovery corrections are ready for final
human review with high confidence in the stated scope. The final full suite,
three bounded rechecks and packaged evidence support that conclusion; they do not
close the named platform findings or confer unqualified release acceptance.
There is no remaining F-2 owner question or authorized implementation work pending
in this local disposition. SPEC-0010 must reuse these admission/identity/publication
contracts and their explicit evidence limits. The idle follow-up is retired at
disposition; the chat remains available and no publication is authorized here.
