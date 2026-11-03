# SPEC-0003 B1 — round-three local acceptance

**Ready for official human review of the revised B1 contract. All confirmed findings
from both round-three reviews and the bounded independent rechecks are repaired.**
The frozen runtime/test candidate is `6d3d9810ab19309691fa75a431b64d7ba1d24d1c`. This record
supersedes the round-two readiness recommendation. It does not grant specification
or ADR approval, close an issue, certify a release, or authorize publication.
PR #884 was not changed. The owner's draft and `tmp/` remain untouched.

## Scope and source

The original reviewed candidate was `4a16cd1e27f741b37dab90ce7ce33406eb762d50`.
Its local prerequisite boundary remains develop
`4b9e40cc185cdbceb3ef248248e440c08f25fa82`, containing SPEC-0001 squash
`c153ba7d26c2323b67236c61297999424b169ac1` and SPEC-0002 merge
`f2e59a0d29b13f65641f26c4f898738770d1181a` (approved head `89a65f0677288be266ea448b231c1ca21dc30235`).
These are verified local graph identities, not a claim about today's remote tip.
No descendant implementation was merged into this branch. No dependency or lockfile
changed in this remediation.

The [amended specification](../specs/SPEC-0003-sectioning-modes.md), the
[original AC wording and authorized mapping](spec-0003-oct12-audit.md), and the
September/October reviews remain authoritative. By Page validates generation and
cache output, not saved section counts. Preference changes are informational;
ordinary Sectioning fills missing pages; explicit versioned consent deactivates
the affected Storyboard before replacement; ordinary Storyboard publishes page
pairs incrementally, reserving whole-window atomic publication for an actual
layout switch. This round repairs implementations of that contract; it does not
amend acceptance criteria to accommodate failures.

## Evidence register

Local evidence lives under the main repository's `.local-docs/`, not the nested
implementation checkout. `F` = `spec0003-round3-final-20261103`, `P` = `F/platform`,
`I` = `spec0003-round3-bounded-recheck-20261103`, `R` = `spec0003-round3-remediation-20261103`.
Original reports are `spec0003-round3-codex-20261103-121243/REPORT.md` and
`spec0003-round3-claude-code-20261103-121320/REPORT.md`. Their negative results and
the intermediate failed/interrupted runs are preserved. Test/runtime workloads
were serialized under the shared acceptance lock.

