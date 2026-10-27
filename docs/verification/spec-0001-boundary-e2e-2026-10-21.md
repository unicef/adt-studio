# SPEC-0001 reader boundary verification — 21 October 2026

The confirmed findings from this round are fixed, independently reviewed and
committed locally. The affected Preview and downloaded-reader journeys pass.
This is **not** a declaration that the full original specification or historical
and release acceptance is complete. Nothing was pushed, posted, approved or merged.

## Revision and scope

- Starting HEAD: `46e6f271edaea98ea510e719dff83d084f46b9e1`.
- Activity/navigation repair: `37e48f0f`.
- Final production/test source: `1dd08af3`.
- Existing PR: #879, `spec/735-per-section-staleness`, base `develop`.
- Read-only GitHub refresh returned head
  `91886d5bf96183f59ec06ba0435fdc5386bbc173`, 20 discussion comments,
  eight reviews and zero inline comments, unchanged from the preceding snapshot.
- Integrated develop: `0efe1c2501a478049701fd221ab94fc97cdf50aa`.

This continues [the Preview investigation](spec-0001-preview-reader-review-2026-10-20.md)
and retains the [full branch/feedback accounting](spec-0001-final-gate-2026-10-20.md)
and subsequent dated reports. The new review examined reader lifecycle changes
and adjacent consumers, not every line of the whole branch again. All repository
tests were rerun. No spec acceptance wording, scope decision or approval metadata
was changed.

The local plan grouped earlier failures into temporal ownership, stable identity,
host differences, admission/recovery, preservation, scope expansion, fallback/retry
and disclosure. The new probes focused on action sequences across those boundaries:
late success **and** failure, disposal, reversed completion, partial catalogs,
missing media, automatic narrator fallback and enabled controls during a wait.
Passing isolated states had not proved those transitions. This broader matrix
still cannot establish absence of every possible bug.

## Confirmed findings and implementation

| Finding | Final behavior and concrete verification |
|---|---|
| An earlier language request could publish after a later selection, including clearing current maps on an obsolete failure. | The existing loaders check request revision/disposal on success and failure. Only the current request applies DOM translations. Five real-subscription/transport tests cover reversed success, HTTP/network failure, disposal and retry. |
| A superseded View Transition callback could commit an old page; an old HTTP failure could initiate fallback navigation. | Abort checks occur after fetch, inside the deferred commit and after transition completion. History disposal aborts the active navigation. Permanent tests reverse callback order and deliver an obsolete non-OK HTTP response. |
| Standalone activities served over HTTP could use full-reader soft navigation without owning its lifecycle. | Full reader explicitly opts in before React/prefetch mount. Standalone retains document navigation. Independent host probes and an actual downloaded WebPub stepper Next/Back journey verify both boundaries. |
| A disposed custom grader could change the next page's controls; duplicate Submit could run it twice. | Disposed handlers/results and detached registrations are ignored; one validation runs at a time. Permanent tests plus real delayed grading across page navigation; actual request count is one. |
| Late open-ended validation could publish after an edit/navigation; legacy omitted/empty/unknown input types were missed. | Revision/disposal checks guard publication. FITB and open-ended share the browser's effective text-input classification without rewriting saved markup. Tests include late validation and excluded hidden/checkbox/number controls. Real Preview/export accept an omitted-type input. |
| Language selection combined the new language directory with the previous language's audio filename. | Readiness is published after current catalogs, timings and DOM. Existing playback stops during loading and resumes only retained intent, using the current manifest. Real Preview uses distinct EN/FR filenames and controlled HTTP delay. |
| Late initial/resumed `play()` completions could change a newer page's playback state. | Every play/resume completion has session ownership; pause, stop, disposal and replacement invalidate it. Actual hook tests control media promise resolution/rejection. |
| Independent review found that the new readiness guard lost a requested Next-audio target; automatic narrator fallback could also reset it. | Pending selection retains stable data ID and page epoch, using the last-ready page order. Missing target audio stops rather than substituting another item. Partial catalogs, Next/Previous, both narrator-availability directions and EN→partial FR→EN are permanent regressions. |

`PACKAGING_FORMAT_VERSION` is 16 so existing packages rebuild with the repaired
runtime. The fixes do not rewrite book content, entity history, ownership,
provenance or freshness. No Studio strings changed.

Baseline checks established that the independently found old-manifest and late
resume defects were already present in integrated develop. They still obstructed
the promised output behavior and were repaired. The pending-target regression
was introduced by this round's readiness guard and caught before commit; it is
not described as pre-existing.

## Independent review

The first reviewer inspected the loader/activity/navigation fixes, ran seven
host/ownership controls, and independently reproduced two audio defects. That
reviewer then implemented the audio repair under explicit delegation. Their
subsequent implementation work is not treated as independent approval.

