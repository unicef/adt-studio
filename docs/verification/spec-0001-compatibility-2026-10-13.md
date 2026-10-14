# SPEC-0001 compatibility follow-up — 2026-10-13

**Historical checkpoint:** the AC-7/12 blocked conclusion below is superseded by
[the gap-closure implementation and evidence](spec-0001-gap-closure-2026-10-13.md),
which adds historical-format recovery and explicit guarded ownership repair.

Implementation target: PR #879, starting at `618153d3`, base `develop`
`0b18602f`. The user authorized both compatibility fixes, autonomous decisions,
independent review, full checks and same-PR publication. Human specification
approval remains pending; the PR title/body must remain unchanged.

## Decisions and assumptions

- Restore Quiz, Glossary and TOC attempt resets after substantive Sectioning or
  Storyboard source changes. These generators remain outside catalog freshness.
  Preserve every saved entity version and physical asset. Catalog-managed stage
  attempts retain their existing history. Cosmetic/source-equivalent saves do not
  reset these stages. Storyboard's own existing reset policy stays separate: a
  Sectioning-only appearance edit still needs its HTML rendered; a saved matching
  rendering can retain completion. Apply the source rule consistently to authored, assistant,
  rerender and pipeline/CLI publication, and source-version restoration. Applying
  it to substantive rendered-text changes clarifies the old policy: develop's
  Sectioning path reset all dependents, while its rendering-only path did not
  reset these three generators. Retained TOC content must remain editable.
- A single-item Gemini request under page batching may synthesize just that item
  when no OpenAI alignment key is available and word highlighting is disabled.
  Persist this explicit exception alongside the actual per-item input signature.
  Unchanged audio remains reusable even if an alignment key becomes available;
  neighbor text is not synthesis context for this artifact. Actual page batches
  still use ordered page context and require alignment. Enabling highlighting
  retains its separate timestamp requirement; it does not invent timing data.
- Source-entity publication and attempt resets share a transaction. Existing
  spread extraction can publish added pages before later recording preservation
  fails; reset with each committed membership change, retaining prior source and
  recording on that failure. An unchanged spread request or a failure before any
  source publication keeps attempts. Extract's existing page-retirement policy
  is outside this compatibility fix and is not claimed to be a new rollback design.
- These are user-authorized compatibility choices, not reviewer/spec approval.
  Existing narrow unprovable-owner and divergent Easy Read assumptions remain
  documented in the earlier ledger; this follow-up does not silently ratify them.

## Acceptance mapping before editing

| AC | Current behavior / required change | Concrete verification |
|---|---|---|
| 1 | Cosmetic catalog freshness works; source-stage reset must distinguish semantic edits | Cosmetic/no-op HTTP save and source comparison, no provider calls, unchanged attempts |
| 2 | Protected source/derived work remains; resets must not delete it | Retained manual Quiz/Glossary/TOC and catalog content/history assertions |
| 3 | Glossary/image discovery unchanged | Existing glossary/catalog integration suite |
| 4 | Stable identity unchanged; structural changes reset separate generators | Clone/delete/prune/reorder/restore identity and attempt assertions |
| 5 | Item route currently requires page signature; add truthful item exception | Actual item signature; own input/settings versus neighbor change; page-mode regression |
| 6 | Usable warned inputs unchanged | Core TTS/shared-source integration suite; highlighting guard |
| 7 | Protected/legacy content unchanged; narrow owner exception persists | Preservation/version tests; retained TOC editor test; qualified status retained |
| 8 | Gemini-only page preference currently fails; allow reusable item audio | Count real stubbed HTTP TTS/Whisper calls on repeat and stage reuse |
| 9 | Existing publication guards retained | Rejected source save rollback; concurrent single-item input mutation |
| 10 | Immutable audio publication retained | Cancel/failure/concurrent rejection preserves active and historical files |
| 11 | Source restoration needs corresponding source-stage reset | Restore pointer, unchanged downstream versions/assets; speech history suite |
| 12 | Disclosure unchanged; narrow owner exception persists | Existing Preview/export regressions and retained source content |
| 13 | Core TTS fallback separate from synthesis batching | Shared-source/fallback suites; Gemini item only with usable requested-language input |
| 14 | Preparation retry rules unchanged | Checked/failed/never-attempted and audio reuse regressions |
| 15 | Source-stage indicators need reset without hiding content | HTTP attempt state plus mounted TOC retained-content test |
| 16 | Skip/exclusion/cancellation behavior unchanged | Existing scoped execution and new canceled single-item regression |