| Evidence | Command / observable result |
|---|---|
| E1 — whole branch | Passed: 501 files, 6,381 tests; 16 Linux-only cases skipped on macOS; 608.36 seconds for Vitest. `F/results/branch-checks-final.json`, `F/logs/final-*.log`. `pnpm test --maxWorkers=4` includes the root build. Root/runtime/Desktop typechecks, lint, Studio build, fresh extraction and strict compilation run separately. |
| E2 — public API and browser | 32 named scenarios have passing dispositions at the frozen head: `F/results/public-final-disposition.json`. Real private SQLite/filesystem, HTTP, Chromium, stubbed transport, stored histories, preview URLs and actual ZIPs. Initial aggregate was 31/32: fixed-mode probe polled idle before its asynchronous POST. Corrected probe waits for actual admission, then completion; the fresh fixture passes without Retry. Original trace and the first retry's task-owned orphan/EADDRINUSE failure remain. |
| E3 — process and CLI | `F/results/cli.json`: fresh two-page CLI/DAG exit 0, 14 stubbed transport calls; existing-book attempt exit 1, no further calls, source PDF unchanged. `original-reader-crash.json`: live reader preserves mutex inode and refuses competing recovery; SIGKILL writer recovers prior v1, then permits v2; ancient anonymous mutex remains BOOK_BUSY. `reset-recovery/` exercises committed/uncommitted reset boundaries in independent processes. |
| E4 — platforms | Passed: 67 Linux admission/recovery/doctor tests in five files; standard combined `Dockerfile --target app`; unsigned macOS arm64 unpacked Desktop build. Both actual packaged APIs rendered fixed/reflowable, isolated corrupt Library records, exported five books and restarted: 412 ZIP members identical, selected/history/preview state equal, 130 original media hashes unchanged per platform, zero new provider calls. Desktop execution used its actual API/WASM/resources under Node, not the Electron GUI. Commands and exits: `P/results/platform-driver.json`; individual Linux, image-build, runtime, export, resource and restart receipts beneath `P/results/`. |
| E5 — compatibility | Passed against independently rebuilt `ef31494dc2951b92222c473960fecee2d91f9544`; every retained baseline source blob verified before rebuild. `F/results/compatibility-reviewed.json`, `old-baseline-source-audit.json` and `compatibility-retention.json`. Current guarded saves → independent old API reads/preview/export → current reopen; selected authorship/IDs/history unchanged. This is read compatibility, not permission for old clients to edit or regenerate newer books. |
| E6 — independent recheck | Own requirement/probe map and adversarial source/runtime review in `I`. At `24fdaa82`: 382 selected tests and 24 additional real SQLite/filesystem/Hono checks pass. At frozen `6d3d9810`: 73 Studio tests plus four malformed HTTP cases pass, source/dist provenance verified. Source review is clean within the bounded change set; this is separate from root's whole-branch and platform results. Final receipt audit: `I/6d3d9810/receipt-audit.md` (23 retained-data cross-checks) and `final-gates-addendum.md` (independent comparison of 20 actual ZIPs, 130 media files per platform and the final report). No material evidence contradiction; qualified human-review readiness supported. |
| E7 — concrete performance and preservation | `F/results/status-reads.json`: first route read 290,412 packaged bytes, next two unchanged reads 0; deletion, restoration, directory replacement and selected-version changes invalidate proof; warm repaired read returns to 0. Real Hono `app.request` route with filesystem counters, not a loopback latency or low-end benchmark; warm reads still prepare 112 SQL statements. Representative Raven PDF (5,704,567 bytes) and extracted image hashes compare unchanged; browser authored/cosmetic/timing fixtures compare catalog IDs, quizzes, translations, audio and histories. |

The five catalogs contain 4,545 messages, with zero missing translations and
unchanged bytes after extraction. Actual Chromium requests exercise the new
malformed-request code in all five locales through the browser-loaded API client
(not a clicked invalid-save form). The window test proves the public failed task
plus the browser-loaded French mapper; its aria-live observations do not prove
a visible task toast. Other HTTP/task error paths are separately covered. Lint
has zero errors and eight suppression warnings also recorded at the prior
checkpoint; no warning is counted as a test failure or silently removed. The planned aggregate
`lint:invariants` command does not exist; applicable registered invariants are
covered through test, typecheck and lint as described in [INVARIANTS](../INVARIANTS.md).

Exact repository commands (all exit 0): `pnpm test --maxWorkers=4`, `pnpm typecheck`,
`pnpm --filter @adt/runtime typecheck`, `pnpm --filter @adt/desktop typecheck`,
`pnpm lint`, `pnpm --filter @adt/studio build`, `pnpm --filter @adt/studio extract`,
and `pnpm --filter @adt/studio exec lingui compile --strict`. The test pre-step
ran `pnpm build`. `DEVELOPER_DIR=/Library/Developer/CommandLineTools` was set.
The complete platform command arguments, cwd and image/package provenance are
retained in the E4 driver and individual receipts. The final source audit matched
all 2,495 tracked acceptance-clone blobs to the frozen head, and the owner’s
untracked draft SHA-256 remained unchanged (`F/results/final-source-provenance.json`).

## Review findings and repairs

The [remediation ledger](spec-0003-round3-remediation.md) records each finding,
before-fix reproduction, shared boundary and regression. None of these findings
is deferred.

