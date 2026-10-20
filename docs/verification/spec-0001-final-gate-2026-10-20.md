# SPEC-0001 final local gate — 20 October 2026

The subsequent [adversarial round](spec-0001-adversarial-e2e-2026-10-20.md)
found and repaired additional draft/identity defects. Use that report for the
latest source, checks and readiness limits; this report preserves earlier evidence.

**Recommendation: ready to publish for a final human review of the ratified PR
scope. Not a declaration that the original full spec, original-book acceptance,
or release gates are complete.** No confirmed non-deferred implementation defect
remains from this review. Two further real defects were found and fixed in this
round; the earlier readiness statement must not be read as proof that they did
not exist. Nothing was pushed, posted, retargeted, approved or merged.

## Revision and scope

- Started from `6d3811f3143fae6b7029b3e7ed01fda3aa143e5d`.
- Final production/test source: `bdc6f70cc861c40871a0b96519df085970875e31`.
- R6 commit: `dbfe033ff17405047a1c59795c5da255ee412934`.
- R7 commit: `bdc6f70cc861c40871a0b96519df085970875e31`.
- Refreshed develop: `0efe1c2501a478049701fd221ab94fc97cdf50aa`.
- Remote PR #879: `91886d5bf96183f59ec06ba0435fdc5386bbc173`; base develop,
  open, review required. Final read-only refresh found no concurrent remote change.
- The review considered the whole branch against develop, the current complete
  spec, primary/coordination issues, dependency PRs, applicable repository rules,
  ADR-024, roadmap/SDD references, every reviewer iteration and accepted deferrals.
  No descendant spec branch was merged to acquire a dependency.

This supplements the dated [previous remediation report](spec-0001-remediation-2026-10-20.md)
and [four-example report](spec-0001-worked-examples-2026-10-18.md), preserving their
revision boundaries rather than relabeling earlier checks as current-head runs.
The spec narrative now records cross-source identity reservation and admitted
cancellation cleanup. AC wording, in-review status and pending human approval are
unchanged.

## Independent findings and repairs

| Finding | Repair | Evidence |
|---|---|---|
| R6 — P1: a new Storyboard/assistant source could reuse a retired glossary, quiz or downstream-only ID and inherit unrelated manual output; an ungenerated Easy Read slot could overwrite a new source with the same ID | Extend the existing reservation to all retained source/output versions and image metadata; reserve deterministic derived slots in both directions and within one draft. Reuse for editor/assistant/glossary/quiz/section allocation. Preserve local identities, explicit moves/restores, shared references and unchanged legacy conflicts. Cosmetic/same-ID saves avoid an extra history scan. | Original actual SQLite/tool and raw PUT failures reproduced. Regression tests include retired origins, future/reverse/same-draft derived collisions, allocator direction, atomic rollback, manual translations and unchanged legacy cross-page moves. Fresh real UI rejects both a retired ID and a same-draft derived collision; valid fresh ID succeeds. |
| R7 — P2: a cancelled queued job released its writer lease before clearing running-step records, allowing cleanup to erase a subsequently admitted writer's state | Perform cancellation unwind and cleanup under the same existing writer admission; no cleanup after failed admission. No new lock mechanism. | Original StageService/SQLite/real-lock-release probe reproduced. Regression admits a new writer exactly at release and verifies its running glossary step survives; independently reproduced repaired. |

Independent review changed no tracked source or tests. It traced ownership,
reading order, active catalog, all identity origins, assistant/editor writes,
legacy baseline, protected output, fallback basis, physical assets and shared
admission. Fresh independent runs passed **180 tests**, plus real SQLite/API
failure probes. The last commit-bound check confirms the exact moved-ID exemption
is internal, derived from the pre-edit tree, and unavailable in public requests.
No remaining confirmed blocker was found in the agreed scope. This is a bounded
engineering conclusion, not a guarantee about every possible historical state.

The new reservation reads JSON/HTML/metadata, not image/audio/video bytes. A
synthetic 120-page history scan measured approximately 0.98–1.53 seconds under
concurrent test load, versus 0.55–1.09 seconds for the incomplete old scan. This is
not representative end-to-end Save latency. Ordinary same-ID edits avoid this
extra scan; large-book projection caching/measurement remains explicitly deferred.

