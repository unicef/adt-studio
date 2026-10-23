# SPEC-0001 completion audit — 2026-10-12

Implementation is authorized; human specification approval remains pending. This
audit starts at `c2742aeb` on `develop` `410d4b2f`. Prior test results establish a
baseline, not acceptance of the changes below. The earlier stage-status deferral
is lifted by the user's instruction to complete the contract. The PR body and
title remain unchanged.

## Pre-edit acceptance and verification map

Every criterion is rechecked against the published narrative and four examples.
The separate reviewer built an independent requirement map before seeing our
acceptance report. Newly discovered defects must be corrected and re-reviewed.

| AC | Current behavior and required work | Concrete verification for this pass |
| --- | --- | --- |
| 1 | Catalog signatures preserve cosmetic changes, but Save still resets downstream attempt records. Remove that reset without weakening Sectioning's own stale-render guard. | Real storage/API cosmetic Save preserves attempts, output projection and physical assets; sidebar remains current; zero provider calls. Example 1. |
| 2 | Per-entry protection and actual-input reuse exist. Save/status integration is incomplete. | Changed source affects only consumers; protected French survives, Keep resolves source-linked warnings, unchanged audio is reused; statuses survive reopening. Example 2. |
| 3 | Glossary/image reconciliation exists with stable glossary IDs. | Re-run glossary-only text/new-image/shared-image tests; check group and stage summaries. Example 3. |
| 4 | Retirement, restore and duplicate-ID guards exist. Shared Easy Read references currently collide across section contexts. | Shared source in different sections converges with stable identity and complete locations; protected legacy output retained; delete/add/restore tests. Example 4. |
| 5 | Canonical input signatures exist. Easy Read shared context and single-item Gemini page speech disagree with their consumers. | Context edits affect every actual consumer; cosmetic changes do not; direct speech route is current immediately after generation and preserves neighbors. |
| 6 | Expected work and inherited warnings exist. Corrupt audio is detected but the runner incorrectly reuses it. | Real corrupt-file rerun repairs playable generated audio and matching timings; genuinely missing input blocks only its work. |
| 7 | Version/source guarded edits and reviews protect manual/unknown work. | Re-run API/storage keep/edit/replace/restore conflict tests; derived summaries respond to review without changing authorship. |
| 8 | Scoped selection and LLM cache exist, but corrupt audio/shared Easy Read can prevent convergence. | Count transport calls for first run, cache repair, no-op and context change; retain previous media measurement with its limitations. |
| 9 | Captured-input publication guards and collection merges exist. Shared Easy Read and direct speech need matching identity/context. | Scoped run changes only selected outputs; concurrent source/target/exclusion edits reject publication; selection through either shared location works. |
| 10 | Immutable publication and cancellation guards exist. Repair must not overwrite a corrupt historical destination. | Corrupt immutable destination preserved; repaired output uses a new physical file; failure/cancel/late result retains prior manifest/assets. |
| 11 | Physical asset/history restoration exists. | Re-run asset/cache-deletion/restore/package invalidation integration tests after repair changes. |
| 12 | Preview/export disclosure exists under current gates. | Browser preview/export includes stale usable content with disclosure; review evidence unchanged; package assets readable. |
| 13 | Requested-language fallback and manual speech preservation exist. | Re-run failed/missing/outdated/disabled preparation and no-cross-language fallback tests. |
| 14 | Persisted fallback basis and explicit/relevant-change retry exist. | Count actual preparation/audio transport calls for unchanged fallback, explicit retry, identical success and synthesis failure. |
| 15 | Inline/bulk review exists; sidebar only counts absent translations/audio. Use the shared output projection for stage counts and affected-item navigation, preserving attempt states separately. | Missing/outdated/protected/fallback/excluded counts, Save/review/refetch/restart, warning navigation, queued/running/error presentation; five locales. |
| 16 | Skip, exclusion, cancellation and restore guards exist. | Re-run skip/late publish/prune/restore tests; disabled/retired work excluded from stage counts. |

Narrative checks also cover optional preparation and audio visibility, source
warning resolution, primary-issue filtering, complete page/section/group
membership, preserved editor access, CLI safe refusal for unsafe existing-book
resume, metadata-only legacy opening, and unchanged manual authorship. Automatic
Storyboard/Sectioning freshness and glossary/quiz/TOC generation remain non-goals.
No full completion or release certification is claimed by this pre-edit map.

