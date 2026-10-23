# SPEC-0001 develop integration — October 22

The local integration of `develop` preserves the SPEC-0001 review fixes and the
upstream provider-onboarding changes. No blocking integration defect was found
by the independent review or checks below. This is evidence for the integration,
not a declaration that every original acceptance journey or release target has
been certified. SPEC-0001 remains in review; ADR-024 remains proposed.

## Scope and history

The merge has two parents:

- Local SPEC-0001 head `8d77605597e99df196a523f7de596c87c07bafd0`, including the
  three local commits that address the timing, pending-draft and test-harness
  findings documented in the [preceding correction record](spec-0001-oct22-timing-corrections.md).
- Refreshed `develop` at `ff64067017d0e8f965000dd833f455cb41c251b4`, including
  [provider onboarding PR #975](https://github.com/unicef/adt-studio/pull/975).

The common ancestor was `0efe1c2501a478049701fd221ab94fc97cdf50aa`. A normal merge
retains both histories; no rebase or force push is needed. The recovery ref is
`backup/spec-0001-before-develop-20261022-8d776055`. The remote PR head was still
`c8553add731ef6338b8b747e96fa30047ce04ab7` when rechecked after verification.
All work remains local; no PR metadata, comments or review requests were changed.

The four conflicted components retain both contracts:

- Extract keeps upstream provider readiness and Connect actions while preventing
  re-extraction over an existing populated book and displaying its preservation warning.
- Sectioning and Storyboard keep the provider notices and the existing page-read
  error guards.
- Five locale catalogs retain both parents' translations. Lingui extraction and
  strict compilation report zero missing translations in every supported locale.

Automatically merged landing, quiz and speech surfaces were also reviewed. The
earlier timing API, shared schemas, client, LanguageView, WordTimestampViewer
and specification corrections are unchanged from the local first parent.
`ExtractView.provider-compatibility.test.tsx` adds three regressions using the
actual run card and missing-provider notice: populated idle/error books remain
protected across readiness changes, while an empty failed book can retry after
provider connection. No dependency or lockfile changes were needed.

## Checks

Environment: macOS, Node 22.23.2 and pnpm 10.32.1. Provider credentials were
removed from the automated test process. All runtime changes and the new
regression file were present for the full suite; only this evidence and its
index links were added afterward.

| Check | Result |
| --- | --- |
| `pnpm test`, including the `pnpm build` pretest | Passed: 4,560 tests in 369 files. |
| Focused integration tests | Passed: 18 tests in five files. |
| `pnpm typecheck` | Passed. |
| `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed: zero errors, eight unused-suppression warnings. The same warning baseline was established on untouched `c8553add` in the preceding correction record. |
| `pnpm --filter @adt/studio build` | Passed; existing large-chunk warnings remain. |
| `pnpm --filter @adt/studio extract` and `compile --strict` | Passed; zero missing translations in all five locales. |
| `docker build --target app -t adt-spec0001-develop-oct22:local .` | Passed after reclaiming task-owned Docker storage; combined runtime UI checks below also passed. |
| `docker build --target api -t adt-spec0001-develop-oct22-api:local .` | Passed after reclaiming task-owned Docker storage. |
| `CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop build:unpack` | Passed: macOS arm64 app with an ad-hoc signature. No release signing or notarization. |
| Packaged Desktop API smoke test | Passed using bundled resources: one book, two pages, 77 outputs, provider endpoint HTTP 200 and both reader bundles equal to the current build. |
| `git diff --check` | Passed. |
| Separate invariant command | Not available in this checkout; none is claimed. |

The first combined Docker build failed during apt signature verification. An
untouched `node:22-slim` apt baseline succeeded; Docker's filesystem was at 100%
capacity. Removing only an unused image from the preceding task allowed the
unchanged build to pass. The API build then explicitly reported insufficient
apt cache space. After the completed combined-container checks, removing that
task's container and image allowed the unchanged API build to pass. No Dockerfile
change, signature bypass or broad Docker prune was used.

## Real UI and persisted-output evidence

Playwright 1.58.2 drove Chromium against the production-built Studio SPA and real
Hono API with SQLite and physical files. A separate browser run used the combined
Docker image through nginx. Fixtures were isolated copies, not user books.

| Journey | Verified behavior |
| --- | --- |
| Legacy timing edit | Open a hashless recording, save `0.100`, hold the actual successful response after persistence, and type an unblurred `0.200`. The newer draft survives acknowledgement, refetch and collapse; conflicting language/voice/delete controls are guarded. |
| Successor timing save | Save `0.200` using the acknowledgement's version. Manual timing persists and the second voice remains unchanged. |
| Concurrent writer | A competing API client saves `0.400`; the UI's stale `0.300` receives HTTP 409 and remains recoverable. |
| Actual navigation protection | From a `0.450` timing draft, navigate to API Key Settings. Stay preserves the draft; Save & leave persists it before navigation. |
| Provider onboarding | Continue without a provider dismisses the gate without book creation or generation. Connect focuses the provider's API-key field; saving a synthetic credential offers the return to Add Book. Provider health alone is stubbed at the HTTP boundary. |
| Interrupted populated book | Re-extraction remains disabled with a configured provider. Without a provider, the Connect notice and preservation warning coexist, and Connect remains usable. |
| Existing content without credentials | The representative two-language book opens the actual Preview reader and downloads a Web export. The same Preview/export journeys pass through the combined Docker application. |

All browser runs reported zero page errors. No generation or transcription
requests occurred. For both the local and Docker book/export, independent
filesystem/database assertions verified:

- All 17 protected source/output history rows remain unchanged.
- The manual French correction and original audio files remain unchanged.
- Twenty exported audio files match their originals byte for byte.
- Source text and the manual French text are present in the exported output.
- Both reader bundles match the current build, and no provider log entries were added.

The timing fixture covers four pages, two languages, two voice slots, absent
legacy audio hashes and valid generated PCM WAV files. The populated-book fixture
removes Extract step records while retaining content. The representative export
fixture covers stable owned sections, manual French text and retained generated
audio/timings. These shapes exercise legacy data, persisted-state and packaging
differences that a component mock cannot cover. They do not reproduce private
De-codable pg006, Frankenstein or Tanzania books, every historical ownership
pattern, every codec or live provider behavior.

## Acceptance mapping and limits

| Requirement | Status for this integration | Evidence / boundary |
| --- | --- | --- |
| AC-7 protected/legacy use and pending drafts | Passed for affected integration paths | Real hashless timing, delayed-save and navigation journeys; existing regression suite. |
| AC-9 concurrent writes and guards | Passed for affected integration paths | Real competing writer returns 409 without draft loss; populated-book guard remains effective with provider onboarding. |
| AC-11 retained assets and history | Passed for exercised preservation paths | Full storage/filesystem regressions and direct history/audio/export assertions. No recovery of previously lost assets is inferred. |
| AC-12 Preview/export | Passed for representative retained-content paths | Actual reader and downloaded exports through both local and combined Docker UI, with persisted-state and artifact assertions. |
| AC-1–6, AC-8, AC-10 and AC-13–16 | Automated checks passed; complete UI acceptance not rerun | Existing automated regressions ran in the full suite. This integration does not re-certify every branch of the four worked examples. |
| Private historical-book acceptance | Not run | De-codable pg006 remains assigned to elasticsounds; named-book checks cannot be replaced by constructed fixtures. |
| Hosted CI and integration approval | Pending publication/review | No push was made. Local checks do not constitute a GitHub CI run or human approval. |
| Full Desktop/release acceptance | Not run | Packaged API was started with Node and bundled resources; the Electron GUI, Windows/Linux installers and signed/notarized releases were not exercised. |
| Older deferred work | Excluded, not completed | The preceding correction record and spec decisions retain the staged speech-publication, provider-classifier, positional-ID/ownership-repair and performance follow-ups. |

A separate read-only reviewer examined conflict resolutions, automatically merged
surfaces, regression assertions, full-check logs, browser scripts/results,
preservation assertions and screenshots. It independently ran 16 tests across
four onboarding/readiness suites and audited locale entries against both parents.
Its final assessment found no blocking integration defect. It did not independently
rerun the entire suite or browser session, nor perform a new exhaustive audit of
every accumulated PR change.

The conflict-resolution and local verification work is complete. Publication may
proceed when authorized; merging still requires fresh hosted CI and the remaining
human acceptance/approval. This record supersedes the preceding record's pending
develop-conflict and combined-Docker-check limitations, without changing its
historical results or declaring deferred work complete.

Raw scripts, logs, results, screenshots and disposable fixtures are retained
locally under `.local-docs/spec0001-develop-oct22/` in the primary checkout, with
the original working copy at `/private/tmp/spec0001-develop-oct22/`. They are not
Git artifacts. Durable regression coverage is in the committed tests; this
document records the observed results.
