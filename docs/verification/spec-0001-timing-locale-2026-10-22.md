# SPEC-0001 timing and locale regression corrections — October 22

Implementation commit `331bffd4`, following `cd39f6f7`, on `spec/735-per-section-staleness` for PR #879.
The two extra-regression findings are fixed; SPEC-0001 remains in review. This
record does not change the earlier deferred scope or historical-book acceptance.

## Behavior and safety decisions

- Independently opened timing entries can save into a newer language collection
  only when their complete raw target and failure records match an actual older
  saved version and their recording receipt still matches. Other entries and
  unknown entry/collection metadata survive. Changed targets, recordings,
  future/missing baselines and ambiguous identities still return 409.
- The first physical snapshot of legacy audio may change a sibling draft's
  filename/hash representation. A retained `legacySnapshotOf` relation and its
  paired timing version must prove that change; a filename alias alone is not
  enough. The existing publication service creates the physical snapshot only
  on writing. These speech reads do not snapshot, hash media or create versions.
- Speech selection uses normalized language keys, while playback uses the actual
  `storageLanguage` directory. Both LanguageView players, shared playback and
  live snapshots follow the same read contract. Canonical data wins even when
  empty, malformed or represented by an imported SQL NULL invalidation.
- A hash-only older client cannot distinguish equal versions in coexisting
  canonical/legacy chains. It receives 409 there and needs a namespace-bound
  receipt. Hash-only saves remain compatible when that ambiguity is absent.

These clarify AC-7/9/11/12. No new locking, migration, provider calls, media-hash
freshness mechanism or dependency was introduced. Same-target conflict rejection
and draft retention remain deliberate. Earlier deferred work is unchanged.

## Regression evidence

The initial 14-case API regression file reproduced seven failures on the
pre-fix implementation after correcting its required config fixture. The final
expanded focused run passes 98 tests across six files. It covers real SQLite,
physical files, both voice slots, unknown metadata, old clients, failed targets,
changed audio, missing/future history, forged aliases, damaged snapshot links,
canonical precedence and live responses. Existing rollback and duplicate-request
regressions remain green. The independent reviewer ran 33 of these tests
separately, reviewed the whole correction diff and UI evidence, and reported no
remaining actionable findings after the preservation and namespace fixes.

Final full suite: **4,589 tests, 371 files passed**, including `pnpm build`.
`pnpm typecheck`, runtime typecheck, lint, Studio build, Lingui extraction and
strict compilation passed. Lint retains the eight previously established unused
suppression warnings; all five locale catalogs have zero missing translations.
No standalone invariant-check command exists. No changed Studio strings.

The first full run had one failing new fixture: it copied canonical metadata
without the physical audio. The API correctly refused the save. The fixture now
copies the recording, and the entire final suite passed. The earlier failure is
retained in local evidence rather than reported as a product regression or pass.

## Real UI and packages

Chromium drove the built Studio against the real Hono API, SQLite and valid PCM
WAV recordings. Final runs pin PROJECT_ROOT to this worktree: the local API's
ordinary default assumes execution from apps/api, so a launcher from the nested
worktree root initially used outer-checkout reader assets. The artifact comparison
caught this; final checks use explicit branch resources and fresh book copies.
The provider-warning check also waits for the asynchronous pages response before
asserting its visibility; the initial premature assertion remains recorded.

- Fresh hashless legacy and immutable modern books: edit two rows, Save & leave,
  both return 200, navigation completes, both saved values persist, and other
  voices/languages remain unchanged.
- Legacy `pt_BR` storage selected as `pt-BR`: controls appear, real WAV decoding
  advances playback, timing save succeeds and reopening shows the correction.
- Delayed successful response followed by a newer unblurred draft: draft remains
  through response/refetch/collapse; subsequent save uses its own acknowledgement.
- A competing writer changes the same target: UI receives 409 and retains the
  draft. HTTP 503 also preserves the draft and permits retry. Keyboard timing
  adjustments and clamping remain functional.
- Repeated develop-integration journeys: provider onboarding and return to Add
  Book, populated-book extraction refusal with/without a provider, real Preview
  reader and downloaded two-language Web export. Provider health is stubbed at
  its HTTP boundary; no generation/transcription occurs.

Unpacked macOS arm64 Desktop build passed with ad-hoc signing. Its actual bundled
API opened a copied legacy book without changing history, served matching audio
bytes, saved two drafts with 200/200 and preserved six original audio files,
original rows and the other voice. This does not certify the Electron renderer,
installers, signing/notarization or other operating systems.

The combined Docker `app` build and its real browser journey passed. Image:
`adt-spec0001-timing-locale-oct22:local`. Through nginx and the bundled API,
legacy playback advanced without media errors, two original drafts returned
200/200, Save & leave completed, and reopening showed both corrections. Other
voice timings, original history rows and six audio files survived; no provider
calls or browser page errors occurred. The first build failed apt signature
verification with the Docker filesystem at 100% usage; unchanged `node:22-slim`
passed apt. Removing only this task's unused prior API image allowed the unchanged
build to pass. No Dockerfile change, broad prune or signature bypass was used.
The separate API-only image, Windows/Linux Desktop and signed release builds were
not repeated in this correction.
Final Preview/export artifact checks passed: all 17 protected history rows, the
manual French correction and original audio files stayed unchanged. Twenty
exported audio files matched their originals byte for byte; both reader bundles
matched this branch's current build; no provider log entries were added.

## Acceptance and limits

| Contract | Status in this correction | Evidence |
| --- | --- | --- |
| AC-7: legacy/manual use and recoverable drafts | Passed for affected journeys | Legacy and canonical playback; retained pending/failing drafts; unchanged manual neighbors. |
| AC-9: safe collection publication | Passed | Actual historical target comparison; snapshot proof; conflict and damaged-evidence tests; concurrent real UI saves. |
| AC-11: physical history | Passed for affected journeys | Original files/rows, dual voices and rollback regressions; bundled API preservation. |
| AC-12: usable output and disclosure | Passed for affected journeys | Locale selection/playback and unchanged preview/export content. |
| Other ACs / four complete worked examples | Regression suite passed; exhaustive product acceptance not repeated here | No new full-spec certification is inferred from these corrections. |
| Private historical books / live provider quality / hosted CI / signed releases | Not run | De-codable pg006 remains assigned to elasticsounds; no PR push or CI trigger. |

No known remaining defect in the two corrected workflows after independent
review. The broader approval and historical acceptance limits in the verification
ledger remain. Local evidence: `.local-docs/spec0001-timing-locale-fixes-oct22/`
(outside this branch's Git history), including scripts, logs, JSON results,
screenshots and the failed diagnostic runs. Nothing was pushed or posted to PR879.
