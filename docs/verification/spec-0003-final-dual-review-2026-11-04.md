# SPEC-0003 — additional dual review and correction, 2026-11-04

Subsequent bounded follow-up: [recovery simplifications 1 and 2](spec-0003-recovery-simplifications-2026-11-04.md), runtime `6fb147d51438c920d0afc568d14c3ee859295e79`. The prior whole-contract assessment and exact qualifications below remain unchanged; the follow-up records its own affected tests and independent recheck.

**Local corrections and verification are complete within the amended B1 contract; ready for final human review with the qualifications below.** Both additional whole-contract reviews and both bounded rechecks are final. All 26 original mappings and 18 revised criteria pass the exercised authorized behavior. This is not unqualified platform or release acceptance.

The owner requested one additional independent Codex and Claude whole-contract review after explicitly selecting automatic first-open capture of readable legacy history. Both reviewed `7b9e0d2981b9237ba98330c18ceac49a19a2eec8` (runtime `2202e903b81b3644ec47282d04e3f005b0864f33`) against prerequisite `4b9e40cc185cdbceb3ef248248e440c08f25fa82`. Neither review changed source. Their findings superseded the earlier all-pass claim on that candidate until corrected; their original reports remain intact.

Root corrected the confirmed failures in runtime `758af4d1613317dedde9bc785dfb0ed9bff2cbff`. This record distinguishes those fixes, design observations, inherited exact exclusions and unavailable platform/release verification. The source remained frozen during both independent reviews and the bounded correction rechecks. Root is the sole implementation writer. No push, GitHub change, human approval, publication or release is claimed.

## Review and feedback ledger

`V` below denotes the main repository's `.local-docs/spec0003-final-review-20261104/`; `C` and `L` denote the adjacent `spec0003-final-review-20261104-codex/` and `spec0003-final-review-20261104-claude-code/` directories. N1–N20 refer to the exact historical heads and evidence in the [previous acceptance record](spec-0003-recovery-acceptance-2026-11-04.md), not executions of the new runtime.

- [Codex final whole-contract report](../../../../.local-docs/spec0003-final-review-20261104-codex/REPORT.md), [matrix](../../../../.local-docs/spec0003-final-review-20261104-codex/MATRIX.md), [commands](../../../../.local-docs/spec0003-final-review-20261104-codex/COMMANDS.md).
- [Claude final whole-contract report](../../../../.local-docs/spec0003-final-review-20261104-claude-code/REPORT.md), [matrix](../../../../.local-docs/spec0003-final-review-20261104-claude-code/MATRIX.md), [commands](../../../../.local-docs/spec0003-final-review-20261104-claude-code/COMMANDS.md).
- [Codex bounded recheck](../../../../.local-docs/spec0003-final-review-20261104-codex/RECHECK.md), [recheck commands](../../../../.local-docs/spec0003-final-review-20261104-codex/RECHECK-COMMANDS.md).
- [Claude bounded recheck](../../../../.local-docs/spec0003-final-review-20261104-claude-code/RECHECK.md), [recheck commands](../../../../.local-docs/spec0003-final-review-20261104-claude-code/RECHECK-COMMANDS.md).
- [Root triage](../../../../.local-docs/spec0003-final-review-20261104/TRIAGE.md), [independent bounded adjudication](../../../../.local-docs/spec0003-final-review-20261104-codex/TRIAGE-CLAUDE.md).