## Implementation and independent review

Runtime source is frozen at `285f3d82a2ad27b35346cdcba5bcdcfcf470bf1a`.
The subsequent evidence commit changes documentation only. This work preserves
elasticsounds' published changes and uses the existing catalog, publication guards,
writer admission and rendering ownership resolver; it adds no locking subsystem.

The source reset steps are derived from `PIPELINE`. Publication routes, assistant
edits, mirroring, rerendering, pipeline/CLI writes and source restore use one
transactional helper. Spread membership publication resets the same three attempts
inside the corresponding page transaction. Retained TOC is shown even when its
attempt has reset. No Studio strings changed; extraction produced no catalog diff.

Gemini's single-item result carries `pageBatchFallback: "single-item"` with its
actual item signature. Ordinary reuse and later key availability keep that audio;
changed own input/settings require new work. Actual page results still depend on
ordered neighbors. Word highlighting still requires separate alignment evidence.

Independent review exposed and rechecked these corrections:

- Mirroring and spread membership also need source-generator resets. A spread
  can partially publish before a later failure, so resetting only on HTTP success
  was insufficient. Real SQLite/filesystem failure injection now covers this.
- Retiring active speech identities must preserve catalog-managed attempt history.
  The previous test expecting a TTS reset was corrected to the retained-history
  contract; active retirement and physical-asset assertions remain.
- Sectioning-only palette changes must still reset Storyboard rendering, while
  leaving Quiz/Glossary/TOC alone. The existing rendering policy is preserved.
- Cosmetic assistant/mirror edits must retain the exact native tree, including
  hierarchy, pruned content and heading metadata. The initial generated-tree
  fixture hid this problem; native flat and nested fixtures now expose it.
- Source equivalence compares text per stable ID, not just concatenated section
  text. Moving text between IDs resets attempts even with identical aggregate text.
- Legacy HTML may omit an owner attribute while its rendering record proves the
  owner. Canonical comparison uses the existing strict `renderedSectionId` resolver
  and normalizes redundant owner stamping. Empty, conflicting, multiple and partial
  descendant ownership remain distinct; ownership is never guessed by array index.

Live-browser acceptance then exposed a route-level gap: the initial TOC test
mounted its editor directly, while `TocIndex` and `GlossaryIndex` still hid saved
content after an attempt reset. Both entry points now use saved-row existence
alongside running/completed state. The regression tests mount the actual indexes;
a saved empty collection is still a saved row. Independent review reproduced and
fixed a related rejected-save → empty-background-refresh draft loss. The draft and
its original version now survive so retry still exercises the concurrency guard.
Quiz's existing data-based routing already retained access.

The separate reviewer gave qualified technical acceptance at `03e02752`: **8 repository tests / 3 files** and **3 independent mounted draft
cases** passed. Backend acceptance at `b0ac67e6` includes **31 repository tests /
4 files**, **7 independent native-tree/ownership cases**, and the palette HTTP
probe. Backend code did not change in the final two Studio commits. Earlier
**139 tests / 8 files** and
**5 independent compatibility cases** passed at `86857cbb`; those earlier results
are carried-forward evidence, not represented as exact-final-head reruns. No
remaining actionable correctness defect was found in the two changed contracts.

## Concurrent reviewer contribution

Immediately before publication, remote refresh found elasticsounds' new commit
`b627a755cad5c2c492fbff08dd16011f39c52fe0`: new books have a source PDF before their
first extraction creates a database, so admission must accept that contained
regular file. An empty directory or stale writer lease remains insufficient, and
queued work still rechecks existence. A normal merge preserves the original
reviewer commit and both histories; no force push or rewritten attribution is used.
Independent review of merged checkpoint `959960ee` found that its PDF fallback
could mask an escaping database symlink. A real middleware/metadata request changed
another book's SQLite database. The corrective commit `285f3d82` requires a safe
resolved database path first; PDF fallback applies only if that path is absent.
Existing non-files, dangling links and escaping links are rejected before writes.
A contained regular database alias remains valid. The reviewer's original commit
remains an ancestor with its attribution intact.