## Feedback accounting across every iteration

Fresh GitHub snapshots contain 20 discussion comments, eight reviews, zero inline
comments and 190 timeline records. The independent reviewer checked pagination and
confirmed no timeline feedback body was absent from discussion/review endpoints.
All seven feedback records since the October 14 review request match the existing
reconciliation ledger byte-for-byte: 61 obligations, including 15 ratified
deferrals. The ten earlier reviewer/coordinator records were separately reread;
the post-cutoff count is not mislabeled as all historical feedback.

| Feedback | Current disposition |
|---|---|
| September 27 catalog revision; October 11 initial review | Governing output-level identity, scoped preservation and compatibility contract retained. Earlier implementation fixes are covered by current full suite and dated compatibility reports. |
| Note 1 and Teams media-hashing message | No media-byte hashing for freshness/status/reuse. Text/ID/config inputs and recorded asset identities drive those paths. Physical publication/restore integrity remains a separate operation, as ratified. |
| Note 2; October 13 coordination/addenda | Ownership, shared/duplicate IDs, legacy fixed layout, glossary identity, loading, preservation and status changes retained. R6 closes an additional cross-origin identity hole, not a deferred positional migration. |
| Note 3 and its addendum | Source-generator input warnings/Keep, new-book admission, drafts, ownership and UI evidence retained. The prior dated UI report covers wizard, in-flight caption save, concurrent glossary editors and busy first-open baseline. |
| Notes 4, 5 and 6 | Every post-cutoff item remains mapped in the reconciliation ledger. Reviewer implementations and later fixes remain on this branch. Note 5's unchanged remainder batching is not falsely claimed rewritten. |
| Note 7 and October 16 follow-ups | Ratified division of work and all 15 deferrals retained. Doctor implementation is present; field/release acceptance remains separate. No ratification authorizes R6 correction inheritance or R7 cleanup outside admission. |

Later explicit decisions supersede earlier proposals: caption-store authority
replaces authored-HTML-alt mirroring; glossary GET projects IDs without writing,
with materialization on the next successful edit; generator warnings use actual
input bases and persistent Keep decisions. These are documented decisions, not
silently dropped review requests. Source issues remain informational.

## Fresh end-to-end UI and artifact evidence

Built Studio ran against real Hono routes, services/workers and SQLite/filesystem.
Four fresh copies of the prepared representative historical book and one identity
fixture were used. After fixture setup, all tested mutations, review actions,
generation, restoration and export were through the real UI. External fetch was
stubbed at the provider transport boundary and counted. No real provider spend or
model-quality claim. The local fake credential was cleared afterward.

| Journey | Fresh observed and persisted result |
|---|---|
| Example 1 — cosmetic Storyboard edit | Color/spacing/image-size Save and reload; zero provider calls; all downstream status and non-rendering entities identical. Preview and downloaded Web ZIP contain the cosmetic edit and unchanged text. |
| Example 2 — changed stable text | Save makes zero calls; manual French survives, Keep accepts it; eligible Easy Read updates while its manual neighbor survives. Language/Speech reach 75 current applicable outputs with no missing/update/warning. Eight actual calls total. Repeated Speech adds zero calls; matching French audio and all audio rows on repeat remain identical. |
| Example 3 — glossary definition plus new image | Save makes zero calls. Stable `gl001` definition changes; `pg012_im007` becomes a caption inventory item. Caption, Language and Speech complete with eight actual calls and 76 current applicable outputs. No invented translation/audio consumer for the glossary-only image. Storyboard, Easy Read and unrelated page audio remain unchanged. |
| Example 4 — retire text, add text/image | Save makes zero calls. Language's Update all expands to missing caption/Easy Read dependencies and then Language; Speech completes, manual neighbor is kept. Ten actual calls, 83 current applicable outputs. Retired IDs disappear from active catalog and downloaded EN/FR display/speech dictionaries; new IDs appear. UI version restore recovers exact original manual French and EN/FR audio rows with zero calls, preserving original physical bytes. Context warnings after restore remain visible for rechecking; restoration does not manufacture freshness. |
| R6 raw-editor admission | Retired glossary ID Save returns 409, preserves all saved nodes and leaves the draft visible. A fresh replacement ID saves. On the final compiled source, introducing `fresh_pair` and `fresh_pair_easy_read` together returns 409 and preserves the complete saved-node snapshot. |

