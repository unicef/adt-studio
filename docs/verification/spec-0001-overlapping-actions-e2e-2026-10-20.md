# SPEC-0001 overlapping-action end-to-end round — 20 October 2026

This round found additional preservation defects in restore and overlapping
speech/source saves. They are repaired, independently reviewed and checked through
the built UI and actual storage. **The tested repairs pass; this is not a claim
that the full original spec, historical population or release acceptance is
complete.** The accepted deferrals remain. Nothing was pushed or posted to GitHub.

## Revisions and scope

- Starting local HEAD: `4ebe6b46384ed7e245772ec0ffa029e58d532979`.
- Speech repair: `049527921378213437101ce698edf31de73ddf29`.
- Final production/test source: `ce13210e329719af9f96ce4fdae67281237f7ff4`.
- Final read-only PR #879 refresh: remote head
  `91886d5bf96183f59ec06ba0435fdc5386bbc173`, base develop, open,
  review required; unchanged 20 comments and eight reviews, last update
  `2026-10-16T20:16:26Z`.
- Develop baseline: `0efe1c2501a478049701fd221ab94fc97cdf50aa`.

The [previous adversarial round](spec-0001-adversarial-e2e-2026-10-20.md),
[feedback remediation](spec-0001-remediation-2026-10-20.md),
[final gate](spec-0001-final-gate-2026-10-20.md), and
[four worked examples](spec-0001-worked-examples-2026-10-18.md) retain their dated
evidence. Their earlier UI/export results are not counted as fresh executions.
This round repeats the entire branch's automated suite and adds new adversarial
journeys. Local planning and raw evidence remain outside Git.

## Edge classes and repairs

| Generalized case | Evidence and resulting behavior |
|---|---|
| Restore acknowledgment versus a newer draft | Built UI reproduced Easy Read restore erasing a draft typed while restore was pending. All ten shared picker sites in eight owners now hold their editing controls and mutation callbacks read-only through restore and refresh. Failed restore retains the old draft; successful explicit restore acknowledges it; editing then resumes. |
| Owner identity versus equal scope strings | Independent review reproduced an old restore clearing a new draft after A → B → A within one page. Per-owner identity tokens now distinguish those visits. Late history/restore success, error and completion cannot modify the new owner. Tests include narrower Storyboard section scope, portal controls and iframe callbacks. |
| Save acknowledgment versus successor text | Built UI reproduced speech Save closing an editor that contained text typed after submission. The editor now acknowledges only the submitted snapshot, retains a successor and uses its own response version/text baseline. Same-batch changes and a successor returning to the original displayed text are regression-tested. |
| Collection version versus independent entry edits | Real SQLite/Hono reproduction was 200/409/409 for two entries opened at the same version and retry. The API now permits the stale collection guard only when the exact historical target is still wholly unchanged and the source/exclusion receipt matches. It merges into current neighbors under existing admission and a transaction. A changed target still returns 409. |
| Namespace identity versus equal version numbers | Speech edit receipts bind the actual legacy/canonical locale namespace. Equal numeric versions across different chains cannot authorize a save. Existing history, unknown target/neighbor metadata and the original storage namespace are retained. Missing/malformed/duplicate evidence and future guards fail closed. |
| Source save/delete versus edits during acknowledgment | TOC, Quiz and Extract controls now remain disabled through persistence and refetch. Synchronous guards block duplicate/interleaved edits. Failure releases busy state and preserves retryable drafts; strict Save & leave rejects instead of navigating. Quiz deletion errors appear inside the active dialog. |

Spec narrative documents these decisions without changing numbered acceptance
criteria or approval status. No new locking or draft-persistence subsystem was
introduced. The historical speech merge is limited to an unchanged target; it
does not silently adopt an arbitrary later GET's version or certify freshness.
Competing stale authored source screens remain SPEC-0002 Decision 10.

Not every hypothesis was a defect: caption partial saves preserve failed drafts
in both completion orders, and decorative filtering preserves hidden drafts.
Successful entries can publish before another fails; the aggregate is not an
atomic all-entry transaction. A synchronous callback throw rejects navigation
and keeps registrations; later callbacks are not invoked in that case.

## Independent review

The speech implementer independently reviewed the separate restore/source repair,
reproduced the interim A → B → A bug, and reran its identical probe after the
token fix. The restore implementer independently reviewed the speech API/UI
repair and reran **27 tests in two files**, including real SQLite routes.

Final restore/source checks passed **20 tests in five files**, independently
repeated by the other reviewer. Four further owner suites passed **40 tests**.
Speech/API/OutputReview checks passed **51 tests in three files**. Four external
aggregate probes passed unchanged. These overlapping counts are not added to the
full-suite total. No remaining must-fix was identified in the bounded repaired
paths; neither reviewer claims exhaustive historical or whole-spec acceptance.

## Fresh real UI and persisted artifacts