| Finding | Disposition at 758af4d1 | Evidence and boundary |
|---|---|---|
| C-FINAL-1 P2: mixed-case stylesheet relation bypasses package completeness | Fixed. Normalize relation tokens in the common required-file validator. | Public Hono/ZIP/Chromium before probe: mixed/upper links publish missing CSS and replace prior output. After: all three case variants return 409 and preserve previous publication. Regression tests cover multi-token links, present/missing/cache deletion and complete prior ZIP byte preservation. RAC-12/13 and R1. |
| Claude F-3 low: selected unreadable input resets output before known refusal | Fixed. Shared admission checks selected existing Sectioning schema before reset, and direct reset rechecks it inside the transaction. | Before: accepted 200, later worker refusal, avoidable null rendering/activity versions. After: typed 409 before changes to saved rows; zero provider calls. Tests retain unrelated unreadable-neighbor/missing-page availability and direct reset safety. RAC4/6/7/10. This was avoidable mutation, not irreversible history/media loss. |
| Claude F-4 low: repeated reflowable rendering appends redundant fixed-tree nulls | Fixed in stage and shared publication paths. Deactivate only a selected non-null fixed tree. | Before three reruns advance fixed current/witnesses at 2→5; after three successful runs remain 2. Stage and targeted regressions include subsequent actual fixed→reflowable switch and preserve every old version. RAC9/11/18. SPEC-0002 D4 does not cover this different node. |
| Claude F-1 medium: unchanged evidence-v1 format lacks a future migration mechanism | Future maintenance requirement, not a demonstrated present defect. | Exact v1 SQL/node-list definition must be preserved; a real format change needs a versioned migration, old-v1 fixtures and lost-object negatives. Comment records that discipline. No speculative migration, schema bump, or permission to recreate missing proof was added. |
| Claude F-2 medium: global gap blocks identity-bearing writes and offers misleading recovery guidance | Preserve the required fail-closed behavior; clarify the existing diagnostic in all five locales. | No proven unaffected identity namespace exists after global tracking loss. Reads/selected historical versions remain available, but a verified backup is required for lost tracking; inspection/checkpoint cannot reconstruct it. Codex's independent adjudication supports this reading of the existing contract. No CLI doctor/resume or new automatic repair. |
| Claude F-5 / H1 / H2 | No further current defect established. | Visibility overlaps F-2; intermediate unpublished schema text is not the supported older-build baseline; cumulative capture costs retain the explicit performance limit. |

Claude's original report proposed owner decisions for F-1/F-2. Root used the owner's delegated judgment and the existing explicit recovery contract, with independent Codex adjudication and Claude agreement in its bounded source recheck, to distinguish future evolution and necessary global-proof refusal from current defects. This is not an accepted deferral of a confirmed failure. A future request to permit identity writes through lost global proof would need its own design; it is not inferred here.

Claude’s bounded source recheck also noted that an internal shared commit could parse malformed fixed-tree JSON and throw a raw SyntaxError. Supported stage/targeted paths already read and refuse that malformed payload earlier; the fresh-only DAG has no retained fixed tree. No newly reachable regression was demonstrated, and this observation is retained as information rather than an accepted defect deferral.

These final-round labels are distinct from the original recovery-review F-1–F-5. Original C-R1/C-R2/C-R3, RC-1 and the original F-2 first-open amendment retain their corrections and exact evidence in [the recovery ledger](spec-0003-recovery-review-remediation.md). The owner's actual selected reply explicitly authorized first-open readable legacy capture; repair, regeneration and later checkpoints remain explicit. No policy answer remains pending.

## Commands and results on the corrected runtime

Exact commands and results: [root command ledger](../../../../.local-docs/spec0003-final-review-20261104/COMMANDS.md). Exact argv arrays, exit statuses, durations and logs: [checks.jsonl](../../../../.local-docs/spec0003-final-review-20261104/results/checks.jsonl). Reviewer totals overlap root tests and are not summed into a synthetic coverage total.