| Finding | Result and verification |
|---|---|
| Codex F1 P1: escaping package filenames | Safe single-member identities checked on writes and at package sink. Public rejection preserves previous export and sibling canary bytes; legacy unsafe records fail safely. E1/E2/E6. |
| F2 P1: obsolete reset consent after prompt change | Consent binds resolved selected prompt content/version/includes and effective generation inputs; execution/publication revalidate. Stale immediate/queued decisions make no reset/call; fresh consent works. In-flight output withheld after input changes. E1/E2/E6. |
| F3 P1: dirty HTML reactivates reset output | Rendering version is separate from semantic version on standalone/combined/AI-edit writers, at admission, dequeue and publication. Studio keeps the original draft snapshot and rejects stale saves without losing drafts. E1/E2/E6. |
| F4 P1: legacy/empty output misclassifies layout switch | Shared usable HTML/tree resolver determines actual published layout. Supported legacy fixed rendering and first empty output work; mixed and targeted layout switches refuse safely. E1/E2/E6. |
| F5 P1: duplicate public owners | Shared book-wide identities reject new section/quiz collisions, path and normalized-member aliases. Ambiguous imported owners are omitted/disclosed without deleting data. Legacy sparse/null quiz IDs use the same resolver as reading order. E1/E2/E6. |
| F6 P1: broken build replaces usable export | Shared required-member validation occurs in staging before swap. Missing stylesheet fails the task and retains previous package bytes; repaired build succeeds. E1/E2/E6. |
| F7 P1: missing media still claims complete | Build/cache/download validate referenced media, srcset candidates, format/locale/runtime dependencies and contained members. Missing image refuses cache/download; rebuild restores exact bytes. E1/E2/E6. |
| F8 P2: every idle status poll rereads package | Bounded verification proof shared by status/readers; file identity/version/directory changes invalidate. Three warm reads measured at zero package bytes, with negative controls. E7. |
| F9 P2: part-window task error untranslated | Stable typed code and bounded page parameters flow through common mapper and all five catalogs; actual French task path verified. E1/E2. |
| F10 P1: late subscriber misses committed page | SSE ready event after listener registration catches up status and availability. Paired early/late connection scenarios each open the committed first page’s actual saved iframe before page two releases, without reload. E1/E2. |
| Claude High: corrupt DB hides the Library | Narrow SQLite corruption isolation produces unavailable card while healthy neighbor remains accessible. Exact truncated bytes retained; restore repairs listing. Real API/browser and packaged runtime probes. E1/E2/E4/E6. |
| Independent IR3-1–4 and follow-up null ID | Srcset candidate parsing, stale alternate AI-edit input, malformed independent quiz input, readable sparse/null quiz identity fixed and independently rechecked. Raw histories preserved; shared resolver reused. E1/E2/E6. |
| Final R4 addition | Malformed rendering/Storyboard/AI edit requests return accurate localizable HTTP 400; stale versions remain 409. Four before-fix failures now pass; all-locale HTTP→Studio checks pass. E1/E2/E6. |
| Final confirmation liveness | A canonical background fetch cannot satisfy/abort an explicit fresh consent read. Unique transient keys retain cancellation and cross-book/ABA checks; prefix cancellation still fails closed. Mounted overlap regression and actual ordinary/reset browser flows pass. E1/E2/E6. |

F8's separate source observation remains a **performance verification limit**:
each successful page publication rechecks the active-window signature, producing
quadratic page lookups over a full run. This protects stale-publication safety.
No low-end or large-book timing budget was established or failed by either
review. This report does not claim that cost was eliminated or invent an approved
performance deferral; reducing it must preserve the shared concurrency contract.

## Original AC-1–26 mapping

