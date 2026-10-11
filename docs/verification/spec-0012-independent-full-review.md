# SPEC-0012 independent full implementation review

12 October 2026. **No unresolved P1/P2 finding remains in the reviewed local
implementation after the corrections and rechecks below.** This is a code and
development-verification disposition, not human specification approval, release
certification, issue closure, or permission to merge.

## Reviewed state and method

The comparison base is published SPEC-0011
`a1259013aa2a19bcc6f19e9a28fbc3a42e760e04`. The final focused recheck used
`6b7f6187c7c5818e0458b056931b67e47449ce47` plus the working-tree corrections in:

- `apps/api/src/routes/pages-sync-save.test.ts` and `pages.ts`;
- `apps/api/src/services/page-edit-service.ts`, its test,
  `sectioning-repair.test.ts`, and `storyboard-save.ts`;
- `packages/pipeline/src/generation-catalog.ts`, `index.ts`, and
  `sectioning-sync-evidence.ts`;
- the reviewer regression
  `apps/api/src/services/storyboard-save-provenance-review.test.ts`.

Before adding this report, the tracked `git diff --binary` SHA-256 was
`f345792cc048640dddafcc3682dc9c9fd2ab88f1eb46a4b6cd0d01c7b6827c86`.
The separate reviewer regression SHA-256 was
`f4167d52f8b4127656208cd9afe290abd50b370542c040029340067d82d9815f`.
These identify the tested changes without pretending they were already committed.
The implementation owner records their eventual integration commit and final
whole-repository verification separately.

The review read the complete published specification, the before-edit map in
`spec-0012-full-continuation.md`, AGENTS, architecture, guidelines, invariants, and
ADRs 024–027. It traced Studio controls through HTTP, writer admission, real
SQLite state, classification, candidate publication, shared freshness, previews,
and packaging. It examined unhappy paths independently of the implementation
authors' green test reports. No runtime changes were authored by this reviewer;
the reviewer added the isolated freshness/custom regression and this report.

The old September review remains historical evidence for the earlier bounded
classifier/read/notice slice. Its missing-integration and dependency conclusions
are superseded for this local state. Published prerequisite implementations were
inspected as part of the integrated stack; their existence alone was not treated
as proof of safe composition. The PR #581 attribution remains in the classifier.

## Findings resolved and independently rechecked

Priorities describe the observable defect before correction. References point to
the corrected files; the source lines may move when the owner commits the fixes.