| Key | Boundary | Result |
|---|---|---|
| V1 | `pnpm test --maxWorkers=2`, including pretest build | **508 files, 6,485 passed, 16 Mac skips**, exit 0; 932.32s command wall time (929.65s Vitest). |
| V2 | Root/runtime/Desktop typechecks, lint, five-locale extraction and strict compilation | Pass. 4,576 entries per locale; no missing translations. Lint retains prior unused-suppression warnings, zero errors. |
| V3 | Six affected test files via `pnpm exec vitest run ... --maxWorkers=2` | 169 passed. Before correction: 7 expected failures, 9 passes, 123 title-filter skips. Before full selection did not include the later direct-reset and diagnostic tests. |
| V4 | Built production Hono before/after probes | Missing CSS refused with previous package retained; unreadable selected input returns 409 with exact rows retained; three successful reflowable runs preserve fixed-tree current/witnesses at 2. Zero application provider calls. JSON/log records in V/results and V/logs. |
| V5 | Both whole-contract reviews at 7b9e0d29 | Codex 493 distinct tests after 4 sandbox-listen failures were resolved; last preservation command has a complete passing footer but raw exit retrieval was lost during compaction. Claude 700 tests/47 files, 16 platform skips; static checks and five independent probes. Each has its own derived 26/18 matrix. |
| V6 | Bounded correction rechecks | Codex FINAL: three independent probe families pass, including 4 missing CSS cases, real CSS/browser/cache/deletion/rebuild, direct input/reset retention, 12 repeated absent/SQL-null/JSON-null publications and necessary switches. Claude FINAL: 58 focused tests (57 in 5 files plus 1 selected HTTP regression, 67 unrelated title-filter skips), real HTTP refusal/no-op control and repeated/actual-switch probes pass. Both bounded rechecks found no new concrete defect; source checks also confirm the diagnostic and migration note. |
| V7 | Standard Docker `app` build and actual API/nginx render/export/restart | Retry exit 0, 143.43s; image `sha256:889a9e3301f9ea15d816b66c7c9eae241867de076e395371ab5e51116c136fb3`. Four books, 320 ZIP members byte-identical across restart, 104 original media unchanged, 0 additional provider calls; both layouts/part scopes and corrupt Library isolation pass. |
| V8 | `pnpm --filter @adt/desktop build:unpack --publish never --config.directories.output=<V>/platform/desktop-final-review-unsigned`; bundled API/resources under Node | Build exit 0, 16.42s. Bundle/WASM/resources match; four books, 320 ZIP members/104 media retained across restart, 0 additional provider calls. This is not Electron GUI or hardened-launch certification. |
| V9 | Actual Docker/Desktop Webpub and SCORM archives | Eight archives/584 members; manifest/href/history checks and 0 additional provider calls pass. Not external LMS/reader certification. |
| V10 | Linux current source/dist overlay on verified dependency image | 98 tests/8 files pass, including process paths skipped on Mac. Package manifests/lock verified; not a standard app build substitute. |
| V11 | Packaged actual old-writer first-open/delete/reopen | Both Docker and unsigned Desktop bundle pass exact content/media/proof comparisons with actual retained old storage runtime. Identity continuity does not undo intentionally deleted media or prove later old-only born/deleted records. |
| V12 | Git/owner custody and dependencies | Prerequisite ancestor, no new manifest/lock dependency changes, owner draft SHA256 `ee0f3e2c78365841c337aaca7efcd3d9edc83940bd01780af7c84e278aba2861` unchanged; only owner draft/tmp remain untracked after documentation commit. GitHub unchanged. |

Claude’s first bounded layout-switch probe used duplicate top-level YAML keys and returned 500 from config parsing. The corrected disposable probe rewrote the config and passed; both attempts remain in its ledger. This is a harness failure, not a product pass or an omitted failure. Its stylesheet confirmation is source/unit evidence; Codex independently exercised the public package/status/download and browser boundary. Queued rejection is source-traced with existing queue regressions; the new independent probes exercise immediate HTTP and direct runner/reset paths.

The first current Docker build failed during Debian signature validation with the Docker VM at 100%/zero free space. The authorized unused-build-cache cleanup reclaimed 14.49 GB, leaving 7.8 GB available; no images, existing containers or volumes were pruned. The failed build and before/after space records remain in V/platform. The unchanged standard build retry is recorded separately; signature verification was not disabled.

The real browser four recovery journeys and four fresh CLI/DAG runs remain attributed to 00b4a5c2 (N3/N12), while prior legacy/source and performance work retain their recorded heads. Current regression reruns and packaged checks do not silently relabel that historical interactive evidence.

## All 26 original criteria mapped to authorized behavior