| Original AC | Authorized mapping | Current result |
|---|---|---|
| AC-1: Dynamic to By Page invalidates Sectioning and every downstream step. | Revised → RAC-14 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-2: By Page to Dynamic invalidates the same dependency closure. | Revised → RAC-14 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-3: Extract completion and extracted data remain unchanged. | Retained → RAC-14,18 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-4: Every existing content version and referenced media byte survives a mode change. | Retained → RAC-7,14,18 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-5: Saving an unchanged effective mode causes no invalidation. | Retained → RAC-14 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-6: An unrelated config edit causes no mode invalidation. | Retained → RAC-14,18 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-7: A mode transition during active/conflicting work returns 409 with no mutation. | Retained with shared guard → RAC-15 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-8: Studio confirms a transition when retained or completed downstream output exists. | Revised → RAC-6,14 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-9: Cancel leaves configuration unchanged and sends no mutation request. | Retained → RAC-6,8 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-10: A failed update restores/refetches the persisted selection and surfaces the error. | Retained → RAC-14,18 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-11: Successful transitions refresh config, debug config, step and relevant page/stage state. | Revised → RAC-12,13,14 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-12: By Page preflight rejects a missing latest Sectioning result. | Superseded → RAC-4 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-13: By Page preflight rejects zero sections. | Superseded → RAC-2,12 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-14: By Page preflight rejects multiple sections. | Superseded → RAC-2 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-15: Any preflight failure preserves all rendering versions and starts no rendering call. | Revised → RAC-9,10 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-16: Exactly one valid section per source page permits Storyboard subject to other prerequisites. | Retained and broadened → RAC-1,2 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-17: Dynamic mode continues to accept multiple sections. | Retained → RAC-2 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-18: Historical/imported inconsistencies are caught without an observed config transition. | Superseded → RAC-3,13 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-19: API, queued, targeted and DAG/CLI paths enforce the same rule, including fixed layout. | Revised, CLI scope deferred → RAC-4,17 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-20: All new UI copy is translated in the five supported locales. | Expanded → RAC-16 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-21: The implementation adds no dependencies. | Retained → RAC-17 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-22: Effective override removal/default resolution is correct; invalid modes change nothing. | Retained → RAC-14 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-23: Injected file/DB failures and restart at each journal boundary never expose new mode with old current status. | Revised → RAC-7,15 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-24: Admission races and post-preflight edits cannot publish output based on obsolete configuration or section versions. | Retained → RAC-6,10,15 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-25: Errors contain the full failure count and at most 20 displayed page identities, including malformed/null results. | Revised → RAC-4,16 | Passed for the mapped revised contract; see the referenced RAC evidence below |
| AC-26: Invalid cached multi-section responses follow #692's eviction/retry behavior; valid cache reuse remains possible. | Retained → RAC-1 | Passed for the mapped revised contract; see the referenced RAC evidence below |

## Revised acceptance matrix

All statuses refer to the authorized revised B1 behavior and the verification
scope stated here. A superseded old rejection is not a pass for the new behavior.