| Priority | Observable failure before correction | Correction and recheck |
|---|---|---|
| P1 | `StoryboardSectionDetail.tsx` displayed a section by stable identity but flushed queued inspector HTML by `sectionIndex`. With target source index 0, stored hint 99, and sibling hint 0, Save could replace the sibling with the target HTML. | `rendered-section.ts:31` merges only a unique stable target whose root identity is unchanged; the queue also captures editor scope and the separate fixed-page mode. Unmatched edits remain drafts and Save refuses them. Six selector/merge tests pass, including the sparse collision and byte-identical sibling. Fixed in `431ef6c9`. |
| P1 | `storyboard-save.ts` could make a page current for a changed model/prompt/configuration merely by patching source text. The shared resume catalog then skipped required generation despite output being produced under old settings. | `pageGenerationStatus` captures shared freshness before source mutation. Whole-page provenance advances only from an already-current generated baseline; otherwise the old stale signature remains with the correct new content hash. A real-storage regression changes the default model, saves a text edit, and confirms `updateNeeded` remains true. It failed before the fix and passes afterward. Unknown pages cannot acquire whole-page AI authorship from section proof alone. |
| P1 | `sectioning-sync-evidence.ts` blocked only exact `activity_custom`, while supported `activity_custom_*` variants could expose generic destructive repair and lose custom scripts. | Custom matching uses the established prefix contract at line 86. Both base and variant regressions retain the complete rendering and require review. The variant failed before correction. |
| P1 | The synchronization review path mounted unrestricted `OutputReview`; custom/protected drift could reach generic page-wide generation or explicit replacement through its buttons or nested upstream review. | `SectioningSyncNotice.tsx:55` supplies retention-only review. `OutputReview` hides and guards generation/replacement/retry and propagates that restriction through source review. Keep and supported Storyboard editing remain available. Five tests use the actual shared component, including stale generated custom output and an already-open replacement. Fixed in `fb5972f9`. |
| P1 | The current renderer minted IDs such as `pg005_sec007_activity_<24 hex>`, but the classifier accepted only older activity ID forms. Valid generated controls were immediately structural drift; compatible Save could not patch them and repair could fail its own authoritative verification. | Renderer allocation and classifier recognition now share `generated-activity-identity.ts`; recognition does not establish authorship. Six tests exercise actual `renderPage` output through real prompt/validation/model wrappers with stubbed provider transport, preserve answer/control references, patch escaped text, and reject foreign/malformed IDs. Fixed in `6b7f6187`. |
| P2 | A partial repair dropped whole-page generation evidence, turning known generated output into protected unknown output for shared full resume. A first attempted hash fix did not use the catalog's HTML-plus-positioned projection. | `page-edit-service.ts:290` retains valid previous generated provenance conservatively stale and refreshes its content hash with the exact shared `storyboardGenerationContent` projection. The real repair regression confirms generated, unprotected, still-stale catalog state rather than false freshness or unknown authorship. |
| P2 | After changing fixed configuration to reflowable while retaining the active positioned tree, Save recognized the fixed boundary but GET did not. Reopening could lose the positioned preview selection and show inconsistent synchronization behavior. | GET at `pages.ts:1096` and Save both recognize the active non-null positioned tree. A real positioned-output regression verifies persistent fixed limitation, no repair action, and no GET writes. |
| P2 | A changed submitted rendering could introduce duplicate stable roots and leave ambiguous output that readers could not select. An initial guard also risked rejecting an unrelated valid edit merely because a byte-identical legacy or pruned sibling remained. | Save checks changed/new entries for unique active ownership and prevents additional explicit duplicates. Byte-identical retained siblings are allowed. Duplicate submission is rejected atomically; two separate retained-pruned/identityless cases save the valid authored edit without modifying the sibling. |
| P2 | A genuinely absent owned target was sent to review even when all remaining renderings had unique, proven page ownership and targeted generation could safely append it. | Missing-target repair is limited to that unambiguous case. Identityless, malformed, duplicate, custom, protected, and foreign cases stay conservative. Updated real Save and repair checks pass. |

## Acceptance criteria audit

“Passed” below means the stated development behavior was reviewed and covered by
the executed checks. It does not mean release acceptance. Broader manual/platform
checks remain explicitly separate.

| AC | Review status | Evidence and boundary |
|---|---|---|
| 1 | Passed | Shared server-owned Save patches proven compatible text; real SQLite Save counts zero provider calls. Actual renderer-produced activity output now also passes classifier/patch integration. |
| 2 | Passed | Exact byte/object comparisons preserve untouched sections, attributes, image references, answer references and custom scripts. Save/repair tests retain unrelated rows and physical media. |
| 3 | Passed | Escaping, placeholders, optional/container IDs and supported activity IDs are exercised. Unsupported structures or contexts retain prior HTML rather than guessing a substitution. |
| 4 | Passed | Classifier, Save, repair merge, editor selection, queued inspector flush and sparse output readers use stable identity. The inspector collision regression closes the newly found wrong-target path. |
| 5 | Passed | Structural/missing/malformed/invalid rendering is retained and returns explicit drift. Malformed legacy JSON and invalid neighbor graphs produce uncertainty rather than false proof. |
| 6 | Passed | Source equality alone is not generated-origin evidence. Shared metadata must match content and retained source history. Forged client metadata cannot grant authorship. Custom variants and unknown/manual review paths retain output; Keep remains scoped to exact reviewed inputs. |
| 7 | Passed | Both Save entry points use shared writer admission and one real SQLite transaction. Injected rendering and catalog failures roll back source, rendering, pointers and metadata together. |
| 8 | Passed | Expected unpatchable cases commit the semantic edit successfully while retaining output and returning an authoritative drift response. |
| 9 | Passed | Already-patched pairs are validated against the server candidate and write once; identical repeat submissions add no content versions. |
| 10 | Passed | Both expected versions are required. Stale source/render guards, competing writers and active pipeline tasks reject without writes. Studio tests preserve drafts through conflicts, ambiguous transport failures, query refreshes, navigation and late responses. |
| 11 | Passed for current-schema persistence | Read-only projection survives reopened handles, copied book directories and restored current pointers, preserving historical rows/assets. Actual archive routes, old-schema migrations and operating-system process restart are not independently exercised by this review. |
| 12 | Passed in service/component checks | Pending notices persist; only authoritative verified committed output clears them. Real repair cancellation/failure/input-change checks retain old output/cache. Component tests cover vanished task records after restart. Killing and restarting the actual server during a provider call was not independently run. |
| 13 | Passed | Repair validates stable IDs, both versions, protection, mode, captured prompt/input signatures and cancellation before publication. Shared writer/publication machinery retains unrelated output. Real model wrappers with stubbed transport verify fresh calls, ordinary cache reuse, and retained cache on failure. No paid-provider behavior is claimed. |
| 14 | Passed implementation; product acceptance separate | Genuine positioned fixtures retain semantic/positioned separation in Save, GET, preview and packaging. The limitation stays visible and has no misleading semantic repair action, including retained positioned output after a configuration switch. Semantic-to-positioned synchronization is intentionally absent. |
| 15 | Passed | Shared catalog reconciliation scopes freshness to actual consumers without destructive clearing. Source/render/downstream histories and assets remain. Save no longer certifies changed generation settings; partial repair retains valid generated provenance without certifying untouched inputs. This is the integrated #580 gap 3 behavior, not an issue-closure decision. |
| 16 | Passed | Current pointers and active ownership distinguish restored/retired IDs from successors using recycled indices. Stale or retired repair targets cannot redirect publication. |
| 17 | Passed in code/component checks | Committed source/render versions invalidate editor and preview data. Draft hooks reject stale response application. Notices have accessible status/action behavior; all five locale catalogs are present. Whole-browser acceptance and final Lingui/typecheck/lint results belong to the owner's verification record. |
| 18 | Reporting reviewed; release/closure pending | This report separates implemented behavior, shared prerequisites, the fixed-layout limitation, independent checks and unrun acceptance work. The final continuation record must add exact committed head, repository checks, platform/acceptance results and hosted CI before any release or closure claim. Human approval remains pending. |

