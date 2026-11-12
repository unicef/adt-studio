# SPEC-0001 — legacy saves and Speech recovery, 21 October 2026

Baseline: `fa84c825bce95bb7f58d7aec207e64a03d0f0e70`, PR #879,
`spec/735-per-section-staleness`. This is a local remediation report, not human
approval, release certification, or a claim that the original specification is
fully implemented. It supplements the [previous boundary verification](spec-0001-boundary-e2e-2026-10-21.md).

Implementation commits: `7eb2e577` (legacy saves and book Speech admission) and
`459fb9af` (unusable legacy Speech recovery and actual Gemini fallback context).
Both are local; this round did not push or post to GitHub.

## Feedback disposition

| Finding | Implementation and verification | Status |
| --- | --- | --- |
| 1. Legacy ownership fails when a content leaf was pruned from HTML | Confirmed against the exact baseline. The complete-leaf ownership rule and the October 16 Note 7 deferral explicitly cover this case. Retained content/history and omission disclosure remain; this patch does not guess ownership from the remaining leaves. | **Blocked by deferred ownership scope**, not fixed |
| 2. Unchanged retired/duplicate translation rows prevent other edits | Validate actual edits after recognizing unchanged retained groups. Preserve conflicting copies, retired rows, metadata and history. An explicit equal-copy edit may resolve an existing duplicate; new or divergent duplicates and changed retired IDs still reject atomically. | **Passed** API/storage and actual Language UI saves |
| 3. First manual translation has no receipt | GET returns server-derived signatures for configured translation languages even before their first entity. Studio captures that receipt with version 0, shows Save, and creates a canonical locale namespace unless a legacy namespace already exists. The baseline empty signature actually returns HTTP 400, rather than the reported 409. | **Passed** GET/component/PUT and absent-entity `pt-BR` UI save |
| 4. Unchanged foreign-page caption blocks a local save | Preserve an unchanged caption before applying the owner guard. Actual edits to foreign-owned captions still reject. | **Passed** API/storage negatives and actual Captions UI save |
| 5. Unusable legacy Speech residue is protected from recovery | A failed generated preparation with no usable speech, or a missing nonmanual recording, is eligible for requested recovery. Usable unknown-origin content and all manual speech/recordings remain protected. Preserve previous versions and surviving physical assets. | **Passed** ordinary/Retry integration, transport counts and UI |
| 6. Whole-stage Gemini fallback is immediately stale | Record `pageBatchFallback: single-item` for actual per-item generation and cache reuse when page batching cannot use alignment credentials. Existing context/signature projection then compares the inputs actually synthesized. | **Passed** primary/secondary runner, cache/context probes and UI reruns |
| Additional: global provider availability disables runnable book Speech | Use existing per-language book routing, source plus output languages, and valid active secondary narrators for the advisory Run gate. Actual selected-work credential admission remains on the server. | **Passed** six component cases, independent runner probes and actual UI |

The additional provider gate was independently reproduced on develop
`0efe1c2501a478049701fd221ab94fc97cdf50aa`; blame identifies merged PR #721,
`340f09168e278f6ffa7ed2f2d1c4cde117609d07`. Its origin does not excuse the
broken flow, and no ratified deferral reserves it. The first gate draft omitted
the source language when explicit outputs existed; independent review caught
that mismatch before commit. The final gate includes both. Availability of any
configured narrator permits entering a run; it does not promise credentials for
every selected item. The existing runner rejects missing required credentials
before synthesis/publication without a separate client-side work planner.

The [October 21 recovery assumption](../specs/SPEC-0001-per-section-staleness.md)
records why absent nonmanual audio and failed generated preparation are eligible
for recovery. It does not infer authorship for usable legacy output or promise
to recover bytes already missing before the run.

## Regression and independent evidence

Added tracked regression coverage is in:

- `apps/api/src/routes/catalog-freshness.test.ts`: full collection saves,
  retained conflicts/history, new locale receipt, invalid edits and foreign
  caption ownership.
- `apps/studio/src/components/pipeline/stages/languages/LanguageView.save.test.tsx`:
  actual first-save control/request and effective provider availability,
  alongside existing draft, restore and stale-save tests.
- `apps/api/src/services/catalog-preparation.integration.test.ts` and
  `packages/pipeline/src/__tests__/core-tts.test.ts`: ordinary and explicit legacy
  recovery, failed-attempt reuse and manual/usable-unknown preservation.