At `285f3d82`, the separate reviewer passed **5 independent probes** and **6
repository admission tests**, including the actual cross-book write, contained
alias, fresh upload and queued-deletion cases. It found no remaining actionable
issue. The implementation pass additionally ran **131 tests / 3 files** plus
typecheck successfully. Earlier 127-test evidence at the merged checkpoint does
not stand in for verification of the correction. Full repository/platform checks
were rerun after the safety correction.

## Final verification

| Command / check | Result |
|---|---|
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test --maxWorkers=6` | Passed: **331 files / 4,098 tests** at the frozen runtime; pretest builds packages/runtime |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed at the frozen runtime |
| `pnpm build`; `pnpm --filter @adt/api build:server` | Passed; final full-suite pretest repeats build; production server bundle passed |
| `pnpm lint` | Passed: zero errors, eight unused-disable warnings |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio exec lingui compile --strict` | Passed at `03e02752` (Studio/locale sources unchanged since): 3,717 messages, zero missing translations in all four target locales; five catalogs compiled |
| `pnpm lint:invariants` | Not run: this checkout has no such command. The available invariant regressions run in the full suite; no separate command pass is claimed |
| Independent review | Passed within the changed scope, with the legacy compatibility qualifications below |
| `pnpm --filter @adt/desktop build:unpack`; packaged API smoke | Passed at the frozen runtime: macOS arm64 ad-hoc package; packaged API serves the copied fixture with 230 catalog outputs and a run revision |
| Clean Docker `app` image | Blocked locally: attempted build at `d91973ec` failed during Playwright's Debian dependency install with invalid repository signatures; Docker VM had only 26 MB free. No security checks were bypassed and unrelated Docker resources were not deleted |
| Current production bundles in an existing Docker image | Passed at the frozen runtime: four worked examples, inline review/count/reload, retained editors, Preview/export, representative reader and restart; distinct from a clean image build |

The earlier Desktop packaging attempt at `32c5adf6` failed while electron-builder
parsed pnpm's dependency listing. Normal builds at `03e02752`, the merged checkpoint and final corrected runtime
succeeded; the final result is recorded above.
The earlier failure is not counted as a pass or attributed to a pre-existing defect.
The browser harness also needed two corrections: seed crop
assets before starting the API instead of opening a second WASM SQLite writer,
and expect the saved source text after the review flow changes it.
The later retained-TOC browser failure was a
real entry-point defect and was fixed as described above. None of these initial
failures is counted as a successful acceptance run.

## Runtime acceptance evidence

[Machine-readable results](evidence/spec-0001-compatibility-2026-10-13.json)
record exact runtime source, checks and qualifications. Tests use disposable book
copies and stubbed provider transport; the live browser checks make no paid calls.

- All four worked examples pass again through real API/Studio: cosmetic save,
  changed source with protected French, glossary image discovery, and stable-ID
  retirement/reactivation. Preview/export disclosure does not change review evidence.
- Inline Keep preserves manual French and unrelated translations, updates counts
  and persists through reload and container restart. Stale translation Save returns
  409 without changing the correction.
- After substantive source Save resets source attempts, the real TOC route still
  edits its retained entry and creates a new saved version without generation.
  The real Glossary route shows its retained term. Fresh upload/settings/deletion
  works before extraction, and a stale request returns 404 without recreating the
  deleted book. The representative copied book
  renders in Preview with no browser errors.
- Export downloads a valid **76-entry ZIP**, with four section HTML files and the
  retained French in both text and speech-text JSON. Speech-disabled export has
  empty audio manifests and no speech audio files; its six runtime UI sound files
  remain. The initial ZIP assertion incorrectly counted those UI sounds as speech
  and was corrected to inspect both speech manifests and media paths.
- macOS arm64 unpacked Desktop builds successfully. A separate smoke test boots
  the actual packaged API and reads its copied book, 230 output entries and run
  revision. This is a packaged API check, not an Electron GUI or installer test.

