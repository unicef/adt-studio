# Independent SPEC-0002 implementation review — 2026-10-12

> Current independent source assessment. Earlier checkpoint reports and failing probes are retained; `entry-gates-followup.md` records the additional defects found and rechecked after the first assessment.

## Verdict and exact scope

Reviewed source head: `7b53e4483d2f518410ff56c4276095b9c1170cef`.
Prior source checkpoints: `9309b1ad`, `5707bf04`, `09a86c12`, and `999d2fb9`; tests below identify their actual source checkpoints.
Prerequisite: `aefe41855ae63d89c09db5553c50f48eb01b190d` (SPEC-0001 / #879).
Initial integrated reproduction baseline: `9cecf188a91306f7aa034060c0c535e0f5e83a62`.
Intermediate repaired freeze: `df677a46b0d355039f6bf89a49a47f29649d251e`.

No remaining material correctness or data-loss finding was identified in the reviewed, qualified scope after rechecking the fixes. The four original findings and independently reproduced draft, duplicate-identity, retained-entry/export, unavailable-TOC-destination and reader-filtering failures are addressed. The author-discovered, independently reproduced Webpub navigation-filename collision is also corrected and rechecked. Confidence is high in the exercised preservation, identity, consent and conflict paths; this is not certainty about all possible books or release certification.

This is a qualified implementation assessment, not an unrestricted claim that every historical book previews/exports unchanged. SPEC-0001's unverifiable or contradictory rendered ownership qualification still applies to SPEC-0002 AC-9/11/17: preserve raw content/history/assets, omit unsafe rendering from output with warning, and do not infer an owner by position. Ambiguous legacy translations and TOCs fail closed on mutation until a known valid version is restored or the book is repaired. Full Storyboard rerun preservation, safe CLI resume, downstream mode lifecycle and full Electron GUI/signed release verification are outside this verdict. AC-17 targets preview/web output; EPUB/PNLD retain separate existing unresolved-heading navigation conversion limitations. Webpub preserves unlinked headings through its standard HTML contents fallback; third-party reader interoperability was not independently exercised.

The implementation author remains responsible for final exact-head full checks, rebuilt platform runtime/browser/restart evidence, hosted CI and publication. This reviewer did not push, edit the PR or modify production code.

## Independence and method

Read the original published specification, decisions/amendments, AC-1–19 and test plan, original review 5486314026, source issues and PR discussion, AGENTS, architecture/guidelines/invariants and ADR-024, prerequisite evidence/gap register, and roadmap/SDD. Built `requirement-map.md` independently before relying on the author's acceptance table. Traced UI and guarded drafts through HTTP entrypoints, shared writer admission, worker planning, version checks, transactional publication, current/history state and preview/package readers. Tests use actual mounted React editors, Hono request routes and real SQLite/filesystem, with provider stubs; no paid provider calls.

## Feedback and additional findings

| Item | Concrete risk | Recheck outcome |
|---|---|---|
| F1 | Replacement/reorder lets another section URL or answer ID acquire retained HTML/audio/translation | Passed: preview uses shared stable reading-order owner; metadata uses `item.section`, not retained rendering index; HTTP replacement returns 404 for unpublished new owner, reorder/prune/restore retain real answer owners, neighbor versions and physical audio. Ambiguous/conflicting owners remain raw/history and are not served by guessed URL. |
| F2 | Reused positional TOC IDs reapply Chapter A's edit to Chapter B after rejected Save | Passed: TOC-specific identity/generation policy locks whole-document conflicts and gives explicit document choices. Reorder, insertion/removal, target change, replacement, same-target generation (including identical entries), duplicates and unrelated edits exercised through actual mounted editor and next Save. |
| F3 | Protected fixed-layout page keeps HTML but loses its positioned tree | Passed: ordinary Sectioning retains matching pair; HTTP neighboring success/failure/cancellation and reopened-storage preview/package preserve it. Process restart remains a separate platform check, not inferred from reopened SQLite. |
| F4 | Same-run Sectioning retirement invalidates exact TOC consent; combined replacement silently skips | Passed: consent advances only to the exact version committed by that same transaction. Combined range makes one TOC generation call. HTTP competing writer is rejected. Independent separate SQLite writer causes explicit run failure, zero TOC calls, no stale page publication, and preserves independent TOC/history. |
| R1, P1 | Type a new quiz draft while history restore awaits; restore callback discards it | Reproduced on integrated baseline; fixed. Restore blocks when dirty and locks affected editor until restore/refetch completes; new draft remains editable afterward. Native disabled behavior used in recheck. |
| R2, contract reconciliation | Whole-page/TOC no-op save manufactures manual authorship | Corrected per latest owner instruction and documented amendment: unchanged authored content retains AI/manual/absent source; genuinely changed content protects entire unit. Forged client source ignored. |
| R3, P2 | Ordinary translation run collapses two protected legacy entries sharing an ID to one | Reproduced through real HTTP run/SQLite before fix; fixed. Both entries remain readable/current/history; run and save refuse ambiguity before provider calls/publication. |
| R4, P2 | Initially loaded duplicate TOC IDs make editing one chapter alter another | Reproduced on df677a46 in mounted editor; fixed in 9309b1ad. Current ambiguous document read-only, raw chapters/history retained. API rejects new duplicate IDs (400) and saves over ambiguous current data (409); restore known version then edit succeeds. |
| R5, P1/P2 entry family | Cleared attempt status hid saved output; retained export enhancements were silently disabled; optimistic queue cache could erase visible saved content | Fixed and rechecked: current pages/documents/catalog drive Preview/Validation/Export/TOC/Glossary/Captions availability; actual Export confirmation includes retained features and waits for query readiness; actual query cache retains protected state before/after rejected queue admission. Selected SQL NULL/JSON null never fall back to historical availability. |
| R6, P2 | Valid manual TOC → guarded prune emits a clickable missing-page URL in preview/package | Independently reproduced through real HTTP/SQLite/filesystem. Fixed: preserve headings/hierarchy without a destination, restore reactivates links, raw TOC/rendering/history unchanged, Webpub emits escaped HTML contents resource. Explicit saved empty TOC is not regenerated on read. |
| R7, P2 | Multiple unlinked/same-target TOC headings collide as React keys, leaving wrong rows visible during search | Independently reproduced in mounted actual reader; fixed with unique presentational keys. Final independent probe and committed reader regression pass without duplicate-key warning. |
| R8, new export corruption | New Webpub contents.html fallback overwrites an existing stable-owner page with that filename | Author identified; independently reproduced with actual files. Fixed by deterministic first-unused output filename allocation; existing bodies/reading order/source ADT survive, repeat export chooses the same safe filename, exact generated resource registered. Independent original probe and affected 126-test suite pass. |
| Evidence correction | Old-build probe initially used current runtime assets | Corrected to old tree assets for old API/export. Independently reran successfully; eight archived API/schema source files matched baseline `ef31494dc2951b92222c473960fecee2d91f9544`. |

## Independent acceptance map after recheck

“Passed” below describes observable development acceptance in the listed tests; it does not imply all platform/release gates passed. An affected unknown-owner legacy output remains qualified even where the normal case passes.

| AC | Independent result | Evidence |
|---|---|---|
| 1 | Passed | Manual survival HTTP save tests, shared stamping tests: changed/new translations only, no-op/forged source, version/source guards, zero calls on Save. |
| 2 | Passed | `catalog-execution` transport/cache suite including 8,850 synthetic entries, fixed windows before filtering, current/protected skip, cache/provider/request/cost distinction. This is not the real representative-book harness. |
| 3 | Passed | Quiz identity/lifecycle and real HTTP save tests; changed quiz/manual stamps, stable quiz/option IDs, prior provenance retained. |
| 4 | Passed | Quiz-generation and repeated HTTP runs; complete protected source-page group excluded, no appended duplicate, no-eligible and neighbor replacement preserve protected output and explicit order. |
| 5 | Passed under documented no-op reconciliation | Whole-document TOC stamp tests and new ambiguous-current guard; generation AI, meaningful Save manual, unchanged source preserved. |
| 6 | Passed | Named confirmation, failed/cancelled publication, combined F4 actual stage-range call count and separate-writer rejection. |
| 7 | Passed under documented no-op reconciliation | Clone/split/merge/delete/AI edit and server save boundary checks; whole-page stamps, factories/retirement and stale target guards. |
| 8 | Passed | Protected/unknown/empty pages skipped without generation or rewriting; F3 retains positioned/rendered pair. |
| 9 | Passed for verifiable ownership; qualified legacy output | Save → real HTTP own/upstream run → read/history/preview/package six authored kinds; no pre-run erasure. Unsafe-owner rendering deliberately omitted. |
| 10 | Source reviewed; final platform check delegated | Four badges and all new Studio messages use macros/five catalogs. Author's earlier extraction/strict-compile logs inspected; final extraction/lint/compile rerun belongs to final gate after R4 string. |
| 11 | Passed read probe; qualified legacy output | Independently executed actual built pre-change API/resources read/preview/export → current reopen with four saved units, unchanged source/IDs/history. Does not certify old editing/resume or unverifiable legacy rendering. |
| 12 | Passed | Real restore preserves source and history; Sectioning single-page Revert tests; missing AI, dirty, busy, stale, cancellation and neighboring-page behavior. R1 restore race fixed. Actual queued-run query-cache preservation rechecked. |
| 13 | Passed | Delete-last retains protected empty page; cross-page merge protects both, rejects stale target without mutation. |
| 14 | Passed | Source removal removes active translation membership, retains history and physical assets, restore reactivates same IDs; TOC retirement preserves authorship. |
| 15 | Passed | Actual replacement dialog defaults and named snapshots; stale queued confirmations rejected. |
| 16 | Passed | Failure/cancellation and SQLite fault rollback preserve current identities; explicit quiz/page replacement retires only after successful publication. |
| 17 | Passed for verifiable ownership; qualified legacy output | Current owner-specific answers, translations, recordings, quiz HTML and TOC preview/package tests. Added actual retained-output entry/export flags, TOC Save→prune→projection→restore, escaped Webpub contents, explicit empty document and duplicate-target reader search. Unknown/contradictory owner omitted; no unrestricted legacy or all-format conversion claim. |
| 18 | Passed after R1/R3/R4 fixes | API stale/missing/busy guards; mounted guarded-draft recovery, navigation-related hooks, whole TOC choices; external writer; no draft loss from restore; ambiguous current saves fail closed. |
| 19 | Passed, bounded | Real fresh-book DAG writer/CLI authorship tests stamp four outputs AI. No claim of full CLI preservation/resume or SPEC-0010 completion. |

## Exact independent commands/results

All commands ran in `/Users/ksokolovic/Development/adt-studio/tmp/spec-0002-implementation`, with `env -u OPENAI_API_KEY DEVELOPER_DIR=/Library/Developer/CommandLineTools` prefixed.

1. On df677a46:

   `pnpm exec vitest run apps/studio/src/components/pipeline/stages/toc/TocView.recovery.test.tsx apps/studio/src/components/pipeline/stages/quizzes/QuizzesView.history.test.tsx apps/api/src/routes/manual-edit-survival.test.ts apps/api/src/routes/rendered-ownership.integration.test.ts apps/api/src/routes/adt-preview.test.ts packages/pipeline/src/__tests__/catalog-execution.test.ts packages/pipeline/src/__tests__/quiz-generation.test.ts packages/pipeline/src/__tests__/manual-edits.test.ts packages/pipeline/src/__tests__/cli-authorship.test.ts apps/api/src/routes/quiz-identity-regressions.test.ts apps/api/src/routes/quiz-id-lifecycle.test.ts`

   **11 files / 176 passed**, 188.47s. `recheck-contract-df677a46.log`.

2. On df677a46, prerequisite/UI paths unaffected by subsequent focused TOC guard:

   `pnpm exec vitest run apps/api/src/routes/output-entrypoints.integration.test.ts apps/api/src/routes/catalog-freshness.test.ts apps/api/src/routes/speech-freshness.integration.test.ts apps/api/src/services/catalog-preparation.integration.test.ts apps/api/src/services/scoped-speech.integration.test.ts apps/api/src/services/speech-timing-refresh.integration.test.ts packages/pipeline/src/__tests__/retained-catalog.test.ts packages/pipeline/src/__tests__/render-sectioning.test.ts packages/pipeline/src/__tests__/output-freshness.test.ts apps/studio/src/components/pipeline/stages/sectioning/RevertSectioningEdits.test.tsx apps/studio/src/components/pipeline/stages/sectioning/SectioningPageDetail.test.tsx apps/studio/src/components/pipeline/components/LandingPageShell.authorship.test.tsx apps/studio/src/components/pipeline/stages/quizzes/AddQuizDialog.authorship.test.tsx apps/studio/src/hooks/use-guarded-draft.test.tsx`

   **14 files / 75 passed**, 18.42s. `recheck-prerequisite-df677a46.log`.

3. On the 9309b1ad checkpoint:

   `pnpm exec vitest run --config ../spec-0002-evidence/independent-oct12/vitest.config.mts ../spec-0002-evidence/independent-oct12/restore-draft.test.tsx ../spec-0002-evidence/independent-oct12/duplicate-route.test.ts ../spec-0002-evidence/independent-oct12/toc-identity.test.tsx`

   **3 files / 18 passed**, 26.78s. Includes copied editor fixture cases and independent adversarial additions. `final-own-probes-9309b1ad.log`.

4. On the 9309b1ad checkpoint:

   `pnpm exec vitest run apps/studio/src/components/pipeline/stages/toc/TocView.recovery.test.tsx apps/api/src/routes/manual-edit-survival.test.ts apps/api/src/routes/toc-reading-order.test.ts apps/api/src/routes/authorship-boundaries.test.ts`

   **4 files / 53 passed**, 180.03s. `final-affected-9309b1ad.log`.

5. On the 9309b1ad built API/runtime checkpoint:

   `node scripts/probes/spec-0002-compatibility.mjs --baseline ../spec-0002-evidence/compat-before`

   **Passed**, exit 0. Old API uses its own runtime assets. Four entity reads, preview/export, then current reopen; source/IDs/history unchanged. `final-compatibility-9309b1ad.log`.

6. On 5707bf04, independently reran current-version page routes and retained Studio entry/queue regressions: **7 files / 113 passed**, 148.97s, `entry-gates-final-5707bf04.log`. Independent real Export payload and actual query-cache probes: **2 files / 4 passed**, 1.31s, `entry-gates-own-5707bf04.log`. Exact commands are in `entry-gates-followup.md`.

7. On 09a86c12:

   `pnpm exec vitest run apps/api/src/routes/toc-reading-order.test.ts apps/api/src/routes/adt-preview.test.ts packages/pipeline/src/__tests__/package-web.test.ts apps/adt-runtime/src/features/toc/components/TocDockContent.test.tsx`

   **4 files / 148 passed**, 72.42s, `toc-final-recheck-09a86c12.log`. Independent supported-prune/escaping probe: **2 passed**, 22.24s, `toc-unresolved-target-09a86c12.log`.

8. On final 999d2fb9:

   `pnpm exec vitest run --config ../spec-0002-evidence/independent-oct12/vitest.runtime.config.mts ../spec-0002-evidence/independent-oct12/toc-runtime-identity.test.tsx`

   **3 passed**, 1.60s, `toc-runtime-identity-999d2fb9.log`. This is the same independently failing repeated-target search probe, now passing.

   `pnpm exec vitest run apps/adt-runtime/src/features/toc/components/TocDockContent.test.tsx apps/api/src/routes/toc-reading-order.test.ts`

   **2 files / 5 passed**, 30.68s, `final-toc-999d2fb9.log`. Final diff from 09a86c12 is the unique presentational key, its regression and clarification that projection does not change AC-14 retirement publication.

These overlapping suites must not be added into a claimed unique test total. Original failing probe logs remain alongside this report.

## Limits and remaining gates

- No browser/Electron GUI/Docker process restart was independently executed by this reviewer. Author's earlier full-suite/typecheck/lint/Lingui and successful Docker/Desktop build logs were inspected; build success alone does not establish runtime acceptance. Final platform logs and exact-head hosted CI remain the publication gate.
- Mounted React tests exercise real editor/guarded-draft behavior with stubbed HTTP client; separate real HTTP/SQLite tests prove server behavior. This is not a single real-browser two-session run.
- Fixed-layout F3 automated regression proves retained state across connection reopen. Do not label it process restart evidence without the separate runtime check.
- The 8,850-entry experiment uses a stub provider and real transport/cache accounting; no paid API call, production provider performance or release cost promise is certified.
- Do not promote pending spec approval/index metadata or original qualified legacy criteria to unconditional passes. Keep PR #880 separate and stacked on the stated prerequisite; downstream consumers must integrate the refreshed head and preserve its protections.


## Test-only transport-accounting addendum

After the source freeze, the author added one test only to `packages/pipeline/src/__tests__/catalog-execution.test.ts`. At inspection, `git status --short` and `git diff` showed only that file modified; production runtime remained exactly `999d2fb9`. Reviewed file SHA-256: `08053ff4fd84ec0d6e0f4c1f2cd380a77d2a14482ed345a6a3d3d9bff3757246`.

The regression uses the real LLM adapter and stubbed fetch transport. One translation adapter request receives an invalid response count, retries through two actual HTTP calls, logs failed attempt 0 and successful attempt 1 with token usage, excludes both protected source/correction text from both request bodies, and preserves the protected entry. A subsequent ordinary current-output run makes no additional adapter/transport calls, log entries or fixture cost. The `0.03` ledger is explicitly a synthetic per-call test tariff; it is not a claim about provider pricing or the application's monetary-cost calculator.

Independently reran `env -u OPENAI_API_KEY DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run packages/pipeline/src/__tests__/catalog-execution.test.ts`: **10/10 passed**, 1.31s, `retry-transport-final.log`. No finding in this test-only addition; the source verdict remains unchanged.

Also inspected the author's final-runtime evidence, without claiming these were independently executed: `oct12-test-999d2fb9.log` records **329 files / 4,095 tests passed** before this additional test; `oct12-desktop-runtime.json`, `oct12-desktop-api-1.log`, `oct12-desktop-api-2.log`, and `oct12-desktop-zip-check.json` show the actual packaged API startup twice, TOC Save 200/stale Save 409/restore 200, fixed owner preview before/after process restart, export ZIP, verified TOC destinations/quiz scores/manual glossary/unchanged audio bytes, and 129 representative-book outputs. The declared limits remain no Electron GUI or signed installer verification. Do not add the overlapping focused test count to the full-suite total. Docker/browser final evidence and hosted exact-head CI are still distinct gates at this addendum's time.


## Fallback filename collision — original reproduction (fixed below)

The implementation author identified a possible collision in the newly added Webpub HTML TOC fallback. Independently reproduced through direct `packageWebpub` with real files: reading-order section IDs `contents` and `contents-2` produce existing `contents.html` and `contents-2.html`; adding an unlinked TOC heading overwrites the first body with the generated navigation HTML. The original ADT projection remains recoverable, but the delivered Webpub loses the first page's content. This is new material export corruption, not an existing legacy-owner qualification.

`webpub-name-collision.test.ts` fails at the assertion that `PROTECTED ORIGINAL ONE` remains in `webpub/contents.html`; original failing output is `webpub-name-collision-before.log`. Recommended narrow correction: deterministic first-unused output filename allocation using actual filesystem existence, then register the exact selected resource. The probe expects original files and reading-order hrefs unchanged, and the generated resource at `contents-3.html`. This is output filename allocation, not persisted entity identity. At this intermediate point the source verdict was held pending correction/recheck; the final correction is verified below.


## Filename collision correction recheck — 7b53e448

The finding above is fixed and independently rechecked at `7b53e4483d2f518410ff56c4276095b9c1170cef`. It allocates the first unused filename based on actual filesystem occupancy and registers that exact resource. Original page files and reading-order hrefs remain intact; the committed regression checks repeat-export determinism and original ADT data as well. No persistent entity identity changes.

Independent original probe: **1 passed**, 4.90s, `webpub-name-collision-7b53e448.log`. Independent affected repository run: **3 files / 126 passed**, 37.75s, `webpub-final-7b53e448.log`. Command: `env -u OPENAI_API_KEY DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm exec vitest run packages/pipeline/src/__tests__/webpub-toc-preservation.test.ts packages/pipeline/src/__tests__/package-web.test.ts apps/api/src/routes/toc-reading-order.test.ts`.

No remaining material source finding after this recheck. This consolidated report preserves the failing reproduction chronology as well as the current final verdict. The previous runtime/platform results do not substitute for the author's rebuild and rerun of the changed final source.
