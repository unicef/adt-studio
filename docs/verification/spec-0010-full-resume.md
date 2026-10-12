# SPEC-0010 full resume continuation

> October 12 continuation: historical mode-gate and whole-stage publication claims
> below are superseded by the [authorized revised contract](../specs/SPEC-0010-safe-cli-reruns.md)
> and [integration audit](../verification/spec-0010-oct12-integration.md). See [current acceptance](spec-0010-oct12-acceptance.md) and [fresh delegated review](spec-0010-independent-review-2026-10-12.md);
> earlier completion/green-CI reports do not certify this continuation.

This extends the shared SPEC-0001/0002 mechanisms in PR #886, as authorized by
the owner, without changing acceptance criteria or approval metadata. The
published dependency implementations are present; their review status is not
an implementation gate. This document supersedes the earlier characterization
of every remaining integration task as an external prerequisite.

## Before-edit acceptance map

| AC | Existing behavior | Required continuation / verification |
|---|---|---|
| 1 | Complete extraction manifests | Preserve initial extraction, test initial full shared execution. |
| 2 | Verified extraction reuse | Full rerun must also avoid output/version churn. |
| 3 | Source mismatch rejection | Retain regression before all-stage planning. |
| 4 | Effective extraction fingerprint | Downstream settings change only relevant generation units. |
| 5 | Asset/incomplete rejection | Add generated asset inventory validation. |
| 6 | Legacy extraction refusal | Retain; unknown generated output is protected, never adopted. |
| 7 | Interrupted extraction retained | Extend restart tests to generated publication. |
| 8 | Scoped history/media preservation | Full-run manual/unknown and physical asset preservation. |
| 9 | Pre-mutation admission | Full API/CLI admission and no legacy fallback. |
| 10 | Shared writer and scoped executor | Full initial/resume API, queue and CLI parity. |
| 11 | Competing process exclusion | Rerun real process tests on final implementation. |
| 12 | Catalog shared policies | Extend the same input evidence, protection, selection and guarded publication to uncovered generation units. |
| 13 | Scoped zero-call/reporting | Complete-book zero-call rerun; selective invalidation; unresolved required work exits nonzero. |
| 14 | Ordered-input cache retained | Count actual transport calls after changed/restored inputs. |
| 15 | Fresh-label guidance | Retain unchanged; no positional identity adoption. |
| 16 | Structured/localized errors | Preserve all five locales; expose generation identities in summaries/review. |
| 17 | Immutable source snapshot | Retain source-mutation regression. |
| 18 | Book-local archives | Generation evidence remains inside versioned book outputs; archive round trip. |

## Implementation design

Extend existing `OutputMetadata`, `deriveOutputStatus`, `selectedForGeneration`
and publication guards. Store evidence on versioned generation outputs, not in
completion flags or a second provenance database. Missing or mismatched content
evidence is protected. Explicit replacement uses the existing reviewed input
signature/content hash contract. Config, prompt and asset inputs are fingerprinted
at admission and checked again before publication. No approval is inferred.

Generation units follow existing executor boundaries: generated Extract is a
book-level unit; Sectioning and Storyboard use page units; quiz, glossary and TOC
generation use book units. Catalog consumers retain their finer existing units.
Book-level generation can conservatively rerun its own unit when relevant inputs
change, but unrelated stages and current/protected pages remain untouched.
Disabled features are excluded, not fabricated as generated. Incompatible mode
output remains subject to SPEC-0003 preflight and explicit replacement.

Fresh initial runs and occupied-book resumes use shared execution. An interrupted
unit has no successful evidence. Retained untrusted output requires review rather
than adoption from today's settings. Packaging must produce a real bundle with
failure/cancellation-safe publication and validate the persisted file inventory;
it cannot report the API's former package-stage no-op as success.

## Final review and dependency reconciliation

The implementation covers the full declared B1 contract, including successful
Extract-to-Package resume. It is no longer the admission-only slice. Human review
and specification approval remain pending; the specification checkboxes and
approvers are not changed by this engineering verification.

Published dependency heads inspected for this continuation:

| Dependency | Published head | Behavior reused |
|---|---|---|
| SPEC-0001 / PR #879 | `a10d3fa0da2766f91d217e8b7ad8f9ce4a8457d5` | Relevant-input freshness, catalog output evidence and usable upstream warnings. |
| SPEC-0002 / PR #880 | `373619dd2e7ef7cecf2653cecfda07029401f5e6` | Manual/unknown protection, exact-content review decisions, scoped selection and guarded publication. |
| SPEC-0003 / PR #884 | `a5670d468d9945924503242b17992cb9b3e2ee57` | Effective sectioning mode, writer admission, lifecycle journal, persisted-mode preflight and rendering barriers. |

