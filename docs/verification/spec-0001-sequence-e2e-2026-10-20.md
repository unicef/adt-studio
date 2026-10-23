# SPEC-0001 sequence and reader acceptance round — 20 October 2026

This additional end-to-end round found and repaired two reader compatibility
gaps: implicit text inputs could not submit, and retained manual answer
translations were exported but ignored when grading text answers. The repaired
journeys pass in the real UI and downloaded output. **This is bounded acceptance
evidence, not completion of the full original specification.** Existing accepted
deferrals, historical-book acceptance and release gates remain.

Nothing was pushed, posted to GitHub, approved or merged.

## Revisions and method

- Starting local head: `a43194b6521a6837b5ec801c6bba794f742ba7e5`.
- Final implementation/test commit: `80845ce25273dd0ef97875298caffd3d6d498cc7`.
- PR #879 remote head: `91886d5bf96183f59ec06ba0435fdc5386bbc173`, base develop.
- Final read-only refresh: unchanged 20 comments/eight reviews; last update
  `2026-10-16T20:16:26Z`.
- Develop baseline: `0efe1c2501a478049701fd221ab94fc97cdf50aa`.

The local plan generalized review Notes 1–7 and previous failures into sequences:
commit followed by lost acknowledgment; cancel/skip after provider admission;
duplicate/delete/restore followed by actual reader use; and repeated local IDs
under different stable owners. The existing feedback ledger, accepted deferrals,
spec narrative and prior [overlapping-actions report](spec-0001-overlapping-actions-e2e-2026-10-20.md)
were retained. This is an additional focused UI round plus a complete automated
suite, not a fresh replay of every historical review case or all four worked
examples. Those earlier results remain dated in their own reports.

Production-built Studio ran in Chrome against the compiled Hono API, real SQLite
and physical files in disposable historical-shaped book copies. The harness
returned one HTTP error after a real successful commit and delayed actual
stubbed transport responses. It did not substitute storage or publication helpers.
External calls were intercepted and counted; no real provider was contacted.

## Fresh real UI journeys

| Sequence | Observed result and persisted evidence |
|---|---|
| Speech commit → lost response → retry → reload | The route committed with 200; the harness delivered 503. The draft/error stayed visible. Retrying the identical stale guard returned 409 instead of overwriting the target. Explicit cancel/reload showed the exact committed manual text. |
| Start audio → cancel after transport began → receive late response | Cancel was issued after the recorded audio transport start. The late result did not change either language's active audio or timing rows. Manual speech remained exact. Core TTS fallback metadata reconciled, so this does **not** mean every node was unchanged. |
| Explicit retry after cancellation | One new audio transport call and one timing call completed. Only the requested target audio changed; other entries and French audio/timings stayed exact. |
| Start a second audio target → Skip this run → receive late response | All audio/timing entries stayed exact. Collection versions/timestamps and timing-version metadata advanced: this is **no changed output entries**, not a no-write assertion. |
| Explicit retry after Skip | Zero further audio calls and one timing call: the usable cached audio was reused. The target became current; unselected warnings remained. |
| Legacy activity → Duplicate → Delete original | A same-page, same-type, unique-leaf match exposed the unowned activity. Duplicate minted a new section and disjoint leaf identities. Delete removed only the original active answer. Its entity history and manual French translation remained. |
| Restore source first, then rendering | Source-only restore correctly showed missing rendered content instead of attaching the neighboring rendering by position. Restoring rendering recovered the exact original and duplicate versions. The original manual answer reappeared under its original identity. |
| Preview → wrong answer → manual French answer | After the fixes, the unchanged implicit text input enabled Submit. Wrong text was rejected; `soleil manuel` was accepted, with the reader reporting all answers correct and offering Next. |
| Navigate to duplicate with the same local answer key | The duplicate rejected `soleil manuel`, which belongs to the original section. Its missing French answer fell back to its own source answer `sun`, which succeeded. |
| Export through Studio | A fresh ZIP was downloaded through the actual export dialog. CRC, separate activity pages, original-only manual translation, exact owner maps and final runtime bundle bytes passed inspection. |

Transport evidence totals **five actual calls at the intercepted external fetch
boundary**: three audio calls and two timing calls. Saves, legacy structural edits,
restores, Preview and export made no provider calls. Cancellation/Skip timestamps
are later than the corresponding transport start timestamps; the delayed stub
deliberately returned anyway to test late-result containment.

**256 persisted-artifact assertions passed.** They compare all baseline entity
versions against the unchanged source copies, preserve the added legacy fixture's
history, check exact target/neighbor changes and retry payloads, verify answer and
owner separation, and inspect the final downloaded ZIP. Physical preservation
compares 20 audio and six image files per book copy byte-for-byte: 52 comparisons
of 26 unique fixture assets. These are test comparisons, not application content
hashing. The final export's full and standalone reader bundles exactly match the
final build.

