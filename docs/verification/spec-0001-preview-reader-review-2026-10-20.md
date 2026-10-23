# SPEC-0001 Preview investigation and independent reader review — 2026-10-20

The reproduced Preview stall was a paused document response in the browser test
bridge. Releasing its debugger made the reader appear immediately, without an
application change. Native browser checks then passed. An independent review of
the latest reader fixes found three real activity defects; all three are repaired
in local commit `e4984c9c` and verified below. Nothing was pushed or posted.

This is a bounded follow-up to
[the sequence review](spec-0001-sequence-e2e-2026-10-20.md). It resolves that
report's unexplained regular-profile Preview stall and missing independent
reader review. It does **not** establish completion of the full original spec:
accepted deferrals, original-book acceptance and release gates remain.

## Revision and scope

Starting HEAD: `7afafb9c148d2a25747bb1bdcadd21de82bc760c`. Independently reviewed
production change: `80845ce25273dd0ef97875298caffd3d6d498cc7`, against `a43194b6`.
PR #879 remains on `spec/735-per-section-staleness`, targeting `develop`; the
read-only GitHub refresh returned head
`91886d5bf96183f59ec06ba0435fdc5386bbc173`, updated October 16 at 20:16:26 UTC.
No review, approval or release metadata was changed. Raw evidence is outside Git
at `.local-docs/spec0001-preview-review-20261020/` in the primary checkout.

## Preview stall: causal evidence

1. The regular Chrome profile loaded the same historical-shaped fixture using
   native controls before the browser bridge attached.
2. After attaching, a browser-bridge reload reproduced a blank Preview frame.
   Server instrumentation recorded the package-root request at 19:54:44.620 UTC,
   its 302 response, and the completed wire response. The reader did not appear.
3. The supported browser diagnostic interface refused the frame-tree command
   with: `Raw CDP is unavailable while Browser Use is resolving a paused document response.`
4. Clicking the browser's debugger **Cancel** control immediately revealed the
   reader and its page controls in that same tab. No server or application change
   occurred between the blank frame and recovery.
5. Native reload succeeded. After the reader repairs, native Preview first load,
   return from Export, re-package and actual reading/answer journeys also passed.

This establishes the cause of this reproduced stall, not every possible Preview
failure. No speculative Preview timeout, redirect or concurrency workaround was
added. The HTTP diagnostics and screenshots remain in the local evidence folder.
Further UI actions used native controls; the bridge was reattached only after
all journeys to capture a final page screenshot and close the task tab.

## Independent findings and repairs

| Finding | Repair | Regression evidence |
|---|---|---|
| Language loading published its dictionary before replacing DOM; inline blank rehydration therefore ran too early and the subsequent replacement removed the inputs. | Rehydrate after the central DOM translation completes. Retain initial hydration for standalone hosts and remove the event listener on teardown. | Actual `initializePageContent` / `subscribeLanguageChanges` test failed before repair, passes after; draft survives language and repeated Easy Read changes; disposed initializer stops hydrating. |
| A preserved single answer such as `" soleil "` could never match because only the entered answer was trimmed. | Normalize both comparison operands, including interchangeable answers; leave authored source and translations unchanged. | Source whitespace/case cases failed before repair; real manual French translation grades correctly. Pipe alternatives retain existing behavior. |
| Soft navigation retained the preceding page's answers when the incoming legacy page had no authored answer map. | Clear page-owned answer, translation-ID and interchangeable-pair globals **before** incoming custom scripts run. | Real navigation regression fails before repair and passes after. Independent controls and Chrome confirm an answerless page accepts free input and a custom script's own grading still works. |

These lifecycle and legacy source-map edges existed before the latest patch but
block its promised reader compatibility. Their baseline status did not exempt
them from repair. `PACKAGING_FORMAT_VERSION` is now 15 so previously packaged
readers are rebuilt. No stored ownership, IDs, content, provenance or freshness
was rewritten. No acceptance criterion or approval status was changed.

The separate reviewer ran unchanged failing probes, compatibility controls and
permanent suites, then inspected the repair. Results: two unchanged valid
regression probes passed; seven independent compatibility/boundary controls
passed; 188 focused repository tests passed. No additional confirmed finding in
this bounded scope. A jsdom custom-script test executes the marked script at its
insertion boundary because jsdom's resource queue differs from Chromium; that
probe is not claimed as browser evidence. Actual Chrome covers script execution.
The complete review report and probes remain in the local evidence directory.

## Real UI and production differences covered