The Git graph contains these implementations in that order. #886 remains based
on `spec/708-sectioning-mode-lifecycle`. The earlier missing coverage was the
integration and additional generation families needed by SPEC-0010, not evidence
that the dependencies failed their own declared scopes. This continuation extends
the same policies for generated Extract, Sectioning, Storyboard, quizzes,
glossary, TOC and packaging. It does not create an alternative scheduler or
provenance database. No unimplemented external specification remains a functional
prerequisite for this bounded contract. PR #876 was inspected as the referenced
CLI-progress implementation; its progress redesign is outside this scope and the
PR was not modified. Earlier extraction-admission attribution remains intact.

A separate final audit of source, tests and the full behavioral contract found
and fixed these interactions before publication:

- Explicit protected quiz/glossary replacement must actually replace the selected
  content while retaining its histories and retired IDs.
- Staged nested transaction rollback must also roll back completion bookkeeping;
  generated files must not overwrite historical or orphaned assets.
- Sectioning content publication must revoke readiness before commit and leave
  Storyboard pending. A keep decision cannot waive that barrier. Restart repairs
  it only from complete matching evidence and persisted-mode preflight.
- Selected fixed-layout rendering must measure the whole active book window,
  publish only selected pages, and fingerprint positioned text/reference width.
- TOC fingerprints must use the real production input collector; asset identity
  must compare bytes. Static Liquid layouts join prompt fingerprints and dynamic
  dependencies refuse unsafe proof.
- Packaging must execute, validate its output inventory, retain the previous
  bundle, defer completion, and recover an interrupted rename without deleting
  SQLite recovery evidence.
- Invalid retained inputs must remain visibly blocked in Studio and cannot be
  made current through regeneration or keep. Bulk review must isolate stages.
- Cancellation cleanup must hold writer ownership; queued execution revalidates
  instead of trusting an earlier admission decision. Direct stage execution must
  admit before opening writable storage and pass the cancellation signal into
  initial extraction. Both final boundary regressions failed before the fix: an
  occupied directory gained a database/subdirectories, and cancellation wrongly
  left a complete manifest. The fixed path preserves the directory and retains
  a failed/incomplete extraction attempt respectively.

## Final acceptance audit

`Passed` means the implementation and automated/development acceptance evidence
support the criterion. It is not human specification approval or release
certification. Paths below are relative to the repository root.

| AC | Status | Concrete evidence |
|---|---|---|
| 1 | Passed | `packages/pipeline/src/__tests__/extraction-admission.test.ts`: durable complete initial manifest and real initial CLI; `full-resume.test.ts`: initial shared execution through a real bundle. |
| 2 | Passed | Extraction admission tests compare source/history/media; full resume tests compare all-current versions and transport counts, including actual CLI and offline packaged API. |
| 3 | Passed | Same-length changed PDF and stored-source mutation tests reject before source/rows/media/transport changes. |
| 4 | Passed | Admission option/default/spread/part-window/contract tests; full resume downstream-only change preserves extraction and Sectioning. |
| 5 | Passed | Missing/corrupt original asset, incomplete/zero-page manifest tests; generated bundle inventory repair test. |
| 6 | Passed | Legacy/untrusted-manifest refusal tests retain rows/assets; unknown generated evidence remains protected. |
| 7 | Passed | Failed/cancelled extraction and real killed-process tests; failed final manifest rename; generation cancellation/restart and package process-kill recovery. |
| 8 | Passed | Full resume preserves manual Core TTS, uploaded audio/video and histories; exact quiz/glossary replacement preserves history and IDs; selected page leaves neighbor unchanged. |
| 9 | Passed | Source/admission/DAG/CLI regressions assert unchanged persisted content and no transport; extraction-reset invariant passes. |
| 10 | Passed | `apps/api/src/routes/full-resume.test.ts`, `extraction-admission.test.ts`: HTTP, duplicate queued runs, cancellation; pipeline direct extraction and actual CLI tests use the same policy. |
| 11 | Passed | `packages/storage/src/__tests__/book-writer*.test.ts` and `sectioning-book-writer.test.ts`: competing processes, live owner, dead owner, ambiguous recovery and anonymous SQLite mutex preservation. |
| 12 | Passed | Full generation uses existing output metadata/selector/publication guards; unavailable runtime and dynamic dependency tests refuse safely; lifecycle/mode tests retain preflight. |
| 13 | Passed | Actual fetch-boundary counts prove complete current reruns make no provider calls; exact CLI and HTTP summaries distinguish reused/blocked; unresolved protected CLI exits nonzero. |
| 14 | Passed | `catalog-resume.test.ts` changed/restored text and admission cache tests count actual backend transport, proving ordered-input cache reuse survives admission. |
| 15 | Passed | Fresh-label extraction test preserves old book and does not transfer positional IDs/edits; documented CLI/API guidance. |
| 16 | Passed | Structured API admission/summary tests and Studio retained-stage tests; real browser protected review/keep flow; five-locale extraction and strict compilation. |
| 17 | Passed | External source mutation test proves extraction reads its stored immutable snapshot; mismatched stored bytes refuse reuse. |
| 18 | Passed | API archive test carries source, manifest, histories and referenced media while excluding writer ownership; generation evidence/attempts stay book-local. |