Each status evaluates the authorized revised behavior, not superseded mode gates. Historical N references retain their exact head; V references are this correction's evidence. Original wording/mapping remains unchanged.

| Original criterion | Disposition → revised criterion | Evidence/status |
|---|---|---|
| AC-1: Dynamic to By Page invalidates Sectioning and every downstream step. | Revised → RAC14 | Passed — informational preference, V1/N3. |
| AC-2: By Page to Dynamic invalidates the same dependency closure. | Revised → RAC14 | Passed — reverse/inherited preference, V1. |
| AC-3: Extract completion and extracted data remain unchanged. | Retained → RAC14/18 | Passed — Extract/no-op and original assets, V1/N3/N7/N8. |
| AC-4: Every existing content version and referenced media byte survives a mode change. | Retained → RAC7/14/18 | Passed — version/asset comparisons for preference/reset/recovery, V1/N3/N4. |
| AC-5: Saving an unchanged effective mode causes no invalidation. | Retained → RAC14 | Passed — no-op effective preference, V1. |
| AC-6: An unrelated config edit causes no mode invalidation. | Retained → RAC14/18 | Passed — adjacent config/cosmetic save preservation, V1. |
| AC-7: A mode transition during active/conflicting work returns 409 with no mutation. | Shared guard retained → RAC15 | Passed — 409 before mutation, V1/N6. |
| AC-8: Studio confirms a transition when retained or completed downstream output exists. | Revised → RAC6/14 | Passed — separate named/default-off regeneration consent, V1/N3. |
| AC-9: Cancel leaves configuration unchanged and sends no mutation request. | Retained → RAC6/8 | Passed — Cancel without mutation, V1/N3. |
| AC-10: A failed update restores/refetches the persisted selection and surfaces the error. | Retained → RAC14/18 | Passed — failed/stale response and retained drafts, V1. |
| AC-11: Successful transitions refresh config, debug config, step and relevant page/stage state. | Revised → RAC-12/13/14 | Passed — consistent coverage/informational status, V1/N3. |
| AC-12: By Page preflight rejects a missing latest Sectioning result. | Superseded → RAC4 | Passed — per-page isolation and authorized verified-recovery boundary, V1/N3/N4. |
| AC-13: By Page preflight rejects zero sections. | Superseded → RAC2/12 | Passed — valid empty edit and honest missing coverage, V1. |
| AC-14: By Page preflight rejects multiple sections. | Superseded → RAC2 | Passed — manual multi-section By Page rendering, V1/N3. |
| AC-15: Any preflight failure preserves all rendering versions and starts no rendering call. | Revised → RAC9/10 | Passed — immediate successful-page publication and failed-page retention, V1. |
| AC-16: Exactly one valid section per source page permits Storyboard subject to other prerequisites. | Retained and broadened → RAC1/2 | Passed — generation-only count validation/saved-tree rendering, V1/N3. |
| AC-17: Dynamic mode continues to accept multiple sections. | Retained → RAC2 | Passed — Dynamic multiple saved sections, V1. |
| AC-18: Historical/imported inconsistencies are caught without an observed config transition. | Superseded → RAC3/13 | Passed — usable legacy access/owner qualification, V1/N5/N13; first-open capture and bounded older-writer compatibility N14/N15/N18. |
| AC-19: API, queued, targeted and DAG/CLI paths enforce the same rule, including fixed layout. | Revised with explicit CLI limit → RAC4/17 | Passed — immediate/queued/targeted/combined/DAG regressions V1, actual fresh CLI N12; recovery workflow N3; expanded resume excluded. |
| AC-20: All new UI copy is translated in the five supported locales. | Expanded → RAC16 | Passed — typed HTTP/SSE errors and all five catalogs, V1/V2/V6/N2/N4. |
| AC-21: The implementation adds no dependencies. | Retained → RAC17 | Passed — empty manifest/lock diff, V12/N11. |
| AC-22: Effective override removal/default resolution is correct; invalid modes change nothing. | Retained → RAC14 | Passed — resolver/removal/default/invalid mode controls, V1. |
| AC-23: Injected file/DB failures and restart at each journal boundary never expose new mode with old current status. | Revised → RAC7/15 | Passed — real-process transaction/recovery evidence, V1/N4/N6. |
| AC-24: Admission races and post-preflight edits cannot publish output based on obsolete configuration or section versions. | Retained → RAC6/10/15 | Passed — consent/input/publication revalidation, V1/N3/N4/N6. |
| AC-25: Errors contain the full failure count and at most 20 displayed page identities, including malformed/null results. | Revised → RAC4/16 | Passed — bounded/full-count malformed/null diagnostics, V1/N2. |
| AC-26: Invalid cached multi-section responses follow #692's eviction/retry behavior; valid cache reuse remains possible. | Retained → RAC1 | Passed — actual stub transport/cache validation and retry counts, V1. |