## Repairs and compatibility decisions

### Browser-effective input type

The old selector required an explicit `type="text"`. Ordinary HTML with no type,
an empty type or an unrecognized type is a text input according to the browser,
but was omitted from validation and left Submit disabled. The selector was
identical on develop before this repair; this is a pre-existing reader edge
exposed by the branch's legacy-usability acceptance journey.

The reader now filters using the effective DOM input type, retaining textarea
support and excluding hidden, checkbox, number and filter controls. Saved markup
and identities are unchanged. Four isolated regression cases failed before the
repair; uppercase `TEXT` already worked. Five added input/control tests pass.

### Preserved translations must affect actual answer grading

The previous reader read only `window.correctAnswers`, even though packaging
retained manual answer translations in the language catalog. The real UI rejected
the preserved French answer. A red regression reproduced that failure; the
packaging-map regression also failed before implementation.

Packaging now publishes each string answer's exact catalog ID using the existing
shared answer-ID constructor and established legacy generated-key namespace.
The reader's free-text validator reads that ID from the active language catalog.
It does not derive ownership from DOM position, reorder sections or mutate the
source answer map. Navigating pages replaces the map; pages without answers clear
it. Other activity validators continue to use their structural answer rules.

The documented compatibility choice is conservative: missing or blank catalog
translations fall back to the source answer; an explicitly open-ended source
stays open-ended; an older export with no map retains its source grading behavior
until repackaged. Usable retained translations remain usable with their existing
warnings. This does not certify freshness, regenerate content or add a repair
migration. Protected text, raw HTML, answers and history are preserved.

Packaging format advances from 13 to 14 so cached pre-fix exports regenerate.
Regression coverage includes language changes, same local answer key under two
owners, missing/blank translation, source open-ended behavior, older exports
without a map, legacy generated IDs, non-text answer values and map reset on the
following page. No new user-facing strings or dependencies were introduced.

These are implementations of existing usability/preservation requirements, not
changes to numbered ACs or spec approval. They do not resolve the separately
deferred historical blank-drift repair or promise recovery of arbitrary scripts.

## Production differences and qualifications

The fixtures use real storage, canonical/historical section-ID shapes, absent
ownership fields, exact content-leaf IDs, independent manual translations,
multiple entity versions, and retained physical assets. The added activity has
an explicit synthetic container and two content leaves. Its input intentionally
omits `type`; that is valid HTML, not malformed fixture data. Tiny PNGs and tone
audio do not establish customer layout, voice quality or provider semantics.

An initial trial used a nonhistorical arbitrary section ID and incorrect container
shape. It was excluded and repeated in a fresh correctly shaped fixture. The
successful structural/export evidence is from `sequence-legacy-valid`. The valid
fixture's post-open read-only snapshot was not captured separately; this round
does not claim a new stand-alone proof of opening without ownership writes.
Existing automated read-only resolver tests passed in the full suite.

During the runtime repair, an API restart used the primary checkout's reader
assets because of its working-directory default. That trial was excluded from
final runtime acceptance. The server was restarted with explicit worktree asset
paths, repackaging repeated through the UI, and both Preview/export assets checked
against final build bytes. This distinction matters: a source build alone was
not sufficient proof of what the browser ran.

The regular Chrome profile again stalled on an embedded Preview load, while the
same reader opened directly and the isolated private-window Preview completed.
Only one tab used this localhost origin in the observed inventory; a connection
limit or extension explanation is **not established**. The clean-profile journeys
pass, but the original-profile first-load stall remains an unresolved verification
qualification. No speculative Preview/networking change was made or claimed fixed.

## Final checks

| Check | Result |
|---|---|
| `pnpm test`, including pretest build | **Passed: 357 files / 4,427 tests**, 215.48 seconds |
| Focused reader and packaging suites | Passed: 149 tests in two files; included in full-suite count |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed |
| `pnpm lint` | Passed; zero errors and eight unused-disable warnings |
| `pnpm build` | Passed; final runtime rebuilt and exercised |
| Lingui extraction and strict compilation | Passed; 3,761 messages in each of five locales, zero missing, no catalog delta |
| Fresh macOS arm64 unpacked Desktop build | Passed; ad-hoc signature, notarization skipped; packaged reader bytes equal final build |
| Final whitespace/source review | Passed; no new unresolved defect identified in the bounded repaired paths |
| Dedicated invariant command | None exists; applicable invariant tests ran in the full suite |
| Clean Docker `app` build | **Blocked**: fresh Docker 29.8.0 VM check reports 139.0G total, 135.5G used, zero available, 100%; no pruning/build attempted |
| Fresh independent reviewer for these two new repairs | **Not run**; final source review was by the implementing agent. Prior independent reports retain their original scope/date. |
| Full Electron-window UI, signed release, live-provider quality, hosted CI for local commits | **Not run** |