## Verification commands and acceptance

The committed predecessor `0612ae3d2cc4981f8955ae3bb7157f81658d4595` had a
332-file / 4,116-test baseline. This continuation adds real filesystem/SQLite
integration, transport-boundary tests and process interruption tests. Tests use
deterministic providers, not paid services. On this macOS host Git requires
`DEVELOPER_DIR=/Library/Developer/CommandLineTools` (also inherited by test children).

The implementation commit is `5d14e1f8`; the following documentation commit
records this evidence without changing runtime source. Final verification:

| Command / flow | Result |
|---|---|
| `pnpm test --maxWorkers=2` (includes root build) | 335 files, 4,148 tests passed on the final implementation (364.54 seconds). |
| Focused full-resume and extraction-admission tests in pipeline/API | 4 files, 71 tests passed after the final direct-entry fixes. |
| Earlier focused publication, prompt/layout, API and retained-UI audit | 5 files, 49 tests passed; covered again by the final full suite. |
| `pnpm typecheck` | Passed on final implementation. |
| `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed, zero errors; eight unused-suppression warnings. |
| `pnpm lint:invariants` | Extraction-reset invariant passed; does not imply every documented invariant has an executable checker. |
| `pnpm --filter @adt/studio extract` | 3,692 messages per locale; zero missing translations in es/fr/pt-BR/sq; en source retained. |
| `pnpm --filter @adt/studio exec lingui compile --strict` | Passed; no new catalog changes were needed because existing translated controls were reused. |
| `pnpm --filter @adt/studio build` | Passed, with bundle-size warnings. |
| `pnpm --filter @adt/api build:server` | Passed; built server health endpoint returned HTTP 200. |
| `node apps/api/scripts/bundle-electron-server.mjs` | Passed with installed runtime dependencies; built Electron API health endpoint returned HTTP 200. |
| `docker build --target app -t adt-studio-spec0010-review:latest .` | Passed on final runtime source; combined Linux ARM64 application. |
| Final Docker image, isolated network, full HTTP rerun twice and Studio Chromium | Passed; all included outputs reused on the second run, no browser page errors. |
| `git diff --check` | Passed. |

Development logs and disposable browser artifacts were retained locally under
`/private/tmp/spec10-*` and `tmp/spec0010-full-final/`; they are not added to the
PR. The regression fixtures and assertions are committed and reproducible. The
final Docker image manifest was
`sha256:b390f9fca3857c0bd3549969c6ea0ad2f52371076ac9df93cd72f9eeb04ab304`.


Packaged acceptance additionally exercised a disposable real PDF book in the
combined Docker application with `--network none`: two full Extract-to-Package
HTTP runs completed, and the second reused every included output. Chromium
loaded the actual Studio Extract view without page errors, edited metadata,
observed protected-content warnings, and used **Keep existing content**. The
review resolved the warning without changing protected authorship. Two further
offline full runs retained that reviewed content and completed successfully.
The integration suite also covers fixed-layout, reflowable and part-window books.

## Limits and pending human decisions

- Human review of this PR and the stacked dependencies, including the proposed
  B1 fresh-label restriction, remains pending. No approval is inferred.
- Changed source/extraction settings, missing original extraction assets,
  incomplete extraction and untrusted legacy provenance intentionally refuse
  same-label extraction. This is the specified behavior, not a missing resume
  implementation. Anonymous SQLite mutex evidence is retained and fails safely.
- Unsupported dynamic prompt dependencies cannot establish a stable fingerprint;
  `UNSAFE_RESUME_UNAVAILABLE` remains the documented safe fallback.
- B2 modes, cross-page merge, positional transfer and in-place PDF replacement
  remain out of scope. There is no force-reset path.
- Provider/model output quality, perceptual audio quality, signed Desktop
  installers, Windows filesystem/power-loss behavior and release promotion were
  not certified by these development tests. API and Electron bundle health
  checks do not substitute for installed/signed Desktop acceptance.
- Hosted CI must be checked on the exact pushed head; the PR review-summary
  comment records that run and final commit. Local evidence alone is not a
  claim that a release has been verified.