## All 18 revised criteria

| Criterion | Status | Evidence/qualification |
|---|---|---|
| RAC-1 generation/cache | Passed | V1 `page-sectioning.test.ts`: invalid cached/live count retries and valid cache reuse, actual stub transport boundary. |
| RAC-2 saved-tree editing | Passed | V1/N3; By Page manual additions/split/clone/merge/delete remain renderable; unrelated target has no count gate; fixed layout retains its positioned-input semantics. |
| RAC-3 legacy lifecycle access | Passed with existing owner qualification | V1/N5/N13; usable older content needs no initialization run. Under the owner amendment, first open captures readable previously untracked identity history once; later inspection does not silently checkpoint old-writer additions or changed tracked incarnations. N14/N15/N18 verify scoped destructive older-writer compatibility. |
| RAC-4 missing/unreadable input | Passed under authorized recovery boundary | V1/N3/N4/N10; per-page Storyboard isolation, early zero-call allocation refusal where hidden historical IDs cannot be proven, explicit verified repair then successful unrelated work. Unwitnessed irrecoverable history is the exact documented qualification, not an invented bypass. |
| RAC-5 missing-only Sectioning | Passed under same boundary | V1; existing AI/manual/unknown/null records retained, actual missing work selected, unaffected versions/assets compared. Damaged reservation history fails before reset/provider work. |
| RAC-6 explicit consent | Passed | V1/N3/N4: default-off affected IDs/versions, stale/cross-book/source/config/rendering rejection, queued revalidation, Cancel unchanged. |
| RAC-7 scoped reset and recovery | Passed | V1/N3/N4/N6: atomic versioned deactivation, retained authored source/assets on failed generation, truthful restart, exact-byte recovery audit/receipt. |
| RAC-8 mode/reset/edit/Storyboard | Passed under authorized recovery boundary | N3 four whole/part × fixed/reflowable journeys and V1 both directions/structural cases. Unverified history is refused, not silently skipped or overwritten. |
| RAC-9 immediate successful-page publication | Passed | V1 real storage/public API and Studio availability regressions; page HTML/tree transaction. Earlier slow-page browser evidence remains historical, not rerun by N3. |
| RAC-10 failure/Skip/cancellation | Passed | V1; already-published pages and failed same-layout previous output retained; stale publication refused. |
| RAC-11 actual layout switch | Passed in current regressions | V1 active-window all-success publication and targeted/partial/failure controls; N7/N8 both-layout packaged runs. Earlier actual switch browser journeys are historical. |
| RAC-12 honest coverage/package | Passed | V1/V3/V4/V6/V7/V9; partial section patch/reset history cannot certify complete; real members/intrinsic resources/cache deletion/refusal preserve prior bundle. Not universal CSS/reader conformance. |
| RAC-13 consistent accessible output | Passed with inherited owner qualification | V1/V4/V6/V7/V8; usable retained output, Library corrupt-book isolation, preview/export and warning/missing-work projection. Unverifiable owners stay omitted with disclosure, raw/history/assets retained. |
| RAC-14 informational preferences | Passed | V1/N3; inheritance/removal/no-op/adjacent config/cosmetic saves preserve appropriate content freshness, attempts and Extract. |
| RAC-15 shared coordination | Passed | V1/N4/N6; all-reader shared admission, queue/publication/version checks, real process death and journal/reset recovery; no anonymous-lock timeout deletion. Older noncooperating concurrent runtimes remain outside the documented coordination guarantee. |
| RAC-16 localized UI/errors | Passed | V1/V2/V6; 4,576 entries/five locales, typed HTTP/SSE/refusal parameters, RC-1 loss cases localized. The inherited exact D6 exception is not broadened. |
| RAC-17 supported CLI and scope | Passed | V1/N11/N12; fresh CLI/DAG and safe existing-book refusal; no B2, automatic cross-page merge, broader CLI resume, new dependency or separate freshness/lock authority. |
| RAC-18 inherited preservation/compatibility | Passed within amended compatibility contract | Authored-unit, baseVersion/draft, restore, identity/audio/TOC consent, NULL/current reads, cosmetic saves, fixed windows/cache/provider accounting pass N13 plus historical N3/N4/N5 and refreshed N16/N17. F-2 has actual old-runtime before/after, independent negative/positive controls and packaged first-open/restart evidence N14/N15/N18. No guarantee for later unobserved old-only history, intentional media undo or noncooperating concurrent old writers. |