**52 persisted-artifact assertions passed**, including two actual browser-download
ZIP CRC/content checks and byte-for-byte retention of 20 original audio files and
six image files in each of the four books. Baseline files are required to exist;
empty video fixtures are not counted as preservation evidence. All Save/Keep/
restore operations were checked against the actual transport log. Generation
counts are 8 + 8 + 10 = 26; one subsequent unsupported `/models` credential-probe
request is separately recorded and is not counted as pipeline generation.

Production differences and limits:

- These fixtures model real storage shapes: multiple versions, explicit ownership,
  stable glossary IDs, shared references, retired identities, protected French and
  Easy Read, per-language audio, absent derived slots and retained physical media.
  They are not the original De-codable/Frankenstein/ancientegypt books.
- Images are small placeholders and synthesis returns valid tone audio. Model
  semantics, speech quality and media visual fidelity are not certified.
- The fresh membership UI action automatically supplied missing dependencies; it
  is not evidence of a fresh UI run with permanently blocked captions. Missing
  input isolation remains actual-storage regression and prior worked-example
  evidence. Retry/check/replace/prune variants remain the explicitly dated October
  18 UI evidence plus current automated tests, not newly repeated UI variants.
- R7's exact lock-release interleaving is independently tested with actual service,
  storage and lock files, not claimed as a manually reproduced UI race.
- The local harness initially omitted the production assets directory; supplying
  its isolated-project link enabled Preview. Browser debugger attachment delayed
  the reader iframe until released. Neither setup attempt is counted as a pass.
- The UI pass spans the final repair working tree. The API was restarted with the
  final build before glossary, membership and same-draft-ID rejection. Earlier
  cosmetic/text flows preceded the last internal move-guard adjustment; those
  flows do not use cross-page moves. The final full suite and independent move
  regression cover that adjustment.

## Checks at the final source

| Check | Result |
|---|---|
| `pnpm test` including pretest build | **Passed: 350 files / 4,320 tests**, 205.00 seconds |
| Independent risk-focused checks | **Passed: 180 tests**, plus original/repaired SQLite/API probes |
| Final cross-page suite | Passed: 95 tests |
| `pnpm typecheck`; runtime's separate typecheck | Passed |
| `pnpm lint` | Passed: zero errors, eight existing unused-disable warnings |
| `pnpm build` | Passed |
| Lingui extraction; `compile --strict` | Passed: all five locales, zero missing; no Studio strings changed in this round |
| macOS arm64 Desktop `build:unpack` | Passed, ad-hoc signature; no notarization |
| Final packaged API smoke | Passed on isolated copied book: book read, image inventories 2/1, 86 output rows |
| Working-tree/whole-branch whitespace check | Passed |
| Dedicated invariant script | None exists; corresponding storage/admission/identity/publication tests run |
| Docker clean `app` target | **Blocked**: Docker works, VM filesystem has zero available space (139.0G total / 135.5G used / 100%). No pruning performed. |
| Signed cross-platform installers / real provider quality / hosted CI for local commits | **Not run** |

Intermediate failures are retained in local logs: the first repaired full run
exposed two incomplete glossary storage mocks, which were corrected without
removing assertions; another invocation lacked the developer-tool override and
failed 22 Git-based script tests; a newly added cross-page test had a quoting typo,
which was corrected and independently rerun. The final full run above is green.
These failed attempts are not labeled pre-existing product failures or passes.

## AC-to-evidence matrix

Passed means the **ratified implementation scope**, not the entirety of an AC's
original wording when an explicit deferral or acceptance gate remains. No known
non-deferred criterion is left failed. Pending gates are identified separately.

