# SPEC-0010 published-stack continuation

Historical checkpoint: the current implementation and acceptance status is in [revised-stack acceptance](spec-0010-oct12-acceptance.md). Statements below about unavailable full-book resume describe the earlier delivery, not the current continuation. Approval remains pending.

Before-edit map, 2026-10-11. This is a plan, not passing acceptance or approval.
Target #886: `876cc2ae`; prerequisite #884: `a5670d46`, including #880
`373619dd` and #879 `a10d3fa0`; develop: `ef31494d`.

The existing target contains no tracked drafts. Untracked evidence is retained.
The main and sibling checkouts are not modified. Preserve the PR title/body
byte-for-byte. Existing strict SPEC-0003 contract remains the implementation
target under the user's explicit instruction; its unratified warning/skip and
in-process-lock proposal is not adopted. No dependency review/merge gate applies.

## Acceptance map

| AC | Published behavior | Current implementation / required change | Concrete verification |
|---|---|---|---|
| 1 | A new/eligible initial-import destination extracts successfully and records a complete manifest only after all required data is durable. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |
| 2 | Same-byte PDF and equivalent effective extraction inputs reuse extraction with no PDF/page/image/history rewrite. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |
| 3 | Changed PDF bytes reject before overwriting the stored PDF, even when filename/size are unchanged. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |
| 4 | Every extraction-affecting option and contract version participates in compatibility; downstream-only settings do not force extraction. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |
| 5 | Missing/corrupt extraction-owned assets, zero-page output and incomplete manifests cannot be reused. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |
| 6 | Legacy books without trustworthy manifests are rejected without guessed provenance or content deletion. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |
| 7 | Interrupted/failed extraction retains its diagnostics/partial data and cannot become complete on restart by assumption. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |
| 8 | Reuse retains all entity histories, version allocation, manual Core TTS, uploaded audio/video and stable-ID mappings. | Preserve original histories/assets across supported downstream execution, not just admission. | Real SQLite versions, media hashes and identity allocation before/after positive resume, cancellation and conflict. |
| 9 | No rejected admission calls `clearExtractedData`, retires identities, copies the input PDF, writes content or starts a provider request. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |
| 10 | API, CLI, queued and direct extraction entry points enforce the same admission policy before pre-run mutation. | Deduplicate published extraction admission; share execution-time planning across API, queue and CLI. | Actual HTTP, queued, direct extraction and CLI subprocesses on identical fixtures. |
| 11 | Two processes/runners cannot both acquire an empty/existing book for conflicting mutation; crash recovery does not evict a live writer. | Retain one cross-process writer protocol from SPEC-0003; preserve uncertain mutex recovery. | Competing processes, live/dead/orphan ownership, SIGKILL and no timeout deletion. |
| 12 | Downstream resume uses shared freshness/protection semantics and stops before mutation when those capabilities are unavailable. | Integrate and extend shared freshness/protection execution; retain refusal only for genuinely uncovered work. | Current/stale/protected scopes, positive resume, mode preflight and before-publication conflicts. |
| 13 | Proven-current complete output causes no provider calls; stale/unknown/protected work is reported honestly and required unresolved work exits nonzero. | Provide shared truthful per-scope results and nonzero unresolved exits. | Zero actual provider requests for proven-current work; selective stale calls; partial/cancel/duplicate results. |
| 14 | Normal valid LLM caches survive admission and are still validated/reused by generation. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |
| 15 | Changed-source guidance requires a fresh user-selected destination and never transfers old IDs/edits by position. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |
| 16 | CLI/API errors identify the mismatch/busy/legacy reason without book text or secrets; Studio messages are translated in all five locales. | Carry structured admission and execution outcomes through API/CLI and Studio. | Result schema, HTTP/SSE/CLI assertions and five-locale extraction/compilation. |
| 17 | Source mutation during initial import cannot produce a completed manifest that describes different extracted bytes. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |
| 18 | Book archives retain source, manifest, histories and referenced media; no book-specific provenance lives in a global directory. | Already implemented in the extraction safety slice; preserve and verify on the published dependency stack. | Rerun the corresponding extraction-admission, writer, archive and API/CLI regression; compare persisted bytes/versions and transport calls. |

