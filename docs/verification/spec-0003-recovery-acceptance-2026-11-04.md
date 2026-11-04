# SPEC-0003 — local recovery acceptance checkpoint, 2026-11-04

**F-2 follow-up in progress:** after the checkpoint below, the owner replied
"use your best judgement here" to the two-option compatibility question. Root
selected automatic one-time capture of readable, previously untracked legacy
history. The spec/ADR now record that amendment; repair, regeneration and later
checkpoints remain explicit. Four before regressions failed; six new and 25
adjacent tests now pass. Actual retained older-runtime deletion/clear reproduces
the original failure in eight cases and passes all eight after the correction,
including image-file disposition and retained audio/identity reservations.
Evidence: `.local-docs/spec0003-recovery-f2-20261104/`. Full-suite refresh and
bounded independent recheck are pending; the earlier runtime results below are
not relabeled as tests of the new source.

**Not an unqualified completion or final-acceptance recommendation.** The tested
runtime is `00b4a5c2705f2be1d2c7a599e90fe3192ff0ffe7`, based on
`4b9e40cc185cdbceb3ef248248e440c08f25fa82`. The main corrections and bounded
rechecks pass. Claude F-2 remains an unresolved compatibility/product decision,
not an authorized deferral. All work remains local; no GitHub state was changed.
The spec remains in review and ADR 025 proposed. Evidence-only commits after this
runtime do not imply a new runtime/platform run.

`E` is the main repository's `.local-docs/spec0003-recovery-remediation-20261103/`;
`Q` is `.local-docs/spec0003-recovery-recheck-20261103-codex/`. These private probes
used disposable books, stripped provider credentials and stubbed transport. The
owner's draft SHA256 remains `ee0f3e2c78365841c337aaca7efcd3d9edc83940bd01780af7c84e278aba2861`;
the untracked draft and `tmp/` were not edited or committed. Workloads were
serialized under the existing shared acceptance claim, released after completion.

## Independent findings and disposition

Both requested whole-contract reviews are final at `bdbc9603`, with their own
requirement maps, original/revised matrices and commands:
`.local-docs/spec0003-recovery-review-codex-20261103/` and
`.local-docs/spec0003-recovery-review-claude-code-20261103/`.
The [feedback ledger](spec-0003-recovery-review-remediation.md) retains every
finding and before/after evidence. Corrections were committed as `401247f4`
(continuity, import, performance, route errors), `189cf83d` (intrinsic package
resources), and `00b4a5c2` (recovery request/audit schema guard).

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
- **F-2:** unresolved, detailed below. No SQL guard that deletes files before
  refusing the database operation remains in the correction.
- **F-3/F-4:** the authorized unverifiable-history refusal remains; a valid changed
  incarnation can be explicitly checkpointed but cannot use an older incarnation
  for repair. Earlier verified identities stay reserved. These are not claims of
  universal recovery or freshness acceptance.
- **F-5/H-1:** original route errors are typed and translated; retired imported
  identity reservations are covered by C-R2. RC-1 closes the adjacent missing-table
  error path. No finding is silently assigned to SPEC-0010.

These independent runs are distinct from root's results; overlapping test totals
are not summed into a larger coverage claim.

## Current-runtime evidence

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

N3 is the fresh browser scope. Earlier real-browser slow-page and actual-layout-
switch journeys remain explicitly historical in the round-four audit; current
N1 reruns their public/component regressions. No claim is made that both reviewers
independently reran every UI/platform flow or that development tests prove release
readiness. The fixture media hashes above cover image/audio; fresh-CLI PDF retention
is independently measured in N12, not counted as an extra platform PDF.

## Original AC-1–26 mapped to the authorized contract

Original wording is preserved below. “Passed” evaluates the mapped revised
contract, never an obsolete restriction. The full inherited compatibility promise
still has the separately identified F-2 decision; no broad downgrade guarantee is
inferred from these mode-specific criteria.

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
| AC-18: Historical/imported inconsistencies are caught without an observed config transition. | Superseded → RAC3/13 | Passed — usable legacy access/owner qualification, N1/N5; not F-2 old-writer certification. |
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
| RAC-3 legacy lifecycle access | Passed with existing owner qualification | N1/N5; usable older content needs no initialization run; inspect does not capture witnesses. This is a read/render/export result, not destructive old-writer certification. |
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
| RAC-18 inherited preservation/compatibility | Blocked for unqualified acceptance | New-runtime authored-unit, baseVersion/draft, restore, identity/audio/TOC consent, NULL/current reads, cosmetic saves, fixed windows/cache/provider accounting pass N1/N3/N4/N5/N7/N8. F-2's sequential older-build destructive-write compatibility decision is unresolved. A read-only compatibility pass cannot close it. |

The recovery map H1–H9 in [the recovery work record](spec-0003-history-recovery.md)
is exercised by N1/N3/N4/N6/N10. Its H6 compatibility dimension and the independent
review's REC-11 remain open for F-2; REC-9/12 do not authorize inventing proof for
lost/unwitnessed records. No failing old restriction was reclassified as acceptance
of the new product behavior. The nine product-review scenario groups are covered
by the current regressions and listed UI/platform scopes; pending compatibility
and release gates remain separate.

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
| Older-book / preview-export gates | No mode/lifecycle initialization gate; inherited ownership qualification preserved. N1/N5/N7/N8. F-2 separately unresolved. |
| Ordinary Sectioning | Missing-only policy deliberately refines SPEC-0002's ordinary eligible-AI replacement; explicit exact-version replacement still protects manual/unknown work. N1/N3. |
| Locking | Shared prerequisite reader/writer safeguards retained; unknown mutexes fail safely, no timeout deletion. N1/N6. |
| CLI scope | Fresh CLI/DAG retained; expanded existing-book resume explicitly belongs to SPEC-0010. N1/N11/N12. |
| Reset versus authored preservation | Confirmed reset and new semantic publication have distinct commit boundaries; failure preserves authored Sectioning, histories/assets and honest missing output. N1/N3/N6. |

## Remaining decisions, qualifications and verification limits

1. **F-2 is an unresolved contract decision, not a deferral.** After the new build
   first opens an unwitnessed legacy book, an older build can delete a page/clear
   extraction, leaving an unrepairable missing identity-history record that blocks
   later allocation. The old implementation deletes images before its SQL writes;
   a SQL refusal alone would cause partial filesystem loss. That attempted guard
   was removed. The pending owner choice is automatic capture of readable legacy
   history on first open (amending explicit checkpointing), or an explicit boundary
   excluding destructive old-build edits while retaining old reads/Preview/export.
   Neither is assumed. Either choice needs its exact amendment, real old-runtime
   asset/retirement verification and bounded independent recheck. Automatic first-
   open capture must not be advertised as protecting new records created and
   deleted entirely by an older runtime without a later checkpoint.
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

The exercised new-runtime B1 paths and recovery corrections have strong regression
and independent-boundary evidence. **The revised B1 contract is not yet presented
as fully complete or ready for unqualified final acceptance:** F-2 still needs the
owner's explicit decision and its verification, and the named platform findings
are not closed. SPEC-0010 must reuse these admission/identity/publication contracts;
it must not inherit an assumed F-2 answer or be used to defer this unresolved case.