V3/V4/V6 specifically strengthen RAC4/6/7/9–13/16/18 for this round's counterexamples. V1 reruns the broader current regressions, and V7–V11 refresh package/process/compatibility boundaries. The recovery H1–H9 and product-review Critical A/R1–R6 maps in the previous acceptance record remain unchanged; this round closes the additional R1 completeness and pre-reset/publication counterexamples rather than silently waiving them.

## Exact exclusions and unresolved limits

- B2 and automatic cross-page merge remain excluded by [SPEC-0003's authorized amendment](../specs/SPEC-0003-sectioning-modes.md#authorized-product-amendment-review-pending). Expanded existing-book CLI resume remains SPEC-0010 scope under RAC17; no doctor/resume was added.
- SPEC-0002 D1–D6 remain exactly [owner comment 6137679220](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220): same-page net-clean draft after Revert; quiz Delete during unresolved Save conflict; empty protected TOC offered/skipped Run; unchanged AI-edit Sectioning versions; stale Save banner after Discard; exact untranslated “Adjacent page no longer exists.” None waives these new fixes.
- SPEC-0001 [Note 7 ratification](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170) and [mandatory follow-up](https://github.com/unicef/adt-studio/pull/879#issuecomment-6340376966) retain raw/history/assets while omitting unverifiable/contradictory rendered owners with disclosure. Missing authorship alone remains protected and usable.
- Global missing/contradictory or already-unwitnessed history remains unprovable under [the recovery contract](../specs/SPEC-0003-sectioning-modes.md). Initial capture is not a rolling backup, media undo, later old-only history reconstruction or concurrency guarantee for noncooperating older writers. The new diagnostic makes this existing boundary visible; it does not broaden exclusions.
- Hardened Electron launch/library validation and cross-origin SCORM `window.API` SecurityError remain **open platform findings**, not approved deferrals. See [SPEC-0002 platform audit](spec-0002-final-review-2026-11-02.md). Node-hosted bundle and archive checks do not close either GUI/runtime problem.
- No signed/notarized or all-OS GUI release, external LMS/reader field certification, private partner-book acceptance, live paid-provider quality, low-end-device budget or hosted exact-head CI is claimed. Fresh inspection 325.45 MiB peak and first-open 275.34 MiB peak are separate operations; the earlier warm 34 MiB delta is not a peak ceiling. Formal SPEC-0003/ADR 025 approval remains human work.

Final confidence is high for final human review of the exercised amended B1 behavior. The two independent whole-contract reviews found useful counterexamples; root reproduced and corrected them, and both bounded rechecks now confirm the fixes without new concrete defects. Formal approval and the named platform/release limitations remain separate. No pending owner decision or authorized local implementation correction remains. No further whole-contract loop or automatic heartbeat is scheduled. The previous follow-up was deleted; this chat remains available.