| Criterion | Status and current evidence |
|---|---|
| RAC-1 generation/cache | Passed — real LLM/cache transport regression; public invalid-first sequence 2/1/0 calls (feedback retry input differs), valid reuse. E1/E2. |
| RAC-2 editable saved trees | Passed — both modes, split/add/clone/merge/delete, unrelated targeted rendering; legacy/modern fixed pairs. E1/E2. |
| RAC-3 older lifecycle | Passed — complete/partial/loading older-book routes, retained bookmarks, no initialization or provider read calls; qualified ownership preserved. E1/E2/E5. |
| RAC-4 per-page missing input | Passed — fixed/reflowable missing, malformed/null input and part windows; healthy pages publish; real PDF missing classification retains output until explicit repair. E1/E2. |
| RAC-5 ordinary Sectioning | Passed — saved AI/manual/unknown/empty/unreadable units retained, missing units filled; exact unaffected versions and assets. E1/E2. |
| RAC-6 explicit consent | Passed — default-off named exact-version UI; source/config/selected-prompt and cross-book changes reject at admission/queue/publication; Cancel makes no mutation. E1/E2/E6. |
| RAC-7 reset boundary | Passed — version-preserving paired deactivation, failure retains authored semantic content/history/assets; stale dirty HTML cannot resurrect it; independent process deaths and next action. E1/E2/E3. |
| RAC-8 both mode/edit workflows | Passed — two mode directions, explicit reset, structural operations and successful Storyboard; historical HTML never adopted by index. Fixed probe waits actual POST. E1/E2. |
| RAC-9 immediate publication | Passed — fresh/rerun fixed and reflowable pair publication; paired early/late browser connections, real clickable page while second worker held. E1/E2. |
| RAC-10 partial failure safety | Passed — later failure/Skip/cancel retains successful pages and same-layout prior failed page; stale render inputs withheld. E1/E2. |
| RAC-11 actual layout switch | Passed — whole-window success/failure and targeted refusal; legacy fixed and empty first-run classification corrected; reverse/part-window cases in suite. E1/E2. |
| RAC-12 honest coverage | Passed — partial section patches/reset history/duplicate owners cannot certify complete; actual manifest/member/cache checks. E1/E2/E4. |
| RAC-13 readers/outputs | Passed within legacy-owner qualification — Library, sidebar/stage, preview, cache and ZIP agree; required files and locales, healthy neighbor isolation, corrupt-book warning/repair. E1/E2/E4/E5. |
| RAC-14 informational preference | Passed — inheritance/removal/no-op/adjacent saves; mode preference alone preserves freshness, Extract and bytes; cosmetic saves retain content dependencies/completed attempts. E1/E2. |
| RAC-15 concurrency/recovery | Passed — immediate/queue/targeted guards, journal/reset/package restart, coordinated reader admission, live/anonymous mutex protection; Linux controls separately. E1/E3/E4. |
| RAC-16 locales | Passed — 4,545 entries, five actual locales, typed HTTP/task/SSE mapping and bounded parameters; obsolete restrictions removed. E1/E2/E6. |
| RAC-17 supported CLI/scope | Passed for fresh CLI/DAG and safe existing-book refusal; expansion explicitly deferred. No B2, automatic merge, dependency or competing lock/freshness system. E1/E3. |
| RAC-18 inherited guarantees | Passed within inherited explicit qualifications — authorship/lineage/review separation, translation/quiz/TOC protection, versioned drafts/restore/current NULLs, stable IDs/audio, cosmetic freshness, fixed windows and provider/cache counts. E1/E2/E4/E5. |

## Consolidated review and prerequisite overlap

| Review item | Final behavior / evidence |
|---|---|
| Critical A | Saved manual multi-section By Page renders; unrelated targeted page not blocked. RAC-1/2/8. |
| R1 | Partial patch or partial old package cannot claim complete. RAC-12/13; F5–7. |
| R2 | Lifecycle initialization does not authorize historical output after reset. RAC-3/7/12; F3. |
| R3 | Inherited/external preference is consistently informational and leaves usable content available. RAC-14. |
| R4 | Common localized errors/parameters, including new malformed edit and part-window producers. RAC-16. |
| R5 | First page available while next runs, including late event connection; partial failures retain work. RAC-9/10; F10. |
| R6 | Regeneration→structural edit succeeds against new semantic tree, with bounds checks and historical owners preserved. RAC-7/8. |
| Older books / preview/export | No lifecycle or mode-only gates; conditional legacy owner warning and actual missing-work handling remain. RAC-3/13. |
| Ordinary Sectioning vs SPEC-0002 | Deliberate missing-only refinement retains even eligible AI Sectioning until explicit scoped consent. No silent weakening of translation, individual quiz or whole-TOC protection. RAC-5/6/18. |
| Locking / CLI | Shared all-reader admission and owned journal recovery retained; no independent SPEC-0003 lock. Expanded existing-book CLI resume stays refused here. RAC-15/17. |
| Reset vs authored preservation | Explicit consent commits scoped Storyboard deactivation before generation; authored semantic source survives failed/cancelled replacement, historical HTML stays recoverable but inactive. Ordinary Storyboard and manual edits do not acquire that reset authority. RAC-7/18. |

