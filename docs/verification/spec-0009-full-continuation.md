# SPEC-0009 Phase B implementation and acceptance

## Preparation — 2026-10-12

Implementation-before-approval is explicitly authorized; human approval remains pending. PR #885 title/body are frozen byte-for-byte. Recovered all 14 Phase A commits from `3472f894` onto published SPEC-0013 `c4ed8222088261f5a3d5663095d1bf743a896858`, preserving PR #645 attribution. Backup ref `backup/spec-0009-before-phase-b-20261012`, Git bundle and original metadata are retained locally under `tmp/spec0009-phase-b/`. Unrelated worktrees and drafts remain untouched.

The readiness gate passed: all 18 dependency criteria have published behavioral evidence, nine separate-review findings were fixed/rechecked, actual executable probes passed (25 CLI cases plus 29 gate cases), and hosted run 38186860502 passed tests/Docker/i18n at that exact head. No human approval or release certification is implied.

## Before-edit acceptance map

| AC | Recovered behavior | Required work | Verification |
|---|---|---|---|
| 1 | historical Phase A passed; restacked regression not run | Preserve reviewed rule/category/fallback routing | Resolver and rendered automated findings, including unknown and inherited-property IDs |
| 2 | historical Phase A passed; restacked regression not run | Preserve criterion/section/snapshot/historical routing precedence | Reviewer snapshot/override and legacy fixtures |
| 3 | historical Phase A passed; restacked regression not run | Preserve immutable session metadata and old answers | Real SQLite/filesystem competing save/read/reopen and edited current checklist tests |
| 4 | historical Phase A passed; restacked regression not run | Preserve optional metadata validation; validate new repair request schema | Invalid checklist/review destinations and malformed repair HTTP requests must write nothing |
| 5 | historical Phase A passed; restacked regression not run | Preserve canonical surface capabilities | Every destination page/book route; repair editor links retain identity/context |
| 6 | historical Phase A passed; restacked regression not run | Preserve stored-ID precedence; share proven repair resolution | Sparse/reordered/foreign/malformed/ambiguous/legacy links cannot select successor indices |
| 7 | historical Phase A passed; restacked regression not run | Preserve moved/retired fallback; recheck active ownership on admission/publication | Moved page resolution, retired/recycled ID rejection, concurrent ownership change |
| 8 | historical Phase A passed; restacked regression not run | Preserve one-shot focus and unrelated URL state | Deferred editor load/refetch and Return/Back query/fragment tests |
| 9 | historical Phase A passed; restacked regression not run | Extend existing context/draft protection across repair confirmation/task outcomes | Stay, save failure, shared pending save, cancellation, conflict, late/ambiguous response, return |
| 10 | historical Phase A passed; restacked regression not run | Keep navigation non-mutating; generation requires explicit confirmed action | Count navigation write/provider calls at zero and compare rows/assets before action |
| 11 | historical Phase A passed; restacked regression not run | Keep incomplete findings separate from confirmed violations | Same rule in both groups before and after task completion/new validation |
| 12 | historical Phase A passed; restacked regression not run | Preserve accessible translated routing; add translated repair controls/status | Keyboard/dialog/accessibility tests; five-locale extraction and strict compile |
| 13 | Phase B not implemented; dependency gate now passed | Add eligible active proven-target repair UI and honest confirmation | Generated synchronized reflowable section offered; manual/unknown/custom/fixed/ambiguous cases safe fallback |
| 14 | Phase B not implemented; dependency gate now passed | Extend common rendering admission for Validation without artificial synchronization drift | Real HTTP/shared writer expected versions/mode/config/protection checks; conflict with active task even without step row |
| 15 | Phase B not implemented; dependency gate now passed | Use shared accepted-request idempotency and actual task state | Duplicate/retried/lost response maps to same accepted task; queued/running/terminal/cancel/restart transitions |
| 16 | Phase B not implemented; dependency gate now passed | Use common forceFresh and captured prompts, scoped guarded publication | Actual stubbed transport counts plus prior-cache write-through, selected section only; neighbor DB/content/media hashes |
| 17 | Phase B not implemented; dependency gate now passed | Preserve prior output/cache/history/media/context on failure/cancel/stale/recovery | Real SQLite rollback and filesystem failure injection, concurrent source/render/prompt edits, process restart no paid resume |
| 18 | partial; Phase B not implemented; dependency gate now passed | Retain assessment/artifact association and human verdicts; expose separate explicit revalidation | Rerender leaves old assessment byte-identical and no auto-pass; new applicable validation creates separate version/evidence |
| 19 | historical Phase A passed; restacked regression not run | Retain independent Phase A fallback and truthful implementation/release status | All original Phase A suites after restack; no unsupported full-delivery/approval/release claims |