## Implemented corrections and independent review

Runtime commits are `bb00dd96` (ownership, preservation and scoped convergence),
`cca752a4` (shared freshness/status UI) and `9d8bde0d` (paired selection and
failed-only speech visibility). No descendant branch was merged into #879. The
existing PR title/body are preserved; the follow-up belongs in a review comment.
Source issues #735/#131 and coordination #733/#736 are informational references.

The separate, read-only reviewer built its own spec/narrative map, reproduced
counterexamples, and rechecked fixes. This pass corrected:

- Save resetting downstream attempts despite unchanged content; stage attention
  ignoring existing stale/protected output. Content currentness now comes from
  the shared projection, while running/queued/error attempts remain separate.
- Old rendering paired with newly ordered source sections. A shared owner
  resolver rejects position and moved-leaf inference in catalog, Easy Read,
  image inventory, reading order and packaging. All rendering producers stamp
  stable ownership. Aligned fixtures now record their owner explicitly.
- Shared Easy Read generated twice with alternating section signatures, divergent
  retained copies, and stale original text. One stable output uses all actual
  context, retains protected authority, and exposes all current locations.
- Direct Gemini speech using different page context from catalog freshness;
  direct Easy Read publishing after source/prompt changes or cancellation.
  Both public routes now use shared context/publication guards.
- Corrupted audio incorrectly reused. Verified cache repair publishes a new
  immutable file, preserving the corrupted historical destination and matching
  timings. Same-stat image changes now invalidate packaging by actual bytes.
- Shared output filters losing the page/section pairing, and failed-only speech
  disappearing from the sidebar after an attempt reset. Actual location pairs
  survive text/image/conflict projections; speech surfaces share current TTS
  evidence and the same visibility policy.

The independently exercised backend set passed 87 tests across 14 files at
`bb00dd96`, plus eight retained counterexample executions and nine ownership
shape checks. The final `9d8bde0d` recheck passed 83 tests across six affected
files and the separate mounted-component reproduction that previously failed.
No remaining runtime defect was reproduced in those reviewed paths. The reviewer
independently traced all ACs, but did not independently run full browser walks,
Docker/Desktop, hosted CI or representative measurements. Those checks below
are author-executed and must not be described as independent.

## Compatibility assumption and acceptance boundary

**This is a qualified implementation, not unqualified completion of the
original full spec.** All four implementation slices are present. The earlier
AC-1/2/15 status deferral is closed. One legacy compatibility edge remains under
a documented safety assumption, also recorded in the specification without
changing its acceptance criteria or approval status.

For a legacy rendered section with no provable owner, or contradictory owner
evidence, current source position or moved leaf IDs can attach a retained manual
answer to the wrong section. The selected fallback preserves raw content, entity
history and physical assets, omits the unverifiable section from preview/export,
and discloses the omission. It does not infer an owner or generation provenance.
The user authorized best judgment for this edge and required documentation.
Ordinary owned legacy content missing freshness evidence remains usable and
protected. AC-7/12 remain **blocked for this narrow compatibility edge** pending
spec-owner ratification of the clarification or a safe repair workflow. No
approval is fabricated and no criterion is waived by a passing safety test.

## Final AC-to-evidence matrix

“Passed” below means the stated development behavior is exercised, not human
approval or release certification. Every row is also subject to the platform and
provider limits below. AC-7/12 explicitly retain their original-contract gap.