Production-built Studio ran in Chrome against Hono, real SQLite and files in
three disposable historical-shaped book copies. A local harness delayed writes
and injected selected HTTP 409s; successful retries used production routes.
External transport was counted, with no provider credentials or calls.

| Journey | Fresh observed result |
|---|---|
| Easy Read restore failure and success | Input disabled while pending. Failed restore preserved the exact draft and unlocked retry. Successful restore completed; a subsequent new edit saved as v7. |
| Speech Save A, type B before response | B remained open after A succeeded; second save persisted B. Same-batch behavior additionally covered by component regression. |
| Two speech entries at one catalog version | One delayed save succeeded and one controlled failure retained only its draft. Retry with the original guard/payload succeeded for the unchanged target. Reload showed both exact texts; unrelated entries remained intact. |
| Two caption pages, one success and one failure | Save & leave stayed on the route. Only the failed textarea remained. Retry submitted only that page with the identical payload. Both completion orders were also tested at the real aggregate component boundary. |
| Caption hidden by Decorative | On/off retained the draft. Save & leave while hidden persisted it; unmarking revealed the exact text. |
| TOC save failure/retry | Pending save disabled the title input. Failure unlocked it and retained the title. Save & leave retried the same payload successfully and navigated. |
| Quiz save and deletion failure/retry | Save held inputs read-only, retained failed text and allowed retry. Failed deletion displayed an error inside the dialog; retry removed only the selected quiz. The survivor and deleted quiz's history remained. |
| Extract image selection failure/retry | Prune selection was held while saving, remained after failure, and persisted on retry/reload. Original filtering history remained. |
| API restart → reader → Preview | Exact saved Easy Read text appeared in the packaged reader and subsequently in the embedded Preview. Preview disclosed 59 attention items: 13 out of sync, one needs review, 45 warnings, zero missing. Restart left captured active entities, output status and file inventory unchanged. |

**186 persisted-artifact assertions passed.** They cover unchanged unaffected
entities; retained baseline versions; exact retry payloads; stable catalog IDs,
locations and unaffected strings; expected caption reconciliation; survivor and
deletion history; restart comparisons; and physical media preservation. The
three copies each retain the same **20 audio and six image files byte-for-byte**
(78 comparisons of 26 unique fixture assets, not 78 independent media cases).
All observed saves, retries, restore and read activity made **zero provider calls**.
The first artifact script incorrectly expected the derived text catalog to remain
unchanged after caption edits. Inspection showed only the two intended caption
strings and reconciliation timestamp changed; the final assertions verify that
exact delta rather than exempting the whole catalog from preservation checks.

### Fixture differences and trial qualifications

The books model real schema/storage behavior, stable ownership/IDs, old and new
entity versions, manual French/Easy Read content, per-language speech, retained
audio and images. The source-editor copy adds two historical TOC/quiz versions,
two quizzes, an image-filtering record and completed Extract step records so its
existing UI exposes image selection. Those seeded steps are not evidence that
Extract or providers ran. Tiny PNGs/tone audio do not validate customer layout,
model semantics, voice quality or all historical shapes. Cross-owner late
responses and A → B → A were controlled component tests, not a claimed real-router
book-switch reproduction.

Several earlier browser tabs stalled: the attempted TOC write never arrived at
the server, while API/proxy requests outside those tabs worked. A fresh localhost
document completed the final journeys. A first embedded Preview load was blank;
direct reader navigation succeeded, and returning to Preview subsequently
displayed the content and warnings. These initial stalls remain in raw evidence.
They are not counted as completed-save failures or clean first-load passes.
Source comparison confirms global/book EventSource connection topology and mount
sites are unchanged from develop. HTTP/1 connection pressure is a plausible
explanation, **not an established diagnosis or proven baseline reproduction**.
Multi-tab transport behavior remains qualified; no new connection subsystem was
added or claimed fixed here.

One initial caption fault-injection trial used the wrong route filter and both
writes succeeded. The corrected trial recorded one 200 and one 409 and is the
partial-failure evidence. An earlier TOC screenshot was captured while its request
was stalled; it is not evidence of post-acknowledgment loss. Red component/source
probes establish that repair's original failure instead.

## Checks on final production/test source

| Check | Result |
|---|---|
| `pnpm test`, including pretest build | **Passed: 357 files / 4,415 tests**, 218.34 seconds |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed |
| `pnpm lint` | Passed; zero errors, eight unused-disable warnings |
| `pnpm build`; final Studio production build | Passed |
| Lingui extraction and strict compile | Passed; 3,761 messages in each of five locales, zero missing. Existing strings reused; no catalog delta. |
| Focused foundational checks | Six files / 43 tests passed; included in the final full run |
| Independent repair review/probes | Passed as bounded above |
| Whitespace check | Passed |
| Dedicated invariant command | None exists; relevant invariant tests ran in the full suite |
| Fresh macOS arm64 unpacked Desktop build | Passed on first attempt; ad-hoc signature, notarization skipped |
| Newly packaged API smoke | Passed: two page inventories, 77 output rows, independent speech saves v7/v8, stale same-entry 409, eight other entries unchanged |
| Clean Docker `app` build | **Blocked**: Docker 29.8.0 VM reports 139.0G total, 135.5G used, zero available, 100%. Build not attempted; no pruning. |
| Full Electron-window UI, signed/notarized release, live-provider quality, hosted CI for local commits | **Not run** |