- `apps/api/src/services/gemini-item-compatibility.integration.test.ts`:
  whole-stage no-alignment fallback, unchanged rerun, missing-file recovery,
  explicit Retry, real storage/history and physical bytes.

Independent review exported API/pipeline source from the exact baseline before
running eight reproductions. All eight confirmed the reported failures/limit;
these baseline passes are not repair passes. Against the repair, independent
real SQLite/filesystem/API probes passed **8 save cases, 6 Speech cases and 4
final provider-admission cases**. They count actual stubbed HTTP requests,
including two narrators, zero-call reuse, neighbor versus own-input changes,
cache repair of an omitted fallback marker, manual preservation and rejection
before publication. No further confirmed defect remained in that bounded review.
It is not a new independent review of every line in the whole branch.

## Real UI acceptance

Actual Chrome controls exercised Studio on loopback against an isolated book
directory, real API, SQLite and files. Provider HTTP was intercepted at the
transport boundary: one preparation response and five Gemini syntheses, with no
live provider traffic. This is a constructed historical-shape fixture, not
elasticsounds' original book.

| UI journey | Observable result |
| --- | --- |
| Edit one French translation while the submitted list retains a retired correction and two conflicting copies of another ID | HTTP 200; only requested text changes; both conflicting copies, retired correction, metadata and original versions retained. |
| Configure a new `pt-BR` target with neither canonical nor underscore translation row, type a first correction, press Save | Canonical `pt-BR` version 1; no `pt_BR` row; manual text persisted. A prior Spanish test had an empty entity and is only evidence for empty-collection saving. |
| Edit an owned caption in a page collection also holding another page's caption | HTTP 200; unchanged foreign caption and the other page's original caption retained. |
| Retry a pre-evidence failed generated preparation with null speech | One preparation request; ready requested-language speech; old failure remains in history. |
| Run Speech with Gemini only, page batching enabled and Word Highlighting disabled | Missing nonmanual file regenerated with actual item-context marker; missing manual recording retained. Usable matching outputs remain reusable despite upstream warnings. |
| Repeat Speech unchanged; repeat with global OpenAI/book Gemini; repeat with source English absent from the explicit output-language list | Run is enabled where the effective book route is available; each completes with zero additional provider calls. Missing/manual and missing-translation warnings remain visible rather than being certified away. |

Eight post-UI storage/transport assertions passed. They compare every original
entity version, retained duplicate/retired/manual rows, the first locale version,
foreign caption state, preparation history, recovered audio file and fallback
marker, the six actual provider calls, and all four HTTP 200 manual saves. Saves
made zero provider calls. Original bytes missing before the fixture cannot be
restored by this recovery; retained versions remain intact.

Production differences represented: pre-evidence provenance, null failed
preparation, missing physical recordings, retained conflicting/retired IDs,
foreign-page captions, empty versus absent translation collections, canonical
and legacy locale namespaces, global/book provider disagreement, source languages
outside the explicit output list, and secondary voices. Real-world content
diversity, provider failures/quality, arbitrary custom scripts and large-book
performance are not established by this small fixture. Negative stale-edit and
invalid-write cases are API/integration checks, not all repeated manually in UI.

## Repository and packaging checks

| Command/check | Result |
| --- | --- |
| `pnpm test` (includes build) | **Passed:** 359 files, 4,496 tests. |
| `pnpm build` | **Passed.** |
| `pnpm typecheck` and `pnpm --filter @adt/runtime typecheck` | **Passed.** |
| `pnpm lint` | **Passed:** zero errors, eight unused-disable warnings also present in the prior boundary evidence. |
| `pnpm --filter @adt/studio extract` | **Passed:** 3,761 messages in each of five locales; zero missing translations; no catalog changes. No new UI copy. |
| Final LanguageView and speech-routing focused tests | **Passed:** 2 files, 28 tests after the lint-only model-ID naming correction. The 4,496-test run preceded that equivalent-expression correction. |
| `pnpm --filter @adt/desktop build:unpack` | **Passed:** macOS ARM64 unpacked application; ad-hoc signed, not notarized. No new native Desktop UI acceptance in this round. |
| `docker build --target app` | **Passed** from final committed implementation `459fb9af`, Linux ARM64. Local image `adt-studio:spec0001-legacy-20261021-final`; no registry push. |
| Docker production smoke and real Chrome UI | **Passed:** healthy API through nginx, SPA/compiled asset serving, legacy catalog read, then first German translation saved and reopened in the production UI. Version 1/manual provenance, unchanged French legacy entries and every original entity version verified in the mounted copy. |
| Invariants | Existing invariant-focused tests are included in the full suite; no additional standalone invariant command found. |