## Narrative contract and integration decisions

- Extend shared renderer; drift-specific synchronization repair cannot directly serve synchronized Validation findings
- Server-owned provenance, stable ownership, paired version and captured prompt checks
- No client origin proof, no custom/fixed unsafe semantic repair, no alternate queue/retry/protection system
- Retain historical assessment and tested-artifact association; task completion is not a verdict
- Fresh separate delegated reviewer required after implementation and initial tests; recheck material fixes
- Do not alter PR885 title/body; comments/base/reviewer updates authorized; explicit remote push only after review

The Phase B action will extend shared task admission and targeted rendering. A synchronized generated section can still have a validation finding: synchronization drift is not a prerequisite. Fixed-layout, manual/unknown-origin, custom activities and ambiguous identities retain navigation with explanations. Cost confirmation is explicit and does not invent prices.

Common task state needs durable accepted-request receipts, duplicate protection and cancelled/interrupted reporting without automatic paid restart. Fresh cache results must remain staged until guarded rendering publication accepts them, with rollback/recovery retaining prior valid cache. These are shared-service extensions, not a Validation renderer or retry queue.

All old assessments and reviewer snapshots must remain immutable. Artifact associations are retained; explicit fresh validation creates new evidence. Rendering success never changes a verdict.

## Implemented behavior

The complete Phase A and Phase B functional contract is implemented. All 14 original Phase A commits were reused, including the attribution to PR #645; that PR was not changed. Validation now offers explicit selected-section repair only for an active, uniquely owned, proven generated target. Unsupported positioned layout, custom/manual/unknown output and historical/unproven targets keep their editor route and explanation. The confirmation names the target and warns that provider calls may cost money; it invents no estimate.

API admission uses the common writer, mode/config/protection checks, expected source/render versions and captured prompts. Validation extends the common renderer's purpose without changing SPEC-0012's drift-specific synchronization action. Durable accepted-request receipts support the same request UUID after ambiguous replies, duplicate submissions, reload and restart. Recovery never automatically resumes paid work. UI status is actual task state; completion is not a pass.

Force-fresh cache writes remain staged until guarded output publication. Transaction/cache/package recovery uses immutable commit receipts; later manual edits or restored active pointers do not erase history. Only actual downstream consumers are invalidated. Rejection, failure and cancellation preserve previous valid content and referenced assets. Explicit revalidation creates separate assessment evidence for the tested package; old automated and human verdicts remain immutable.

Reviewer artifact metadata is additive: old records remain readable and writable but cannot fabricate repair proof. New records bind the loaded package UUID and server-captured artifact snapshot. Preview freezes that reference with unsaved notes. Moved stable IDs use captured page ownership instead of their old ID prefix, including runtime soft navigation.

## Acceptance matrix

“Passed” below means the implemented behavior is supported by regression/acceptance evidence, not that a human has approved the specification's unchecked checklist.