A second, read-only reviewer examined the complete reader patch and authored
eight additional hook/loader probes. That reviewer found the pending-target and
narrator variants above, verified the repairs, and reported **no unresolved
actionable finding in this bounded reader review**. All eight probes passed.
Their focused permanent run passed 128 tests; the final whole-repository run
includes the additional permanent combined-language-return regression.

The reviewers' reports, unchanged red probes, green reruns and limitations remain
outside Git. One exploratory probe incorrectly combined `ok: true` with HTTP
status 404; it was corrected and is not counted as product-failure evidence.

## Real UI evidence and fixture coverage

Native Chrome controls exercised Studio, the compiled API with real SQLite/files,
the current compiled reader, and actual browser-download exports. This avoided the
previously diagnosed browser-bridge paused response. Preview returned normally;
no speculative stall workaround was added.

Separate fixture copies combine a translated inline blank with the preserved
manual French answer `" soleil "`, repeated local answer keys under distinct
owners, a legacy free-response input with no `type`, and an inline custom grader.
A second copy contains the normal editable-activity stepper. These differ from
uniform modern fixtures with explicit input types, immediate grading and full
reader chrome on every host.

Two newly versioned 90-second tone recordings, with different EN/FR filenames,
make in-flight audio changes observable. They are test assets, not evidence of
provider quality. A controlled API boundary delays selected language requests or
the custom grader. In the first audio transition, text, speech-text and audio
catalog requests were held; in the repeated transition immutable cache hits left
optional voice/timing requests to hold. The delayed Preview harness disables its
offline preloader to expose requests. The downloaded Web Export is unmodified
and retains its normal offline assets.

| Fresh real UI journey | Result |
|---|---|
| Preview load/re-package and return to the reader | Passed; no reproduced stall using native controls. |
| English→delayed French→English, then release the earlier request | Passed; English content and live blank remain; `sun` grades correctly. |
| Double Submit on delayed custom grader, leave page, release result | Passed; next page's controls remain its own; exactly one actual grader request. |
| Legacy omitted-type free response | Passed in Preview and downloaded Web Export; input submits successfully. |
| Play English, select French while catalogs are held, release them | Passed; old playback/highlight stops, then French text and playback resume; HTTP serves the French filename with 200. No crossed language/filename request. |
| Repeat pending language transition, press Stop, release | Passed; translated content appears but audio remains disabled/stopped. |
| Export WebPub from Studio; open actual standalone page; stepper Submit→Next→browser Back | Passed; next page is a document navigation, its controls work, and the previous answer is retained on Back. This uses the reachable stepper Next, not a hidden Skip handler. |
| Export Web ZIP from Studio with both languages and Speech | Passed; freshness warnings disclosed; ZIP saved and its actual contents served locally. |
| Downloaded Web Export: French `soleil`→Submit→Next→free response→Submit→browser Back | Passed; both activities accept their own answer, and `soleil` remains after Back. |
| Downloaded Web Export: play French narration on the final page | Passed; Pause state and highlight appear, and the actual French audio file is requested with 200. |

**Nineteen persisted/artifact assertions passed**: five captured histories
(`page-sectioning:pg012`, `web-rendering:pg012`, French manual translations,
EN/FR TTS) exactly unchanged from after fixture setup; original manual answer
whitespace retained; both Web Export runtime bundles and both unpacked Desktop
bundles equal the final build byte-for-byte; WebPub's standalone bundle equals
the final build; both long audio files export with identical bytes; single custom
grader request; correct/no-crossed audio request identities; standalone document
navigation; exported French audio response; **zero provider calls**.

The exact delayed open-ended validator, View Transition callback reversal,
browser-media promise rejection, pending audio Next/Previous and narrator fallback
interleavings were verified at controlled automated boundaries, **not** manually
reproduced through the real UI. The four complete catalog worked examples retain
their dated earlier UI evidence; this round did not repeat every generation,
cosmetic Save, restore, skip or exclusion variant.

## Final checks

| Command/check | Result |
|---|---|
| `pnpm test` including pretest build | **359 files / 4,470 tests passed**, 215.56 seconds, exit 0, final source. |
| `pnpm typecheck` | Passed. |
| `pnpm --filter @adt/runtime typecheck` | Passed after final production edits. |
| `pnpm lint` | Passed: zero errors, eight unused-disable warnings. |
| `pnpm build` / final pretest build | Passed; final built bytes verified in exercised artifacts. |
| Lingui extraction and strict compilation | Passed: 3,761 messages in each of five locales, zero missing, no catalog diff. |
| `pnpm --filter @adt/desktop build:unpack` | Passed after final production edits: macOS arm64, ad-hoc signature; notarization skipped. |
| `git diff --check` | Passed. |
| Dedicated invariant command | None; applicable invariant suites ran in `pnpm test`. |
| Docker | **Blocked:** daemon unavailable at `unix:///Users/ksokolovic/.docker/run/docker.sock`; no Docker build/run in this round. The older disk-capacity result is not reused as a current diagnosis. |