Hosted CI is checked after publication and reported in the PR review-request
comment; these local results are not a fabricated hosted result.

## AC-to-evidence matrix

`Passed` records development verification. `Blocked` below means the full literal
legacy compatibility promise is not established, even though the documented safe
fallback is implemented and tested; it does not request permission to finish these
two fixes. No acceptance criterion or human approval is silently waived.

| AC | Status | Evidence and remaining limit |
|---|---|---|
| 1 | Passed | Real source-save tests, native and legacy cosmetic assistant/mirror regressions; all output signatures/status unchanged in worked example 1 |
| 2 | Passed | Scoped/catalog preparation and retained-content suites; real worked example 2 keeps manual French and unrelated captions; source reset retains entity history |
| 3 | Passed | Glossary/image inventory tests and worked example 3 discover new image work without Storyboard edits or invented caption consumers |
| 4 | Passed | Clone/prune/delete/reorder/restore and strict owner tests; native hierarchy/heading/pruned metadata retained; worked example 4 retires/reactivates stable identities |
| 5 | Passed | Canonical signature suite plus Gemini transport tests for actual item versus page context, own input/model/instructions and neighbor changes |
| 6 | Passed | Shared-source/Core TTS and scoped runner regressions preserve usable warned inputs, complete phrase accounting and independent blocked work |
| 7 | Blocked: full legacy compatibility | Protected/manual/unknown-origin history, conflict/review guards and retained TOC editing are covered. Truly unprovable legacy owners are retained but omitted from Preview/export with disclosure; divergent legacy Easy Read authority remains a documented assumption |
| 8 | Passed | Actual stubbed HTTP counts prove item rerun and true whole-stage reuse issue zero extra provider calls; page context remains effective; prior representative media measurement remains in the linked closeout ledger |
| 9 | Passed | Stale versions/targets/exclusions, real transaction rollback and concurrent TTS publication tests; Docker API rejects stale translation save with 409 and retains French |
| 10 | Passed | Canceled/rejected item synthesis retains active/history/files; page-neighbor cache tests; partial spread failure retains old page/recording and resets attempts for the page actually added |
| 11 | Passed | Real filesystem speech-history and restore suites, source-pointer restoration with attempts reset and content retained, active-asset packaging tests |
| 12 | Blocked: full legacy compatibility | Usable stale output, read-only disclosure and export guards pass. Unknown-owner omission remains a visible documented compatibility exception rather than unconditional legacy export support |
| 13 | Passed | Requested-language Core TTS fallback/manual speech and bounded failure regressions; Gemini-only item synthesis is restored without inventing alignment |
| 14 | Passed | Never-attempted/failed/checked preparation and explicit retry rules retained; unchanged fallback/audio reuse and failed synthesis preservation verified by transport-backed tests |
| 15 | Passed | Review actions, counts/remount/refetch suites, retained TOC component test, live inline Keep/count/reload walkthrough; extraction/compilation passes for all five locales |
| 16 | Passed | Scope/skip/cancel/exclusion and late-publication regressions; changed source/retirement retains catalog attempts and historical content |

## Completion and limits

**Both requested compatibility fixes are fully implemented.** Confidence is high
for these changed paths after independent counterexample review and full repository
checks. SPEC-0001 as a whole remains a **qualified implementation**, not an
unconditional full acceptance claim: AC-7/12 have the documented legacy-owner
exception and the existing legacy Easy Read authority assumption. Human spec review
remains pending. These decisions are documented for review, not marked approved.

This follow-up does not change the reviewed media policy: ordinary freshness/reuse
reads and packaging keys avoid media-byte hashing. Write-time identity, explicit
restore and one-time legacy snapshot verification remain; existing multimodal LLM
cache keys and PDF extraction are outside this correction. No repository-wide
media-hashing ban or paid-provider quality/billing certification is claimed.

Clean Docker builds, signed installers, notarization, Windows/Linux installers,
Desktop GUI behavior and a release certification are distinct checks. No live
paid provider was called. The development checks and bundled runtime acceptance
do not establish release approval.

