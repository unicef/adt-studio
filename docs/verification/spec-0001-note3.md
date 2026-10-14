# SPEC-0001 approval-test follow-up — October 14

> **Superseded acceptance evidence:** the follow-up [real UI walkthrough](spec-0001-real-ui-2026-10-14.md)
> distinguishes actual editor-control interactions from this checkpoint's
> browser/API harness. In particular, earlier save probes submitted API payloads;
> they did not exercise the floating Save dispatch with mixed tree/HTML drafts.
> The subsequent real editor walkthrough found that combination could retain
> excluded HTML, and fixes and tests it. “No known must-fix” below describes the
> earlier review checkpoint, not proof that every production journey passed.

Starting head: `cb808fa58bb9f3ca6913165d5e30e377161ef51c`, based on develop
`0b18602f8b42f4b52b4d2ccf2927635d5a4db572`. Same PR #879. Reviewer commits
`f86406b9c` and `cb808fa58` are preserved. Spec approval remains pending.

## Requirement and acceptance map before editing

Note 3 findings 1/2 (first-attempt Missing presentation and accessible Overview)
are already published and need independent verification. Finding 3 requires
comparing editor text with saved HTML before back-propagating an actual user
change, retaining response-space evidence. Finding 4 revises the prior broad
reset decision: each generator's source inputs determine its reset, and retained
content needs a persistent, visible explanation plus Re-run. Finding 5 preserves
the current section-scoped Easy Read behavior. The addendum includes generation
publication and restores, not just editor saves.

| AC | Existing behavior / required change | Verification |
|---|---|---|
| 1 | Cosmetic API saves pass, but real editor can change blank-containing source | Actual editor-save regression with rendered/source mismatch, inputs and markers; real SQLite attempts/content unchanged |
| 2 | Protected translations and section-context Easy Read retained | Genuine text edit beside response controls; protected output suites and example 2 |
| 3 | Catalog/image reconciliation unchanged | Existing catalog/glossary/image suites; unchanged source generators for irrelevant media/style changes |
| 4 | Stable ownership/IDs retained | Unrelated leaves/answers/history preserved; generator page/section membership and reorder cases |
| 5 | Catalog signatures unchanged; generator reset basis too broad | Per-generator input changes/non-changes, including TOC original-page text, first headings and quiz scope |
| 6 | Warned usable content remains eligible | Existing runner suites; retained source content remains visible after reset |
| 7 | Manual/legacy preservation retained | Real-storage versions and history across source saves, reset, failure and retry |
| 8 | Cache behavior unchanged; Save makes no calls | Recording transport suites; browser saves make no generation requests |
| 9 | Shared writer and publication admission retained | Reset with source transaction, version rejection, restore, API/CLI and generation paths |
| 10 | Failure/cancellation safe publication retained | Failed/cancelled source-generator run keeps content and update reason |
| 11 | History/assets restore retained | Restore resets only affected generators and keeps restorable output/assets |
| 12 | Disclosure unchanged by first-attempt suppression | Verify missing work still disclosed in Preview/export and review evidence unchanged |
| 13 | Core TTS fallback unchanged | Existing preparation/fallback suites |
| 14 | Retry/cache policy unchanged | Existing real-transport preparation/speech suites |
| 15 | First-attempt rule added; source-generator reset currently silent | Sidebar + retained-content banner + reachable Re-run, active/dirty guards, restart/reload and five locales |
| 16 | Skip/prune/cancel policy retained | Source update reason survives failed/cancelled/skipped generation; successful relevant generation clears it |

## Boundaries

No generation on Save. No media hashing or new locking subsystem. Generated
Quiz/Glossary/TOC content stays outside per-output catalog regeneration; the new
message offers the existing whole-stage Re-run. Historical blank drift is not
silently repaired. Actual De-codable pg006 remains assigned to elasticsounds.
The original no-approval-before-implementation override remains in force, but
neither the spec nor ADR is self-approved. Delivery uses commits and a review
comment in the same PR, leaving its title/body unchanged.

## Implemented behavior and assumptions