All nine October-review scenario groups have current coverage: (1) generation/cache,
(2) editable tree/targeted rendering, (3) slow-page visibility, (4) failure/Skip/cancel
and switch atomicity, (5) both mode/reset/edit flows, (6) legacy/input/Library access,
(7) truthful partial coverage/package, (8) gap-only selection/fresh consent, and
(9) histories/restart/localized errors. E1–E7 identify the actual public tests and
their limits, rather than inferring acceptance from the old green report.

## Explicit exclusions, qualifications and remaining verification

- **B1 scope only:** B2 modes, automatic cross-page merge and expanded existing-book
  CLI resume are expressly excluded by the [spec](../specs/SPEC-0003-sectioning-modes.md)
  and [September](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5368403884)/[October](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5486273946)
  decisions. Existing-book extraction/repair/resume belongs to SPEC-0010; it must
  preserve this branch's shared reader/writer and publication contracts.
- **Inherited D1–D6 only:** the [owner's decision](https://github.com/unicef/adt-studio/pull/880#issuecomment-6137679220)
  and [approval](https://github.com/unicef/adt-studio/pull/880#pullrequestreview-5731520149)
  explicitly cover clean same-page Revert drafts (#1039), delete-quiz with unresolved
  Save conflict (#1040), saved-empty TOC Run skip (#1041), identical AI-edit versions
  (#1042), stale Save-error after Discard (#1043), and the adjacent-page phrase
  (#1044). Optional #1045–1048 are not waivers; none excuses this round's findings.
- **Legacy qualification:** SPEC-0001 [Note 6](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5551228504)
  and [Note 7](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170)
  qualify unverifiable/contradictory ownership: raw data/history/assets remain,
  affected output is omitted with a warning. Missing authorship alone is not an
  omission reason. Fixed rerender requires current valid geometry and explicit
  keep/prune decisions; safe old output remains readable, missing inputs require
  restoration or SPEC-0010 repair. Anonymous/uncoordinated mutexes fail closed;
  elapsed time never authorizes deletion.
- **Compatibility change, implemented:** old clients omitting the selected
  rendering-version guard receive a typed HTTP 400. Current Studio sends the
  viewed guard and keeps conflicting drafts. Old clients may read supported
  saved content; their edits/regeneration are not certified.
- **Known platform findings, not accepted deferrals:** the default ad-hoc hardened
  macOS launch and cross-origin SCORM findings in
  [the SPEC-0002 platform audit](spec-0002-final-review-2026-11-02.md) are not closed
  by bundled API-under-Node checks. No full Electron GUI, signed/notarized installer,
  full Windows/Linux suite, external LMS, paid-provider quality or low-end
  performance certification is claimed. The standard combined app image passed; a separate CI API image was not rebuilt in this round. The selected Linux controls passed; a complete Linux suite was not run.
- **Governance / remote checks not run:** this is local-only by instruction; no
  exact-head hosted CI or published head exists for these commits. PR title/body,
  base, comments, reviewers and source issue were unchanged. Human approval of
  SPEC-0003, ADR 025 and the proposed #708 correction remains pending.

The revised B1 contract is implemented and locally verified within its documented scope and inherited qualifications; this is not merely the earlier rejection-only safe slice. No confirmed in-scope defect from either round-three report or the bounded rechecks remains open. The explicit exclusions and platform limits above remain visible. SPEC-0010 can integrate this **local** foundation with fresh source receipts, exact scope consent, shared all-reader admission and ownership-aware publication; it must inspect its actual ancestor rather than assume the unchanged remote #884 contains these commits.