The first full attempt failed 22 Git-based tests because it lacked
`DEVELOPER_DIR=/Library/Developer/CommandLineTools` and selected the unaccepted
Xcode toolchain, plus two prefetch tests whose setup did not establish/clean up
the new full-reader ownership. The environment and test setup were corrected.
Those attempts are retained as failures, not labeled passed or unrelated product
regressions. Subsequent full runs passed, ending with the final result above.

## AC-to-evidence accounting

Statuses below distinguish tested implementation from full-contract acceptance.
The earlier full AC matrix remains applicable; an automated regression pass is
not relabeled as a fresh real UI run of that entire criterion.

| AC | Status in this round | Remaining original-contract / acceptance limit |
|---|---|---|
| 1 | Passed regression suite; full cosmetic UI not rerun | No-op Save optimization remains deferred. |
| 2 | Passed regression suite; language/audio UI and protected answer checks pass | Not every provider/language combination exercised. |
| 3 | Passed regression suite; glossary/image generation UI not rerun | Retain earlier dated shared-inventory evidence. |
| 4 | Passed tested slice: page-local answers/controls and pending audio stable identity | Historical ownership/identity repair deferrals unchanged. |
| 5 | Passed regression suite; no freshness hashing changes | Same media ID with changed bytes remains the accepted identity limit. |
| 6 | Passed regression suite; Preview/export warning disclosure observed | Systemic preparation classification remains deferred. |
| 7 | Passed tested preservation slice: five histories, manual answer, drafts and actual exports | Original historical-book acceptance pending; ownership repair/pre-schema-14 compatibility remain deferred. |
| 8 | Passed regression suite; this UI/packaging round makes zero provider calls | Large-book measurement/projection caching deferred; no new provider retry claim from reader-only tests. |
| 9 | Passed regression suite; obsolete reader publication controls also pass | Uncertain-writer recovery remains deferred; no new writer subsystem introduced. |
| 10 | Passed existing-output preservation suite | **Full original AC incomplete:** new-audio-before-timings publication is still the ratified follow-up. |
| 11 | Passed actual exported/Desktop bundle and audio-byte checks | Docker blocked; installer/release acceptance not run. |
| 12 | Passed tested Preview, Web Export and standalone WebPub-in-Chrome journeys | Original-book and actual external-host acceptance pending; unresolved ownership remains disclosed. |
| 13 | Passed requested-language fallback regression suite | Live provider quality and deferred systemic classification not claimed complete. |
| 14 | Passed preparation/audio retry/cache regression suite | Those provider workflows were not newly exercised through UI this round. |
| 15 | Passed regression suite; current disclosure observed | Bulk-review endpoint deferred. |
| 16 | Passed runner/storage regressions; reader cancellation and late-result UI pass | Generation skip/exclusion UI variants retain dated prior evidence. |

## Known gaps and pending acceptance

No confirmed unresolved defect remains in the reader fixes reviewed this round.
That is a bounded engineering result, not a guarantee for all custom JavaScript,
historical data or runtime schedules. Authored scripts remain responsible for
their own side effects; the runtime guards its shared controls rather than
providing a script sandbox.

The branch still implements the **documented safe slice**, not the full original
SPEC-0001. All 15 ratified deferrals remain: uncertain writer recovery; new audio
before timings; systemic preparation classification; large-book measurement and
projection caching; no-op Save optimization; server quiz plan; ownership-claim
repair; positional activity-ID carry-over; pre-schema-14 compatibility; pruned-leaf
ownership; bulk-review endpoint; unassigned sign-video listing; Storyboard caption
editing/mirroring; stale-page Storyboard selection; historical blank-drift repair.
Thirteen local follow-up drafts group these obligations; merge-time filing has
not been performed or claimed complete.

Still unverified here: original De-codable pg006 (assigned to elasticsounds),
Frankenstein and ancientegypt-2 acceptance, named integration approval, Tanzania
doctor field validation, Docker, Electron-window UI, signed/notarized installers,
external EPUB/WebPub reader hosts and live-provider quality. No new material
product decision is required by these reader fixes. Human approval is pending.

Raw evidence is local and excluded from Git in the primary checkout's
`.local-docs/spec0001-boundary-e2e-20261020/`: plan, GitHub snapshot, independent
reports/probes, failed and final logs, HTTP/transport records, isolated books,
downloaded ZIP/WebPub, screenshots and `ui/preservation.json`. The directory name
records when the round started; these final checks finished on October 21 locally.