| AC | Status | Evidence |
|---|---|---|
| 1 | Passed | `validation-fix-routing.test.ts`, `AccessibilityValidationTabs.test.tsx`: reviewed rule/category/fallback precedence |
| 2 | Passed | `ReviewerValidationSummaryTab.test.tsx`: criterion/section/snapshot/historical/default precedence |
| 3 | Passed | `reviewer-validation.test.ts`: real SQLite session snapshots, concurrent saves and changed checklist; existing histories retained |
| 4 | Passed | Reviewer routes reject invalid metadata; shared Zod request validation rejects malformed repair input before task admission |
| 5 | Passed | `ValidationNavigation.test.tsx`, routing resolver tests: supported page/book destinations and labeled fallback |
| 6 | Passed | Resolver/navigation/API fixtures cover stored identity, sparse/reordered targets, malformed/foreign/ambiguous hints and unknown origin |
| 7 | Passed | Moved-owner review/assessment/repair regression in `validation-repair.test.ts`; retired/recycled-ID rejection and Phase A missing-focus tests |
| 8 | Passed | `SectioningValidationFocus.test.tsx`, missing-focus, Storyboard and navigation tests; browser entry consumes section focus once |
| 9 | Passed | Phase A navigation/unsaved draft suites, `ValidationRepairAction.test.tsx`, browser reload/lost-response/editor-return flow; failed review save retains draft |
| 10 | Passed | Navigation tests and real row/media comparisons; paid rendering requires separate confirmed POST; no verdict writes on navigation |
| 11 | Passed | Accessibility grouping and repair-reference tests keep incomplete versus confirmed findings distinct |
| 12 | Passed | Accessible named actions and confirmation exercised in Studio; extraction and strict compilation pass for en, pt-BR, es, fr, sq |
| 13 | Passed | `validation-repair.test.ts`: synchronized generated target admitted; manual/unknown/custom/fixed/legacy/retired/duplicate targets rejected; real confirmation/cost warning |
| 14 | Passed | API/common writer tests: active task without step row, stale paired versions, source/prompt/config races, mode lifecycle and protection; rejected state retained |
| 15 | Passed | Durable task tests plus actual-transport duplicate count; browser dropped response/reload; packaged duplicate/restart checks |
| 16 | Passed | Real transport counts, warmed-cache/fresh-write tests, selected repair, unchanged neighbors/history/media and consumer rows; representative editor/Preview/package marker |
| 17 | Passed | SQLite rollback, cancellation, source/render/prompt conflicts, journal faults and SIGKILL recovery; immutable history and media hashes retained; no paid restart |
| 18 | Passed | Artifact binding and new-assessment tests; representative/browser flows compare complete old automated and human evidence after rerender and explicit fresh validation |
| 19 | Passed | Phase A regressions retained, safe fallbacks remain independent; spec/INDEX in review, no self-approval or issue-closing claims |

## Reproducible verification

Working directory: `tmp/spec-0009-implementation`. Local raw logs and disposable books are under `tmp/spec0009-phase-b/`; they are not production data and are not committed. The reusable probes are committed under `scripts/probes/`.

| Command/check | Result |
|---|---|
| `pnpm test --maxWorkers=2 --testTimeout=30000` | Passed: 4656 tests / 385 files, 25 skipped tests / 2 skipped files; 507.59 seconds. Skipped executable suites are not counted as passed; dependency wire-budget evidence is separately identified below. Log `full-tests-reviewed.log` |
| Focused independent-fix regressions | 149 passed / 9 files; subsequent moved-identity/fixed-layout regressions 93 passed / 5 files |
| `pnpm typecheck`; `pnpm --filter @adt/runtime typecheck` | Passed |
| `pnpm lint`; `pnpm lint:invariants` | Passed, lint 0 errors / 8 unused-suppression warnings; invariant script currently automates extraction-reset checks, not every documented invariant |
| `pnpm --filter @adt/studio extract`; `pnpm --filter @adt/studio exec lingui compile --strict` | Passed, all five locales complete |
| `pnpm build`; `pnpm --filter @adt/studio build`; `pnpm --filter @adt/desktop build` | Passed; Studio reports large-chunk advisory |
| `pnpm --filter @adt/desktop typecheck` | Node check passes; web check fails on three unresolved `@root/scripts/release-*.mjs` imports. Same command at unchanged dependency head `c4ed8222` reproduces the exact three errors (`/private/tmp/spec0009-desktop-baseline-typecheck.log`) |
| `node scripts/probes/spec-0009-acceptance.mjs SOURCE_BOOKS NEW_EVIDENCE_DIR` | `acceptance-3`: passed on disposable `momograde1` plus fixed-layout fixture, two actual stubbed provider requests (render and answers), no extra request on duplicates. Every original database row, unrelated rendering and asset hash retained; distinct fresh marker reaches editor/Preview/package; separate validation and archive/import pass |
| `spec-0009-browser-fixture.mjs` + `spec-0009-browser-smoke.mjs` | `browser-3`: passed with production Studio/API, real Chrome and stub transport: confirmation, dropped accepted response, reload, actual task state, Storyboard return, explicit fresh assessment, old automated/human evidence unchanged; two provider requests, zero page errors |
| Docker `--target app` build and `spec-0012-docker-smoke.mjs IMAGE BOOKS NEW_DIR --validation` | Passed; final image `sha256:566d802fe464b4f2ec0803c8a184ed9c7ef46518f62661d769c823ed01983192`, packaged SPA served, read-only resources and container recreation, all 616 book files unchanged |
| Electron build/unpacked app plus bundled `spec-0012-desktop-smoke.ts … --validation` | Final build passed: macOS arm64, actual API utility process, read-only resources, duplicate accepted request and restart; 616 book files unchanged and 2399 resource files unchanged. Electron host 41.2.0; unpacked app packaging target 41.1.1 |