The compiled API and production-built Studio used real SQLite/filesystem storage
and the current compiled reader. Original test books were retained. A separate
copy, `sequence-reader-interaction`, combines three saved activity shapes:

- A translated `[[blank:item-1]]` sentence, rather than only a standalone input.
- A subsequent activity reusing local `item-1`, with an omitted HTML input type
  and no answer map. This differs from modern generated pages with explicit maps.
- A custom activity supplying its own `window.correctAnswers` in an inline
  script, rather than receiving answers only from the packaging schema.

Its retained manual French answer contains boundary spaces. Stable section
owners stay distinct. This fixture models the relevant historical shapes; it is
**not** the original De-codable pg006 book or proof of arbitrary old custom code.

| Real journey | Result |
|---|---|
| Preview: enter `soleil`, switch French → English → French | Passed: translated sentence and live input remain; response retained. |
| Submit the preserved French `" soleil "` answer | Passed: correct feedback and Next state. |
| Navigate to the answerless page and submit `my own response` | Passed: accepted without requiring the previous owner's answer. |
| Navigate to the custom-script page | Passed: `not moon` rejected, `moon` accepted. |
| Navigate backward through both prior pages | Passed: their individual responses restored. |
| Toggle Easy Read off/on on the inline activity | Passed: one live input and the response remain. This UI fixture lacks a distinct Easy Read translation; the permanent lifecycle test covers changed Easy Read text. |
| Leave Preview for Export, return, re-package | Passed: reader returns with its retained response and working controls. |
| Export from Studio, save ZIP, serve its actual contents locally | Passed: downloaded artifact opens in Chrome; English → French retains inline response; French answer, answerless page and custom-script answer validate. |

Seven persisted/artifact assertions passed: exact original sectioning,
rendering and manual-translation version histories retained; exported manual
answer still includes its original spaces; both exported reader bundles match
the current build byte-for-byte; **zero provider calls** at the stubbed transport
boundary. Screenshots, ZIP, isolated books and HTTP/transport logs are retained.

## Checks and limits

| Check | Result |
|---|---|
| New permanent regressions before repair | Four assertions failed across three files, establishing red evidence. |
| `pnpm test` (including pretest build) | **358 files / 4,432 tests passed**, 209.51 seconds. |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed: zero errors, eight unused-disable warnings. |
| Runtime build / full pretest build | Passed; exact runtime exercised in Preview and downloaded export. |
| Lingui extraction and strict compilation | Passed: 3,761 messages per locale, zero missing, no catalog diff. No Studio strings changed. |
| `pnpm --filter @adt/desktop build:unpack` | Passed: macOS arm64, ad-hoc signature, notarization skipped. Both packaged reader bundles equal the current build. |
| `git diff --check` and independent repair review | Passed. |
| Dedicated invariant command | None; applicable invariant suites ran in the full test command. |
| Docker, Electron-window UI, signed release, WebPub/EPUB host UI, live-provider quality | Not run in this follow-up. The prior Docker capacity blocker remains unverified here; no release certification is claimed. |

## Acceptance accounting

| AC / scope | This round | Remaining full-spec boundary |
|---|---|---|
| AC-4 / stable owners | Passed tested slice: reused local answer keys do not cross page owners. | Historical ownership repair deferrals unchanged. |
| AC-7 / manual preservation | Passed tested slice: manual answer and all captured entity versions unchanged; usable translated grading. | Original historical-book acceptance remains pending. |
| AC-11 / packaged assets | Passed tested slice: actual ZIP and unpacked Desktop contain the final runtime. | Applicable Docker, installer and release verification remain. |
| AC-12 / Preview and export | Passed tested slice: stall explained, native Preview and actual Web Export journeys verified. | Original-book and external host acceptance remain pending. |
| AC-1–3, AC-5–6, AC-8–10, AC-13–16 | Regression suites passed; their complete real UI examples were **not rerun** in this bounded round. | Retain the prior AC matrix and its explicit deferrals; no newly claimed full-contract pass. |

All three findings from this independent review are fixed and the affected real
UI checks pass. The 61 feedback obligations plus ten earlier records retain their
existing ledger accounting; this was not a fresh full-branch feedback audit. The
15 accepted follow-ups and their merge-time filing requirement remain unchanged.
De-codable pg006 remains assigned to elasticsounds; Frankenstein, ancientegypt-2,
named integration approval and Tanzania doctor field validation remain pending.
The current branch implements the documented safe slice, not the entire original
SPEC-0001 contract. Human review remains pending.