| AC | Status | Concrete evidence |
| --- | --- | --- |
| 1 | Passed | `catalog-freshness.test.ts`: real Save preserves attempts and projection on cosmetic edits, while relevant-input changes affect consumers; Docker cosmetic Save. No provider calls on Save. |
| 2 | Passed | Source-change/manual-French API cases, shared Easy Read tests, scoped speech transport no-op reuse, review/refetch UI; Docker source edit → sidebar → inline Keep → reload. |
| 3 | Passed | `glossary-identity.integration.test.ts`, catalog freshness glossary-only/shared-image inventory cases: stable definition IDs, independent discovery, no invented glossary caption consumer, unrelated output preserved. |
| 4 | Passed | `rendered-ownership.integration.test.ts`, catalog reconciliation/retirement/restore and shared Easy Read tests: actual stable owners and references, no positional reassignment; raw/history retained when ownership is unknown. |
| 5 | Passed | Canonical signature tests, Easy Read all-context cases and direct Gemini route integration: relevant model/prompt/voice/context changes differ; cosmetic/version-only changes do not. |
| 6 | Passed | Catalog expected-output/inherited-warning cases; scoped runner continues usable work; corrupt-audio recovery uses verified bytes; missing inputs affect their consumers only. |
| 7 | Blocked — legacy edge; ordinary paths passed | Guarded Keep/Edit/Replace/restore API/storage tests and Studio review; protected authorship/history remain. Unverifiable-owner export compatibility requires ratification/repair as stated above. |
| 8 | Passed, measured with limits | `catalog-execution.test.ts`, `scoped-speech.integration.test.ts`, `speech-timing-refresh.integration.test.ts`: actual stubbed transport calls for no-op/cache/fallback/context cases; real-book read measurement below and historical media measurement linked. |
| 9 | Passed | `output-entrypoints.integration.test.ts`, catalog execution and scoped speech tests: exact selected merges, direct-route context, source/target/prompt/config races, unselected neighbors retained; paired-filter API/component regression. |
| 10 | Passed | Real immutable files, writer admission, cancellation/late-publication/failed-synthesis regressions; active audio/timing manifests and unselected physical assets survive rejection. |
| 11 | Passed | `speech-history.test.ts` and catalog freshness packaging tests: restored physical versions survive cache deletion; same-size/mtime image changes invalidate package reuse; repaired audio never overwrites history. |
| 12 | Blocked — legacy edge; ordinary paths passed | Disclosure API/component tests and Docker preview/web ZIP: stale usable output included, disabled/missing work disclosed correctly, no approval gate or review mutation. Unknown-owner omission is the documented compatibility exception. |
| 13 | Passed | Core TTS catalog/execution tests: requested-language display fallback for missing/outdated/failed preparation; manual speech retained; no cross-language fallback or normalization when disabled. |
| 14 | Passed | Counted transport tests for unchanged fallback/audio reuse, explicit retry/relevant-change retry, identical successful preparation and synthesis failure preservation. |
| 15 | Passed | Shared API stage/page/section/group summaries; `StageSidebar`, `OutputReviewPanel`, `OutputReview`, Language action tests; failed-only speech and paired shared-location counterexamples; five locales; Docker review/count/reload flow. |
| 16 | Passed | Skip/cancel/late-publish, persistent exclusions, prune/restore and historical reactivation tests; excluded/retired work is absent from generation and attention totals. |

The four examples are covered across these layers: (1) cosmetic Save and package
freshness separately; (2) one source edit, retained manual French, all actual
Easy Read context and speech reuse; (3) stable glossary text/new/shared image
inventory without invented caption consumers; (4) delete/add/prune/restore with
stable IDs, selective missing work and historical physical restoration. The
browser pass is representative, not a claim that every provider combination was
manually exercised.

## Why the first implementation missed these cases

The initial acceptance mapping did not follow every public entry point through
persistence and the final read model. Source/render fixtures stayed aligned, so
position-dependent ownership appeared correct. Cache tests did not cover the
actual corrupt-file/reuse boundary, shared Easy Read contexts or direct-route
publication. Status completion was deferred while broader completion language
was used. Passing helper and component tests therefore overstated end-to-end
coverage. This pass keeps independent counterexamples, strict acceptance gaps and
real storage/transport/platform evidence as separate gates. The cross-spec
[gap register](block-1-gap-register-2026-10-12.md) identifies the continuation
order and unresolved work on related PRs; they are not certified by #879's tests.

## Verification on the final runtime source

Runtime source is frozen at `9d8bde0db05f7f97e8e2c99d4000f73c91d5b2fe`;
following documentation-only commits do not alter these inputs. Commands ran
with Node 22.23.2. The independent reviewer used Node 24.13.0.