| AC | Status and evidence | Remaining original-contract / acceptance limit |
|---|---|---|
| 1 | Passed: fresh cosmetic UI, exact downstream snapshots, zero calls, exported ZIP | No-op Save optimization deferred |
| 2 | Passed: fresh changed-text/Keep/Easy Read/Language/Speech/repeat UI; exact protected/neighbor evidence | Provider/language combinations not exhaustive |
| 3 | Passed: fresh glossary/image UI, actual consumer inventory, unchanged unrelated output | Enabled image-translation UI variant not repeated |
| 4 | Passed: fresh retirement/restore/export; R6 cross-source/derived admission and move tests | Positional carry-over, pruned-leaf and blank-drift recovery deferred |
| 5 | Passed: current canonical-signature/context suite; same-ID cosmetic save | Same media ID with different pixels remains an accepted limit |
| 6 | Passed: actual-storage missing/usable warned-input tests; UI dependency expansion | Systemic preparation classification deferred; blocked-input UI variant not freshly repeated |
| 7 | Passed for implemented compatibility: current protection/history/baseline tests, fresh Keep/restore; prior draft/conflict UI | Original historical-book acceptance pending; unresolved ownership repair deferred |
| 8 | Passed for caching: actual fetch counts, fresh no-call repeat Speech | Large-book end-to-end measurement/projection caching deferred |
| 9 | Passed: actual publication/concurrency suites, R7 next-writer preservation | Uncertain-owner recovery/release-lock remains deferred; proven dead same-host recovery is implemented/tested |
| 10 | Passed for previously playable output: real-filesystem failure/cancel/neighbor tests | New-audio-before-timings order remains a ratified separate fix; full original AC not complete |
| 11 | Passed: physical snapshot/restore suite; fresh exact restored audio and byte retention | Clean Docker release verification blocked |
| 12 | Passed for implemented output policy: current packaging suites, fresh Preview/two downloaded exports | Original historical-book acceptance pending; unresolved ownership repair deferred |
| 13 | Passed for implemented fallback: requested-language/manual/batch tests; prior dated UI | Provider-wide systemic classification deferred |
| 14 | Passed: actual preparation/audio retry/cache tests; prior changed-input UI, fresh repeat Speech | Live provider quality not run |
| 15 | Passed for existing actions: fresh warnings/Keep/status/identity rejection and current UI suites | Bulk review endpoint deferred |
| 16 | Passed for implemented skip/exclusion: current runner/storage suites, R7, fresh version restore | Skip/prune variants not freshly repeated through UI; prior dated evidence retained |

## Outstanding decisions and acceptance

There is **no new material product decision** awaiting the user from R6/R7. Their
spec additions clarify existing preservation/admission promises. Legacy leaf-based
ownership remains the expressly accepted compatibility assumption, not proof of
historical ownership. Unknown/contradictory ownership is retained and disclosed,
not guessed or certified current.

The original full specification remains **partially delivered under the 15
ratified deferrals**: uncertain writer recovery; new audio before timings;
systemic preparation classification; large-book measurement/projection caching;
no-op Save optimization; server quiz plan; ownership-claim repair; positional
activity-ID carry-over; pre-schema-14 compatibility; pruned-leaf ownership;
bulk review endpoint; unassigned sign-video listing; Storyboard caption editing/
mirroring; stale-page Storyboard selection; historical blank-drift recovery.
Thirteen local follow-up drafts group these obligations; filing is due at merge
and has not been claimed complete. Reviewer-owned future PR work is not silently
pulled back into #879.

Pending product acceptance: elasticsounds' De-codable pg006 pass, Frankenstein
final pass, original ancientegypt-2 retest and a named integration approver.
Tanzania doctor field validation and clean Docker `app` build remain release
limits. Final review can proceed with those facts visible; merge/release or
“full original spec complete” would need the applicable gates/deferrals resolved.

Confidence is **high for the repaired and tested agreed scope**, bounded for the
whole historical-book population and packaged release. The conclusion is based
on independent failure reproduction, complete automated checks and real UI/output
evidence, not the absence of another comment or a claim of 100% certainty.

Raw local evidence, excluded from Git: the primary checkout's
`.local-docs/spec0001-final-gate-20261020/` (plan, complete feedback snapshots,
independent report/probes, command logs, screenshots, transport/HTTP records,
SQLite fixture copies, assertion script/results and downloaded ZIPs).