No production/test edits followed that final full suite; this report is a
documentation-only follow-up. Packaged API smoke is not an Electron-window test
or release certification.

## AC-to-evidence matrix

“Passed slice” means implemented behavior has automated and dated UI evidence.
“Blocked full contract” identifies a deferral or acceptance gate preventing an
unqualified full-spec claim. There is no known failed repair left in this round.

| AC | Status | Evidence and remaining boundary |
|---|---|---|
| 1 | Passed slice; blocked full optimization | Current cosmetic-save tests, earlier UI and fresh zero-call saves. No-op Save optimization deferred. |
| 2 | Passed slice | Current scoped/preservation tests and earlier changed-text example; fresh independent-entry and successor saves. |
| 3 | Passed slice | Current glossary/image-consumer suites and earlier example; fresh caption catalog reconciles only intended strings. |
| 4 | Passed slice; blocked legacy repair | Identity/ownership suites and earlier UI; fresh stable-ID/history comparisons. Positional, pruned-leaf and malformed-ID recovery deferred. |
| 5 | Passed slice | Canonical-input/context suites pass. Same media ID with different content remains an accepted limitation. |
| 6 | Passed slice; blocked classification | Warning/missing-input suites and earlier expansion UI. Systemic preparation classification deferred. |
| 7 | Passed slice; blocked historical acceptance | Fresh failed/overlapping save and restore UI, history and manual-text preservation. Original books/ownership repair pending. |
| 8 | Passed slice; blocked measurement | Actual-transport cache tests and earlier zero-call repeat UI. Large-book measurement/cache work deferred. |
| 9 | Passed slice; blocked broader guarantees | Publication/concurrency suites and fresh guarded speech merge. Uncertain writer recovery deferred; stale authored-source arbitration belongs to SPEC-0002. |
| 10 | Passed slice; blocked publication ordering | Real-filesystem failure/cancel suites pass. Audio-before-timings work remains deferred. |
| 11 | Passed slice; blocked release gate | Snapshot/restore tests, fresh unchanged physical assets and packaged API pass. Clean Docker check blocked. |
| 12 | Passed slice; blocked historical acceptance | Packaging suites, prior downloaded ZIPs, fresh reader/embedded Preview after restart. Initial load stalls qualified; original-book acceptance remains pending. |
| 13 | Passed slice; blocked classification | Requested-language/manual/fallback suites pass; fresh speech-edit preservation. Provider-wide classification deferred. |
| 14 | Passed slice | Actual preparation/audio retry/cache suites and earlier UI. Live-provider quality not run. |
| 15 | Passed slice; blocked bulk endpoint | Inline/status suites, fresh Preview disclosure and restore guards. Bulk endpoint deferred. |
| 16 | Passed slice | Skip/cancel/exclusion suites, earlier UI and fresh prune failure/retry. Not every UI variant replayed this round. |

## Remaining acceptance

The existing ledger accounts for 61 feedback obligations since the last review
request, plus ten earlier feedback records. No new remote feedback appeared.
The 15 accepted deferrals remain: uncertain writer recovery; audio-before-timings;
systemic preparation classification; large-book measurement/projection caching;
no-op Save; server quiz plan; ownership repair; positional activity identity
carry-over; pre-schema-14 compatibility; pruned-leaf ownership; bulk review;
unassigned sign-video listing; Storyboard caption editing/mirroring; stale-page
Storyboard selection; historical blank-drift repair. Their local follow-up drafts
and merge-time filing requirement remain unchanged.

Original De-codable pg006 is still assigned to elasticsounds. Frankenstein,
ancientegypt-2, named integration approval, Tanzania doctor field validation and
applicable release verification remain pending. Narrow legacy ownership recovery
remains an explicitly accepted compatibility assumption, not historical proof.

Confidence is high in the specific repaired paths and bounded for whole-book,
multi-tab and release behavior. The additional discoveries demonstrate why a
green suite is not a guarantee against all user sequences. The full original
spec remains **partially delivered under accepted deferrals and pending gates**.

Raw evidence: primary checkout `.local-docs/spec0001-overlap-e2e-20261020/`,
including the local plan, two independent reports, red/green probes, full/focused
logs, PR snapshots, Desktop and Docker evidence, packaged API smoke, and `ui/`
screenshots, HTTP/transport logs, three book copies, restart snapshots and the
186-assertion script/result. None of those raw artifacts are committed.