## Checks executed by this reviewer

The following are separate runs, some with overlapping files. Their counts must
not be added and presented as a unique test total.

| Run | Result |
|---|---|
| Initial integrated Save, repair, fresh-cache, queued-render selection, both draft hooks and synchronization notice | 8 files / 61 tests passed. |
| Pure classifier, real page read projection, shared Storyboard publication and force-fresh model wrapper | 4 files / 102 tests passed. |
| Intermediate material-fix recheck | 40 of 41 passed. The failure was the old expectation that a proven missing target had `action: review`; the runtime correctly offered the newly supported safe repair. The expectation was corrected, then included in the final run. |
| Final material-fix recheck on the state identified above | **6 files / 55 tests passed**, 41.81 seconds. Covers production-rendered activity IDs, real Save, reviewer provenance/custom cases, repair, actual retention-only OutputReview and queued-render stable merge. |

Final command:

```sh
pnpm exec vitest run \
  packages/pipeline/src/__tests__/sectioning-sync-rendered-activity.test.ts \
  apps/api/src/routes/pages-sync-save.test.ts \
  apps/api/src/services/storyboard-save-provenance-review.test.ts \
  apps/api/src/services/sectioning-repair.test.ts \
  apps/studio/src/components/pipeline/components/SectioningSyncNotice.review.test.tsx \
  apps/studio/src/components/pipeline/stages/storyboard/lib/rendered-section.test.ts
```

The reviewer also observed failing reproductions for the stale-generation
signature and custom-prefix problems before their fixes. Reports from the
implementation agents about broader green suites were useful coordination
evidence but are not relabeled as independently executed checks here.

## Limits and handoff

No remaining reviewed defect requires another runtime change before the owner
finishes its final verification. Any subsequent material implementation change
needs a focused recheck; committing the exact reviewed bytes does not.

This reviewer did not independently run the full repository suite, final builds,
Lingui extraction, packaged Electron launch, Docker image/daemon, hosted CI,
actual book browser interaction, real archive import routes or real provider
calls. The owner is separately running representative-book acceptance, including
production generation with stubbed transport, packaging and archive/import; its
results must be attributed to that record. Unit tests with copied directories
are not a substitute for those routes. Existing database initialization and
migrations also mean read-only current-schema tests cannot certify an old-schema
archive open as byte-identical.

No PR title/body, remote state, reviewer request, merge, issue status or spec
approval was changed by this reviewer. Preserve PR #888's published title/body
and use the existing PR for the reviewed implementation. The full continuation
record is the place to bind this review to its eventual committed head and exact
verification/CI results.