## Narrative and rollout obligations

No implicit re-extraction, legacy provenance backfill, positional ID transfer,
global cache clear, separate scheduler or separate provenance store. Use shared
catalog signatures/protection, PIPELINE graph, Sectioning preflight and atomic
publication. Unknown freshness is never current. Preserve initial import
metadata/fonts, source snapshots, part windows, active histories/media, queued
revalidation, cancellation and anonymous-mutex evidence. Unsupported capability
refuses before paid work/content writes and must remain explicitly partial.

Reconcile the attributed SPEC-0010 adaptation in #884 with #886's archive stream
lease, archive ownership filtering/collision remapping, structured admission-only
summary and invariant checker. Full tests, typechecks, lint, build, translations,
packaging and positive runtime acceptance follow focused regressions. Record
actual failures and release limits rather than inheriting historical results.

## Implemented continuation and review

The published dependency was merged into the existing PR branch, rather than
rewriting away its specification and prior safety work. Backup ref
`backup/spec-0010-before-published-stack-20261011` retains `876cc2ae`.
The merge is `8b169da0`; its before-edit acceptance map is `f6da522d`.
No dependency checkout or other PR was modified. PR title/body remain reserved
unchanged. Rebase/force push is unnecessary for this integration.

The adaptation reconciles #884's attributed extraction admission with #886's
archive-stream ownership, import/collision validation, structured refusal and
invariant checker. The common writer and anonymous SQLite mutex fail-closed
behavior come from the published prerequisite, with no timeout-based recovery.
The source issue's referenced #799 is a merged CLI speech-log change, not an
alternative safe-resume implementation; its shared logging remains in the
existing execution code. #876 is the merged progress-rendering non-goal and is
not modified.

The previous API stage executor and its styleguide/speech-progress helpers now
live in `@adt/pipeline`, with API re-exports preserving callers. The change is
principally a relocation, not another executor implementation. Catalog resume
uses those same functions; the initial-run DAG and SPEC-0003's bounded
Sectioning–Storyboard path remain separate established entry paths. The new
catalog handoff does not enter the unconditional initial-run DAG.

`catalog-resume.ts` validates extraction under the shared writer, rejects an
uncovered requested range before execution, validates persisted Sectioning
mode/readiness and uses `readOutputCatalog` plus `selectedForGeneration` from
SPEC-0001. It re-reads outputs at stage boundaries, bypasses all-current stage
execution and validates explicit replacement decisions before provider work.
Results describe persisted current/protected/unresolved identities and report
failure or cancellation without treating attempted work as completion. API
queued runs invoke the same path when they start. The report is session-local;
after restart freshness is reassessed from existing persisted evidence.

### Independent review findings addressed

- Integration initially retained two old tests expecting extraction preparation
  itself to throw a Sectioning error. Preparation now performs no mutation;
  common admission rejects unsafe extraction. Updated the preparation tests to
  assert retained versions/media, while actual admission tests cover rejection.
- The API's published immediate BOOK_BUSY contract rejects a task before emitting
  a start event. Updated the old asynchronous-failure expectation and asserted
  no executor call, ghost task or start event.
- A reused catalog must not bypass persisted mode validation merely because it
  makes zero provider calls. Added the same Sectioning readiness/preflight guard
  before catalog planning.
- Kept the API execution module as a package subpath so it does not eagerly import
  itself through the package index. Existing dependency mocks and API regressions
  continue to exercise the relocated implementation.
- Preserve `--concurrency` for the new CLI handoff, and map explicit Azure keys to
  the provider's existing `apiKey` credential field.
- Preserve the last resume result after successful jobs leave the active slot;
  both JSON status and SSE expose it. Unresolved protected work is a failed job
  and a nonzero CLI outcome, with translated guidance in all five locales.

- Reject unknown explicitly selected output identities before work, rather than
  reporting an empty selection as proven current.
- Unsupported ranges spanning Sectioning through uncovered stages return the
  documented `UNSAFE_RESUME_UNAVAILABLE`, rather than an incidental enum error.