| Check | Result |
| --- | --- |
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test` | **Passed: 314 files / 3,967 tests**, including the pretest build; 151.36 seconds. |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed: zero errors, eight unused-suppression warnings. |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio exec lingui compile --strict` | Passed: 3,709 messages, zero missing in en/pt-BR/es/fr/sq; repeated extraction left the committed catalogs unchanged. |
| `docker build --target app --label org.opencontainers.image.revision=9d8bde0d -t adt-studio:spec0001-completion <isolated context>` | Passed, Linux arm64 combined API/nginx image. Context excludes user books and secrets. |
| Docker API/browser/export/restart | Passed on isolated copies: cosmetic Save projection unchanged; stale French Save returns 409; usable stale preview; 78-entry two-language web ZIP passes CRC and contains styles/freshness disclosure; disabled speech excluded; export changes no review evidence. Source edit → actual sidebar dialog → inline Keep reduces warnings 30→29, preserves manual French/unrelated translations, survives reload and container restart. No browser page/HTTP-500 errors or generation requests during review. |
| Legacy-owner browser flow | Passed: unverifiable pg001 section omitted by stable ID, retained pg002 displayed, ownership warning in Preview and export options, raw rendering/projection unchanged on read; explicitly restoring the captured known-owner version removes the warning and restores pg001. Ordinary representative legacy book previews successfully. |
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools SKIP_NOTARIZE=ALL CSC_IDENTITY_AUTO_DISCOVERY=false npm_config_cache=/private/tmp/spec0001-npm-cache pnpm --filter @adt/desktop build:unpack` | Passed, unsigned macOS arm64. API starts from the actual packaged Resources directory with packaged prompts/config, returns HTTP 200 and 230 synthetic /129 representative outputs with no ownership warnings. Process shut down after the check. |
| `git diff --check` | Passed. |
| Invariant checks | Available coverage is included in tests/types/lint. `pnpm lint:invariants` is documented as planned and is not an available command. |
| Hosted CI | Separate publication gate: verify the final pushed SHA and report its actual results in the PR comment; these local results do not certify a future CI run. |

Docker image ID:
`sha256:446fbfabb6347f3fa181574c40819157ed1fd9d442e9f8acb3553d481a968d43`.
Only this task's container and isolated book copies were used. Temporary logs,
JSON reports, browser screenshots and ZIP are retained under
`/private/tmp/spec0001-completion-*`; independent logs and reproductions under
`/private/tmp/spec0001-independent-repros/`. These are local evidence artifacts,
not files promised to exist on another reviewer's machine.

The first final-suite command accidentally omitted `DEVELOPER_DIR`; 22 tests in
two release-script files failed at Git startup under this Mac's Xcode license
gate. The corrected complete run above passed; no application change or claim of
pre-existing test failure was used to dismiss it. An earlier Desktop packaging
attempt failed parsing its dependency-tree output; independently checking that
command returned valid JSON, and the retry plus final frozen build passed.
The legacy browser harness initially matched text repeated on all four fixture
pages and looked for disclosure before opening export options. Stable-ID
assertions and the actual export dialog corrected those harness assumptions;
no runtime change was made to fit them.

### Representative read measurement

An isolated copy of the existing `momograde1` book contains 20 pages, 37 image
files (27,163,572 bytes), 16 reading-order items and 129 applicable outputs.
Three final read samples took **196 /166 /166 ms**, with sampled process RSS
**315,342,848 /321,585,152 /352,600,064 bytes**. The version fingerprint remained
unchanged, no ownership warning was present, and provider calls were zero.
Its Docker preview also rendered the actual book cover. These sequential local
samples are not a latency SLO, controlled cold-cache study or peak-memory claim.
The earlier 120-page/396-MB retained-media measurement remains historical
[evidence](spec-0001.md#retained-media-measurement), not a new final-head run.

**Not run / not claimed:** live paid-provider quality or billing; complete
Electron GUI walkthrough; signed/notarized installers; Windows/Linux desktop
packages; long-history production growth; release certification. Existing-book
CLI reruns use the documented safe refusal where shared preservation-aware
resume is unavailable in this PR; full safe CLI resume remains SPEC-0010's
implementation. No separate locking, freshness or rendering subsystem was added
to bypass that dependency. Human specification approval remains pending.