The [review](https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5512531112)
and [addendum](https://github.com/unicef/adt-studio/pull/879#issuecomment-6160022831)
are addressed at runtime checkpoint `ab15d6d5`, following `f15381de` and
`079b3548`. No dependency/descendant branch was imported or modified.

- Both editor save entrypoints compare against saved HTML. Unchanged renderer
  differences do not alter sectioning. Genuine adjacent text edits retain
  native-input/blank-marker placeholders, answers, manual translations and
  unrelated leaves. Mixed tree/HTML drafts persist together; Save never calls
  automatic re-rendering or certifies an unmet structural edit as rendered.
- Shared actual collectors determine each generator's changed inputs. TOC
  ignores body-only changes, includes original TOC text only in extract mode,
  and observes section/page membership and reading order. Quiz uses selected
  page batches and semantic eligibility, validating only selected renderings.
  Glossary uses rendered page text. Style/script content and media bytes are
  not generator input signatures. Studio and CLI use the same collectors.
- Versioned reset metadata survives restart, failed/cancelled/skipped runs and
  manual output edits. Source writes, invalidation and metadata publication are
  atomic. Successful complete generation checks its captured inputs and
  clears only its own warning. No new lock or per-output catalog stage exists.
- Preparation retains source snapshots and all three source-generator outputs.
  A successful fixed-to-reflow publication retires only that page's positioned
  source in the rendering transaction. Failed publication retains the original
  pair and neighbors. Legacy positioned-only trees require semantic Sectioning
  before reflow; partial re-rendering cannot mix layout strategies.
- Retained content shows an amber indicator and “Generated before your latest
  edits” with Re-run. Running/cancelling, dirty drafts and unavailable-provider
  guards apply. The reviewer's first-attempt and Overview fixes remain intact.

**Documented compatibility assumptions:** no historical blank repair is inferred.
Legacy Quiz page IDs prove saved text coverage but not its missing section-type
policy; eligibility changes are conservatively detected until a successful run
records the policy. Unknown TOC mode is treated as extract. The new warning is
prospective: an earlier erased attempt cannot prove an older source reset, and
opening a book does not fabricate that history. Unchanged malformed legacy
renderings do not prevent cosmetic saves; meaningful changes with unprovable
collector input are conservatively flagged. These are explicit refinements in
the spec, not changed acceptance criteria or human approval.

## Independent review

A separate reviewer traced UI → API → publication/read-model paths and ran
122 tests across nine files plus independent real-SQLite probes. Its findings
were corrected and rechecked: fixed-to-reflow publication, index-only TOC
reordering, both mixed-draft save entrypoints, Save's automatic provider path,
and validation incorrectly blocking Quiz on an excluded malformed page.
No actionable must-fix finding remains from that review. Its component-level
UI and CLI code-trace limits are supplemented by the browser checks below;
a complete fresh-PDF CLI run was not performed.

## Final checks

All local runtime checks below apply to `ab15d6d5`; subsequent commits are
verification documentation only. Full tests include the four worked examples'
existing regression coverage, ownership compatibility, physical asset history,
shared writer admission, catalog fallback/retry and unaffected scopes.

| Check | Result |
|---|---|
| `pnpm test --maxWorkers=2` (includes build) | Passed: **337 files, 4,189 tests**, 258.47 seconds |
| `pnpm typecheck` | Passed |
| `pnpm --filter @adt/runtime typecheck` | Passed |
| `pnpm lint` | Passed: zero errors, eight unused-suppression warnings; no pre-existing-warning claim |
| `pnpm --filter @adt/studio extract` and `compile --strict` | Passed: 3,735 messages, zero missing translations in en, pt-BR, es, fr and sq |
| `SKIP_NOTARIZE=ALL CSC_IDENTITY_AUTO_DISCOVERY=false pnpm --filter @adt/desktop build:unpack` | Passed: unsigned macOS arm64 package |
| Actual packaged API + built Studio browser acceptance | Passed: cosmetic Save leaves generator state unchanged; genuine body edit flags Quiz/Glossary only; zero Save provider calls; failed Re-run retains visible content/warning; reload retains it; successful Re-run clears only Glossary; **two actual requests** at local stub HTTP transport; history/manual French/placeholder preserved |
| Representative/legacy preview | Passed with copied Momo Grade 1 and synthetic legacy activity fixture; 230-output catalog projection; zero browser page errors |
| Docker clean combined-image build | **Blocked:** attempted build failed during Playwright system-dependency installation with Debian package signature errors; Docker VM filesystem measured 100% full, zero available space. No successful clean final-image build claimed |
| Docker current-code runtime | Passed using this task's existing `adt-studio:spec0001-review-9f7eaa14` image with current server bundle, Studio, prompts/templates/config/assets bind-mounted; copied books only |
| Docker browser export/restart/Chromium | Passed: feature-filtered disclosure, 76-file ZIP with English/French freshness manifests and valid ZIP integrity, unchanged output evidence after export; three book projections and retained Quiz warning survive restart; bundled Chromium screenshot succeeds |
| `git diff --check` | Passed |

The full-suite run corrected old assertions that expected destructive
Storyboard preparation; explicit invalidation/restore and permanent quiz-ID
reservation remain covered. Test fixture/automation corrections are not product
failures: the legacy guard fixture needed the actual placement-map shape, and
the browser harness needed the object-shaped step status and current legacy
reading order. The final checks above use the corrected fixtures.

No runnable `lint:invariants` command exists at this head; relevant invariants
are exercised by the storage/pipeline/API suites and type/lint checks. No
unavailable check is reported as passed. Docker's working bind-mounted runtime
is not a clean release-image build. No unrelated Docker data was pruned; the
acceptance container was stopped after verification.

## Final AC-to-evidence matrix

“Passed” means recorded development evidence, not human spec approval or release
certification. Existing named suites were rerun in the final full suite. Earlier
four-example browser evidence remains in the dated
[compatibility ledger](spec-0001-leaf-compatibility.md); it is not relabeled as a
new walkthrough. The new packaged/browser cases are described above.

| AC | Status | Evidence at this checkpoint |
|---|---|---|
| AC-1 | Passed | Editor placeholder/renderer-drift tests; `storyboard-source-inputs.integration.test.ts`; packaged cosmetic Save makes zero provider calls and preserves generator state |
| AC-2 | Passed | Catalog/scoped-speech/review-preservation suites; adjacent genuine text edits preserve manual French and answers; section-context Easy Read remains unchanged |
| AC-3 | Passed | Catalog/glossary-identity/image-captioning suites; source-generator signatures ignore irrelevant image/style changes |
| AC-4 | Passed | Ownership/identity/structural suites; index-only reorder, per-page fixed strategy publication, retained neighbors/history |
| AC-5 | Passed | Canonical output signatures plus actual per-generator collectors; body/heading/original-TOC/membership/policy selectivity |
| AC-6 | Passed | Shared speech/catalog runner suites; actual Quiz request succeeds with a malformed excluded page and usable selected input |
| AC-7 | Passed; pg006 not run | Real SQLite/version rollback/review/ownership suites; packaged mixed-save preservation and legacy activity preview; actual pg006 reserved for elasticsounds |
| AC-8 | Passed | Recording-transport cache/retry suites; two real local HTTP requests across failed/successful browser Re-run, zero calls on Save |
| AC-9 | Passed | Shared admission/concurrency/scoped execution suites; late source-result rejection, transaction rollback, assistant paired writes |
| AC-10 | Passed | Filesystem speech/timing publication suites; source-generator transport failure/cancellation retains output and warning |
| AC-11 | Passed | Immutable assets/history/restore and packaging suites; source/output restores selectively retain/reset warnings, no-op restore does not dirty |
| AC-12 | Passed; pg006 not run | Ownership/packaging suites; packaged previews and Docker web ZIP/disclosure leave evidence unchanged; actual pg006 reserved for elasticsounds |
| AC-13 | Passed | Core TTS/catalog-preparation/shared-speech suites: requested-language fallback and protected manual speech text |
| AC-14 | Passed | Actual transport retry/reuse suites: failed/never-attempted/checked preparation states and unchanged audio reuse |
| AC-15 | Passed | First-attempt/Overview regression suites; notice/sidebar guards; live visible warning, explicit Re-run, reload/restart persistence; five locales |
| AC-16 | Passed | Scope/skip/prune/cancellation suites; persistent warning survives unsuccessful attempts and clears only on complete relevant publication |

## Completion and verification limits

All four SPEC-0001 slices and AC-1–16 are implemented under the documented
compatibility assumptions, including this round's two open findings and
addendum. This is not only the earlier omission-only safe slice. No known
must-fix code item remains from the feedback reviewed here. Confidence is high
for the exercised paths; it is not a guarantee that future real-book testing
cannot reveal another defect.

**Still not run:** elasticsounds' actual De-codable pg006 acceptance; a clean
final Docker image after disk/package installation is repaired; a complete
Electron GUI/fresh-PDF CLI walkthrough; live paid-provider quality/billing;
signed/notarized installers and Windows/Linux Desktop packages. These limits
are separate from completion of the requested code. Human approval and release
certification remain pending. Historical blank drift and already-erased reset
history need deliberate recovery evidence if pursued later, not silent repair.

[Machine-readable results](evidence/spec-0001-note3.json) summarize the checks.
Local detailed logs, browser harnesses, copied fixtures, screenshots and ZIP use
`/private/tmp/spec0001-note3-*`; they are local evidence, not hosted CI artifacts.