- Cancellation clears running step markers while the shared writer is still
  held, including CLI use without the API's outer cleanup service.
- Starting the next queued job clears the previous resume summary, so a failure
  before admission cannot display its predecessor's successful extraction claim.

### Genuine remaining functional prerequisites

The full spec is **not complete**. This is beyond admission-only delivery, but
full-book automatic resume remains unavailable. The blockers are implemented
capability gaps, not review/merge gates:

1. **Generated Extract steps:** common freshness/publication evidence is absent
   for metadata, summary/outline and image-analysis derivatives. A complete
   extraction manifest proves original extraction, not those generated steps.
2. **General Sectioning/Storyboard freshness:** SPEC-0001 explicitly excludes
   Storyboard's own freshness. SPEC-0003 provides strict mode lifecycle,
   replacement and publication, and bounded explicit reruns; it does not prove
   a general unchanged full-book resume plan. SPEC-0002's Storyboard protection
   exclusion/follow-up (issue #144) is also relevant.
3. **Quizzes, glossary and TOC:** SPEC-0001 explicitly excludes generation
   freshness for these saved source artifacts. SPEC-0002's protected replacement
   does not supply a currentness proof. Their saved text can feed supported
   catalog outputs without claiming that source generation is current.
4. **Full output orchestration:** packaging is handled separately by the API;
   a whole-run plan needs the above prerequisites plus a shared export completion
   result before it can advertise full CLI completion. No package no-op is
   exposed as a successful resume stage.

Required follow-up belongs in the shared freshness/preservation contracts (or
an explicitly assigned extension of their scope). No acceptance criteria were
weakened, no speculative provenance engine was added, and no human approval is
claimed. SPEC-0003 B2 modes and cross-page merge remain outside this work.

## Final acceptance matrix

“Passed” covers the stated admission/preservation contract and supported scopes.
Rows 12–13 explicitly remain blocked for the full-book promise; a safe fallback
is not recorded as completion. All spec checkboxes and approval metadata remain
unchanged.

| AC | Status | Current evidence |
|---|---|---|
| 1 | Passed | `extraction-admission.test.ts`: real PDF/SQLite initial extraction and completion inventory, retained import metadata/fonts. |
| 2 | Passed | Same extraction suite plus `catalog-resume.test.ts`: byte-identical manifest and unchanged content version fingerprint on current reuse. |
| 3 | Passed | Same-size changed source rejection and retained stored source in extraction/CLI integration. |
| 4 | Passed | Effective option/default/contract/part-window compatibility regressions; downstream config changes are independent. |
| 5 | Passed | Missing/corrupt inventory, zero-page and incomplete attempt rejection. |
| 6 | Passed | Legacy/unknown destination rejection; existing editor routes remain available. |
| 7 | Passed | Failure/cancellation/process interruption fixtures retain partial extraction and refuse inferred recovery. |
| 8 | Passed for supported reuse | Extraction history/media snapshots, archive tests, protected catalog replacement and bounded Sectioning–Storyboard history/stable-ID regressions. Full-run coverage is blocked under 12–13. |
| 9 | Passed | HTTP/CLI/direct negative tests and `lint:invariants`; preparation does not clear or retire content. |
| 10 | Passed | Shared extraction boundary, actual CLI, HTTP stage admission, TaskService and queued execution regressions; catalog HTTP/CLI uses one executor. |
| 11 | Passed | Real competing-process writer tests, crash/recovery fixtures and strict anonymous SQLite mutex refusal inherited and rerun on this stack. |
| 12 | Blocked for full scope | Supported catalog stages execute via shared policies; unsupported ranges refuse before work. Generated Extract, general Storyboard and quiz/glossary/TOC freshness remain unimplemented prerequisites. |
| 13 | Blocked for full scope | Actual CLI zero-call current reuse and nonzero protected result; API duplicate queue makes one total transport call and one version. No all-stages complete-book proof exists. |
| 14 | Passed | Extraction keeps caches; catalog transport tests count valid/invalid cache calls. Resume test changes/restores the same selected ordered request and proves the cached request makes no third transport call. |
| 15 | Passed | Existing guidance/actual CLI tests require a user-selected fresh label, retain old content and do not transfer IDs by position. |
| 16 | Passed | Structured extraction codes; shared resume summary and translated unresolved guidance; Lingui extraction/strict compilation covers all five locales. |
| 17 | Passed | Source-snapshot mutation regression and complete manifest inventory validation. |
| 18 | Passed | Project/part archive, ownership filtering/collision import and streamed-export lease integration tests. |

## Integration scenario evidence

| Scenario | Evidence / limitation |
|---|---|
| R1 | Real CLI and HTTP current catalog resume; no transport calls or content versions on second run. Full-book scope remains blocked. |
| R2 | One changed translation consumer generates once, current/protected neighbor preserved. |
| R3 | Manual and unknown translation remain unchanged; named blocked identities and nonzero CLI/job failure. |
| R4 | Unsupported ranges refuse before content/provider work, including a range spanning Sectioning to Speech. |
| R5 | Shared competing-process writer tests plus stale content/signature replacement and inherited publication-conflict tests. |
| R6 | Cancellation at actual provider response retains prior output and resets CLI running markers; restart replans. Existing process-interruption extraction tests cover uncertain recovery. |
| R7 | Two actual HTTP requests queue; second reuses current output without another request/version. Damaged queued manifest fails when started and cannot reuse the previous job's summary. |
| R8 | Ordered-input translation transport/cache tests and the new same-selection source restoration fixture. |
| R9 | Fixed/reflowable and part-window Sectioning–Storyboard positive tests; incompatible By Page catalog preflight refuses even with current translations. |
| R10 | Exact signature/content replacement changes only the selected output; reusing the stale decision refuses before transport. |

These integration scenarios are verified for supported ranges only. They are
not a certification of the missing full-book path.

## Verification commands and results

Implementation commit: `5c88fd90`. Documentation-only delivery commits do not
alter the tested runtime. Local run evidence is retained in the isolated
checkout's untracked `tmp/spec0010-final/` directory.

| Check | Result |
|---|---|
| Integrated baseline `pnpm test --maxWorkers 2` | 4,101 passed, two integration expectation failures; fixed as described above. No failure was dismissed as pre-existing. |
| Final `pnpm test --maxWorkers 2` | **332 files, 4,116 tests passed**, including extraction/process/archive suites and the new supported-resume acceptance. |
| Final focused resume/API/localized-error tests | 3 files, 22 tests passed; Sectioning fixed/reflowable/part-window and shared API runner suites also passed in the full run. |
| `pnpm typecheck` | Passed. |
| `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed, zero errors and eight existing-file unused-suppression warnings; no unrelated-cleanup claim is made. |
| `pnpm build` | Passed, including runtime asset generation. |
| `pnpm lint:invariants` / `git diff --check` | Passed. Invariant scan includes the relocated executor and resume handoff. |
| Lingui extraction / `compile --strict` | Passed: 3,692 messages per locale, zero missing translations in en/es/fr/pt-BR/sq. |
| API server / Electron server bundles | Built and both started; `/api/health` returned 200. This is not installer/signing verification. |
| Studio production build | Passed; existing size warnings are reported by the builder, not treated as failures. |
| `docker build --target app -t adt-studio-spec0010-review .` | Passed after review fixes on local Linux ARM64 Docker. |
| Docker runtime acceptance | Combined image ran with `--network none`, served Studio and completed HTTP Translate resume for a real extracted copied book. Every output was reused, with one retained version per translation, Core TTS catalog and Storyboard row. Test container removed. |

A cache regression initially expected a one-item request to hit a cache entry
from an earlier two-item batch. That assumption contradicts ordered-input
caching. The final regression uses the same selected one-item request before and
after source restoration and counts two actual transport calls across three
successful generations. It does not change cache keys or weaken validators.

No real provider spend was used. Interactive manual browser editing, signed
Desktop installers, Windows filesystem/power-loss behavior and release promotion
were not run. These are release-verification limits, separate from the functional
full-resume prerequisites listed above. Hosted CI must be checked against the
exact published head and recorded in the review-summary comment; local tests do
not stand in for hosted CI. Human specification approval remains pending.