Raw local plans, baseline exports, independent probes, command logs, HTTP/transport
records, UI accessibility captures and assertions are deliberately outside Git:
`.local-docs/spec0001-legacy-feedback-20261021/` in the primary checkout. The UI
receipt includes a screenshot of the completed final Speech rerun. These local
artifacts are not portable hosted-CI evidence.

Docker's final image ID is
`sha256:981d114a4bc283c082b212411322e0a62cc36f45a760aa7266fc71a3e7d0cae5`.
The five container assertions are in `docker-smoke.json`; the production save
and reopened view are captured under `ui/docker-first-save*`. It ran only on
loopback with copied books and was stopped/removed after verification. This is
an application-image build and manual-save smoke, not an amd64 check, live
provider test or release certification. The development fixture servers were
also stopped. Docker Desktop itself was left running.

## AC-to-evidence matrix for this round

“Passed” below names verified behavior, not blanket completion of an AC with a
ratified exception. The full suite reran; all four original worked examples were
not replayed end-to-end in this focused compatibility round. Their earlier dated
evidence remains in the previous verification reports.

| AC | Evidence/status | Remaining limit |
| --- | --- | --- |
| 1 | **Passed:** save regressions and zero-call UI saves; cosmetic-input suite reran. | Full Example 1 UI not rerun this round. |
| 2 | **Passed:** retained manual translations, unchanged audio reuse and input-specific invalidation. | Full Example 2 UI not rerun. |
| 3 | **Passed:** caption preservation regressions; catalog/image suite reran. | Full glossary/image Example 3 UI not rerun. |
| 4 | **Passed** for retained retired/duplicate IDs and unchanged history. **Blocked/deferred** for pruned-leaf historical ownership. | Full Example 4 UI not rerun; no historical reassociation repair. |
| 5 | **Passed:** actual item-context marker, own/neighbor input probes, routing tests. | Not an exhaustive provider/language matrix. |
| 6 | **Passed:** usable protected inputs, missing-file recovery and repeated zero-call runs. | Missing manual audio remains missing pending explicit user replacement. |
| 7 | **Passed** for tested manual/legacy preservation and safe saves; **blocked/deferred** for unresolved historical ownership/positional IDs. | Original historical-book product pass pending. |
| 8 | **Passed:** real stubbed transport counts, ordinary and cached reuse. | Large-book measurement/projection caching deferred. |
| 9 | **Passed:** guarded saves and full concurrency regression suite. | No new concurrent-writer UI walkthrough; uncertain writer recovery deferred. |
| 10 | **Passed** existing-output preservation regressions. | New-audio-before-timings publication remains deferred; original AC not fully delivered. |
| 11 | **Passed:** retained version/file regression suite and recovery bytes. | No new cache-cleanup/restore UI walkthrough or release certification. |
| 12 | **Passed** regression suite; **blocked/deferred** for unresolved owner omissions. | Preview/export UI not newly replayed this round. |
| 13 | **Passed:** requested-language recovery and manual/unknown speech protection. | Provider-wide failure classification deferred; no live-provider acceptance. |
| 14 | **Passed:** Retry, failure reuse, actual-context audio reuse and ordinary UI reruns. | Real provider quality not tested. |
| 15 | **Passed:** warning/action suite and actual Retry/status UI. | Bulk-review endpoint remains deferred. |
| 16 | **Passed** runner/storage cancellation, skip and exclusion regressions. | Those generation UI variants not newly replayed this round. |

## Pending acceptance and known gaps

Feedback 2–6 and the discovered availability gate are implemented and verified
within the stated boundaries. Finding 1 remains a real, known compatibility gap
explicitly deferred by Note 7. Removing its all-leaves constraint would change
the ratified ownership assumption; it is not silently relaxed here.

The specification's other ratified follow-ups remain in scope reporting, including
staged audio publication, provider-wide preparation classification, legacy
positional IDs, pre-schema-14/historical blank-drift repair, writer recovery and
large-book measurement. Nothing in these passes closes those items. The Tanzania
doctor check and elasticsounds' Frankenstein/De-codable historical-book acceptance
remain pending unless independently reported. Human integration approval is not
provided by this report. This batch is a verified repair of the agreed slice,
**not full delivery of the original SPEC-0001 without its deferrals**.