All production/test edits preceded the final full suite. This report follows as
documentation only. The fresh Desktop result is packaging/artifact evidence, not
Electron-window or release certification.

## AC-to-evidence matrix

“Passed slice” is evidence for implemented behavior, not the full original
contract. “Blocked full contract” retains existing deferrals or acceptance gates.
The two failed reader behaviors were repaired and their final checks pass.

| AC | Status | Evidence and remaining boundary |
|---|---|---|
| 1 | Passed slice; blocked full optimization | Full cosmetic-save suite; fresh provider-free saves. No-op Save optimization deferred. |
| 2 | Passed slice | Current scoped/preservation suites; exact unselected entries and other language retained after audio retries. Earlier changed-text worked example not replayed. |
| 3 | Passed slice | Glossary/image-consumer suites pass; no new real UI glossary/image example in this round. |
| 4 | Passed slice; blocked legacy repair | Fresh duplicate/delete/restore, disjoint IDs and owner-specific grading. Positional, pruned-leaf and malformed-ID recovery deferred. |
| 5 | Passed slice | Canonical input/context suites; fresh owner-map identity checks. Same media ID with changed bytes remains an accepted limitation. |
| 6 | Passed slice; blocked classification | Warning/missing-input suites; usable retained answer and missing-translation fallback in UI. Systemic preparation classification deferred. |
| 7 | Passed slice; blocked historical acceptance | Fresh lost acknowledgment, manual speech/answer preservation, structural restore and actual translated grading. Original books remain pending. |
| 8 | Passed slice; blocked measurement | Actual transport counts prove Skip retry reuses audio. Large-book measurement/cache work deferred. |
| 9 | Passed slice; blocked broader guarantees | Actual successful commit/lost response/stale retry; guarded publication suites. Uncertain writer recovery deferred; competing authored-source screens belong to SPEC-0002. |
| 10 | Passed slice; blocked publication ordering | Fresh canceled/Skipped late response cannot change output entries; history/assets retained. Audio-before-timings work deferred. |
| 11 | Passed slice; blocked release gate | Fresh physical byte preservation and unpacked Desktop artifact pass. Clean Docker build blocked. |
| 12 | Passed slice; blocked historical acceptance | Fresh Preview interaction and actual exported ZIP, distinct activities and final runtime bytes. Original-book acceptance and profile-specific load qualification remain. |
| 13 | Passed slice; blocked classification | Requested-language/manual/fallback suites; fresh manual speech retained across cancellation. Provider-wide classification deferred. |
| 14 | Passed slice | Fresh cancel retry regenerates; Skip retry reuses valid cached audio, with transport calls counted. Live-provider quality not run. |
| 15 | Passed slice; blocked bulk endpoint | Inline generation/Skip, failure/conflict feedback and Preview/export disclosure seen. Bulk endpoint deferred. |
| 16 | Passed slice | Fresh in-flight cancel/Skip and subsequent recovery; complete exclusion suites pass. Not every exclusion UI variant replayed. |

## Remaining acceptance

The ledger still accounts for 61 feedback obligations since the last review
request plus ten earlier records. The 15 accepted deferrals remain unchanged:
uncertain writer recovery; audio-before-timings; systemic preparation
classification; large-book measurement/projection caching; no-op Save; server
quiz plan; ownership repair; positional activity identity carry-over;
pre-schema-14 compatibility; pruned-leaf ownership; bulk review; unassigned
sign-video listing; Storyboard caption editing/mirroring; stale-page Storyboard
selection; historical blank-drift repair. Their follow-up drafts and merge-time
filing requirement remain in force.

Original De-codable pg006 remains assigned to elasticsounds. Frankenstein,
ancientegypt-2, named integration approval, Tanzania doctor field validation and
applicable release verification remain pending. This round increases confidence
in the tested action sequences and reader compatibility; it does not erase those
gates or establish the original full spec as complete.

Raw local evidence remains outside Git in the primary checkout:
`.local-docs/spec0001-sequence-e2e-20261020/`. It includes the plan, PR snapshots,
red/green/full checks, Desktop/Docker evidence, three fixture trials, HTTP and
transport logs, snapshots, screenshots, pre-fix/final downloaded ZIPs and the
256-assertion script/result.