Earlier failures are retained in local logs, not relabeled as successes: the first full run found 28 failures and the next found the intentional fixed-layout artifact UUID mismatch; fixtures/assertions and the identified implementation gaps were corrected. The first representative probe safely rejected malformed stub activity-control IDs; the first browser probe had an incorrect URL glob. Final probes use corrected inputs/assertions. Provider tests count actual stubbed transport calls; no mocked helper-count or default-skipped executable test is used as proof of a provider budget.

## Dependencies, limits and human decisions

Direct base: published SPEC-0013 `c4ed8222088261f5a3d5663095d1bf743a896858`, still open. Its source/evidence establish shared bounded retry, cancellation, recovery and failure-safe publication; actual executable request counts are bounded by its published provider contract. Its green hosted run is [38186860502](https://github.com/unicef/adt-studio/actions/runs/38186860502). The dependency's 25 executable probes and 29 gate cases were inspected as published evidence, not rerun here or inferred from skipped tests.

The preceding implemented stack is SPEC-0001 freshness, SPEC-0002 manual/unknown preservation, SPEC-0003 mode lifecycle, SPEC-0010 safe continuation/publication, SPEC-0011 prompt capture and SPEC-0012 synchronization/stable ownership. The exact published heads and actual ancestor graph were refreshed before implementation and publication; newer unrelated ancestor-PR changes are not silently merged into this descendant. The recorded SPEC-0012 head is `d9dac25357dd971e4c970ebf19edc778468fb976`; its full-continuation, independent-full-review and platform evidence were read.

No known functional gap remains in the specified safe Phase B contract. Estimated implementation coverage is 100% of its 19 criteria; confidence is high within the tested contract. Human ratification of ownership mappings (including heading-order → Storyboard), specification approval and PR review remain pending. Unsupported fixed-layout semantic repair and protected/custom output are intentional safe boundaries, not claimed capabilities.

Release verification limits: no live paid provider experiment, signed/notarized installer, Windows/Linux desktop installer or release-tag deployment was run. Packaged-host probes verify persisted task protocol, duplicate identity, restart and byte preservation; fresh generation is exercised through the production shared path under stubbed transport, not a live paid packaged-host request. Desktop web typecheck baseline failure is reported separately above. No release certification or full issue closure is claimed.

PR #885 title/body are preserved byte-for-byte; updated scope/evidence belongs in its summary comment. Final head, exact-head hosted CI and comment URL are recorded in that publication comment and the task's final report. The readiness heartbeat is paused and no dependency PR was modified.

Published-head refresh before publication (2026-10-12):

| PR | Head | Purpose |
|---|---|---|
| #879 / SPEC-0001 | `65f0ac78ef4133493c4664f8686bb254a61580b8` | Per-consumer freshness |
| #880 / SPEC-0002 | `e5b93e57bd03a39d43cfd879c60fdcf603c6dbb3` | Manual-edit preservation; newly added single-page revert UI inspected, not a Phase B prerequisite |
| #884 / SPEC-0003 | `a5670d468d9945924503242b17992cb9b3e2ee57` | Mode lifecycle barriers |
| #886 / SPEC-0010 | `3a7ad4a33b18db8aac851c093712ce4d5112ec4d` | Safe continuation and publication |
| #887 / SPEC-0011 | `a1259013aa2a19bcc6f19e9a28fbc3a42e760e04` | Captured prompt inputs |
| #888 / SPEC-0012 | `d9dac25357dd971e4c970ebf19edc778468fb976` | Stable section synchronization |
| #889 / SPEC-0013 | `c4ed8222088261f5a3d5663095d1bf743a896858` | Shared retry/recovery, direct implementation base |
| develop | `beb6fbaab93b650838f0df542cad1c4c1d41484b` | Refreshed; SPEC-0013 remains open, so target uses its published branch |

Representative Studio screenshots: [confirmation](assets/spec-0009-confirmation.png), [completed task with unchanged finding](assets/spec-0009-completed.png).

Frozen PR metadata SHA-256 (UTF-8 string bytes): title `f054dd19b9162ebba8e49d5d6fdd19584ef3c0755b7da70ab39b369c9cec29cd`, body `c3bbfc3f05f5c0fb7d3839be18c12a2cdf179a4ffa6f18464603bfb6f955c5b1`. The original JSON capture remains local; these hashes support the post-publication preservation check.
