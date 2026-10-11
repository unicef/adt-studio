# SPEC-0012 full continuation

2026-10-11. This acceptance map precedes runtime edits. Specification approval
remains pending. The published specification, including its narrative and safe
fallbacks, is the target; its acceptance criteria are unchanged. PR #888 title and
body were captured byte-for-byte and are frozen for this continuation.

## Recovery and integration baseline

Recovered all eleven local commits through `caad1343`, including the stable-ID
classifier, read projection, Studio notices, independent-review fixes and the
transport-tested force-fresh implementation. Preserved
`backup/spec-0012-before-full-continuation-20261011` and
`backup/spec-0012-published-20261011` before replaying onto published SPEC-0011
`a1259013aa2a19bcc6f19e9a28fbc3a42e760e04`. Published #888 remains `b850875c`.
The remote branch name is unchanged. Other worktrees and untracked spec drafts
in the main checkout are untouched; no stash or target-worktree draft was found.

Refreshed stack: #879 `a10d3fa0`, #880 `373619dd`, #884 `a5670d46`, #886
`3a7ad4a3`, #887 `a1259013`; develop `8e79fb8b`. The actual graph contains the
five implementation prerequisites in that order. SPEC-0013 is not a dependency.
PR #581 (`8d077980`, Kemal Sokolovic) remains the attributed starting point for
pure propagation/optional text handling; it is not modified. Historical 35–40%
completion and missing-dependency reports are superseded by this integration
audit, not by an assumption that the published dependencies work together.

## Before-edit acceptance map

| AC | Current behavior | Required integration | Concrete verification |
|---|---|---|---|
| 1 | Pure patcher; saves do not call it | Server-owned shared Save | Real SQLite save with provider transport count zero |
| 2 | Patcher preserves bytes; old reconciliation normalizes HTML | Non-normalizing catalog reconciliation | Exact unrelated rows/HTML and media hashes |
| 3 | Escaping/blank/container fixtures exist | Retain through persisted saves | Activity page, injected markup, empty/optional leaves |
| 4 | Stable-ID classifier exists | Stable-ID save/repair adapters | Sparse/reordered arrays and duplicate page ownership |
| 5 | Pure structural/invalid fallback exists | Persist semantic edit while retaining output | Missing/malformed/structural source/API fixtures |
| 6 | GET protects all unknown outputs | Shared per-section generation evidence; manual protection | Generated history, forged metadata, manual divergence |
| 7 | Existing endpoint transaction lacks trusted correspondence | Extract shared atomic Save; validate both versions | Inject rendering/metadata failure; compare SQLite history |
| 8 | Semantic saves succeed but generic response | Authoritative per-section committed response | Unpatchable saves and subsequent reads |
| 9 | Saves append duplicates | Content equality and one combined rendering write | Already-patched pairs and repeated submissions |
| 10 | Source-only version guard and writer lease | Rendering guard and safe Studio draft lifecycle | Stale source/render, active task, late/ambiguous responses |
| 11 | Read-only unknown drift exists | Reconstruct from retained shared provenance | Reopen/restart, archive/import, restore; no added versions |
| 12 | Existing rerender task; notices always unknown | Guarded repair and authoritative completion | Success/failure/cancel/stale publication; notice persists |
| 13 | Rerender uses index and force-fresh | Stable targets, shared protection/mode/prompt capture | Real transport/cache counts; unrelated sections preserved |
| 14 | Fixed-layout notices exist | Retain semantic Save and supported navigation | Genuine positioned page; no semantic repair action |
| 15 | Old Save/rerender clear downstream nodes | Shared signature/catalog reconciliation, no deletion | Scoped freshness, manual history and referenced assets |
| 16 | Classifier never falls back to index | Repair expected versions and active ownership | Retired/restored IDs, recycled index, historical rows |
| 17 | Notices translated on old head | Committed editor/preview refresh, actionable notices | Studio deferred responses, navigation and five locales |
| 18 | Old evidence explicitly partial | Accurate final implementation/release evidence | Full AC audit, independent review, exact-head CI |

## Narrative and compatibility gates

Reuse OutputMetadata/input evidence, shared book writer admission, existing task
service, mode preflight, captured prompt engine and guarded publication. No paid
generation on Save, no array-position correspondence, no inferred AI origin from
matching text, no separate freshness database, no book-wide content clearing.
Unknown/invalid/manual/custom cases retain output and expose a review path.
Fixed-layout semantic-to-positioned synchronization remains explicitly out of
scope; product acceptance of that boundary and issue closure are separate.

Legacy callers must supply expected source and rendering versions; failures keep
their draft. Restored content remains versioned and old IDs never become a route
to successor sections. Saved source/render/provenance must commit atomically.
Failed/cancelled/stale repair retains output, media, history and valid caches.
No pipeline ordering, mode-policy or prompt-precedence changes are authorized by
this integration. Pending review proposals on dependencies are not silently
applied as amendments to their published contracts.

Required final gates: focused and full tests, typecheck/runtime typecheck, lint,
build, invariants, Lingui extraction/strict compilation; actual reflowable
activity and positioned page acceptance; archive/import and available Desktop/
Docker checks. A separate fresh adversarial reviewer must review the final diff,
with material fixes rechecked before pushing. Update this document with actual
results and limits; do not infer release approval from development checks.


## Final implementation and independent review — 12 October 2026

The complete published functional contract is implemented on the published
SPEC-0011 stack, including the shared scoped invalidation needed for #580 gap 3.
Estimated functional coverage is **100% of the specified scope**, with **high
confidence (about 9/10)** from the evidence below. This is an engineering assessment,
not a claim of approval, zero defects, issue closure or release certification.
Semantic-to-positioned text synchronization remains an explicit non-goal; its
product acceptance remains pending. No missing sibling spec blocks this scope.

Recovered commits were replayed rather than rebuilt. New integration commits
include `58863185` (shared Save/repair), `e7974d23` (Studio), `a7407df4` (real
storage/output evidence), `431ef6c9` (stable inspector queue), `01f1e078` (updated
contract fixtures), `fb5972f9` (retention-only custom review), `6b7f6187` (production
activity ID contract), `133245ea` (platform probes) and `563f7120` (final safety
fixes and independent report). The final reviewed tracked diff checksum in the
independent report matches the bytes committed by `563f7120`.

A **separate fresh reviewer**, which authored no runtime implementation, audited
the entire diff against all 18 criteria and the stack. Nine material findings
were fixed and rechecked: sparse inspector targeting, false page freshness,
custom-prefix repair bypass, generic destructive review, real generated activity
IDs, partial-repair provenance loss, retained fixed-tree read parity, duplicate
submission ownership and safe missing-section repair. The final independent
material recheck passed **55 tests / 6 files**, with no unresolved P1/P2 findings.
See the [full adversarial report](spec-0012-independent-full-review.md).

## Final AC-to-evidence matrix

“Passed” denotes implemented behavior with development acceptance evidence.
It does not mark the specification approved or certify a release.

| AC | Status | Concrete evidence |
|---|---|---|
| 1 | Passed | Real SQLite Sectioning/Storyboard Save; representative activity counts zero provider Save calls; packaged API and browser editor/preview show committed text. |
| 2 | Passed | Save and repair tests compare unrelated sections/rows, exact HTML bytes, custom scripts and asset hashes; representative and platform copies retain neighbors/media. |
| 3 | Passed | Pure escaping/blank/container tests plus actual `renderPage` activity control/answer IDs, safe substitution, and negative foreign/malformed IDs. |
| 4 | Passed | Sparse/reordered API fixtures; queued inspector 99/0 collision regression uses unique stable root; duplicate/foreign ownership rejects atomically. |
| 5 | Passed | Structural/missing/malformed Save cases retain rendering and return stable affected-section drift; missing repair is restricted to proven unique ownership. |
| 6 | Passed | Unknown/manual/forged provenance cases preserve output; supported Keep retains protected origin, later source edit reopens drift; custom variants cannot generic-render. |
| 7 | Passed | Injected second rendering and catalog write failures roll back semantic/render/provenance/history together in actual SQLite. |
| 8 | Passed | Unpatchable semantic edits commit with unchanged rendering version and authoritative persistent classifications. |
| 9 | Passed | Already-patched pair writes once; repeated identical content writes no source/render version; both packaged runtimes repeat the check. |
| 10 | Passed | Stale source/render guards, shared writer/task races, deferred/ambiguous/late responses, newer drafts and conflict recovery tests. |
| 11 | Passed | GET row comparisons; restart/restoration tests; real project archive export/import for both representative books; packaged restart preserves versions/drift. |
| 12 | Passed | Pending notice tests, actual provider-boundary cancellation/failure/stale publication, lost task/restart refresh; only authoritative committed comparison clears drift. |
| 13 | Passed | Stable repair API/task/service → mode preflight/captured prompts → force-fresh validated cache → guarded publication; unrelated targets/HTML retained; custom/protected review restricted. |
| 14 | Passed | Genuine positioned tree semantic Save retains editor/preview/package bytes; browser persistent limitation and supported Storyboard route; no semantic repair cure. |
| 15 | Passed | Shared output catalog signatures change only actual consumers, preserving manual translations/TTS, histories and assets; full-resume provenance regressions; no book-wide content clearing. |
| 16 | Passed | Retired/restored stable IDs and source/render guards reject successor-index redirection; stable preview/package lookup and ambiguous-root rejection. |
| 17 | Passed | Studio deferred-response, notice, inspector and draft tests; browser Sectioning Save → Storyboard v4 and activity Save → v5 refresh; all five locales extracted/strict-compiled. |
| 18 | Passed | This record separates full text sync/scoped invalidation implementation from deferred positioned sync, pending product/spec approval, issue closure and release tests. |

## Executed verification

| Command or flow | Result |
|---|---|
| `DEVELOPER_DIR=/Library/Developer/CommandLineTools pnpm test --maxWorkers=2` | **361 files / 4,385 tests passed** in 445.70s, including build pretest. |
| `pnpm typecheck` and `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm lint` | Passed with 0 errors and 8 warnings; warnings are not relabeled as baseline failures. |
| `pnpm lint:invariants` | Passed the available SPEC-0010 extraction invariant; other planned invariants are not claimed enforced by this script. |
| `pnpm build`, `pnpm --filter @adt/studio build` | Passed; Studio reports its bundle-size advisory. |
| `pnpm --filter @adt/studio extract` | Passed: 3,739 messages, zero missing translations in es/fr/pt-BR/sq. |
| `pnpm --filter @adt/studio exec lingui compile --strict` | Passed for all five locales. |
| `git diff --check` | Passed. |
| Representative book/production archive probe | All five checks passed; run-5 evidence described below. |
| Docker `app` rebuild and real nginx/API/SPA smoke | Passed, including container recreation and read-only resources. |
| macOS unpacked resources plus Electron utility-process API | Passed, including process restart and immutable resource hashes; exact host/version limits documented separately. |

Earlier full-test runs exposed old API fixtures missing the now-required paired
rendering guard, a fixture whose no-op edit no longer creates manual authorship,
and a derived text-catalog assertion predating scoped reconciliation. Those were
fixed with their preservation assertions retained. Git-spawning tests also failed
when Xcode's unaccepted license was selected; the final full command uses the
installed CommandLineTools directory and passes. No failure is dismissed as
pre-existing without evidence. Partial build attempts during active edits are
not counted as passing verification.

### Representative books and browser

`node scripts/probes/spec-0012-acceptance.mjs --source-book <momograde1-directory>
--fixed-book <spec3-b1-acceptance-directory> --out <fresh-evidence-directory>` runs
against copies and rejects an existing destination. Both original directory hashes
were unchanged. `momograde1` contains no original activity section, so the probe
explicitly generates a **new activity variant using its real pg005 source and
assets** through production workers and a stubbed provider transport. It does not
infer generated origin for old HTML. Two actual transport requests generate
activity/answers; compatible Save makes zero. Current renderer-minted button IDs,
answer references and custom bytes survive; editor/preview/package agree.
The retained original pg006 stays unknown-origin. The genuine positioned page
was recovered through existing mode/worker services before measuring semantic
Save; positioned tree/output/package remain unchanged. Production project archive
export/import preserves both books' exact node/history rows and media/font hashes.
The five-check report is `../spec-0012-full-evidence/acceptance/run-5/report.json`.

Real Studio browser acceptance used separate disposable run-4 copies on ports
39112/39113: Sectioning pg005 inline text edit, explicit Save, committed v4 source
and rendering; Storyboard activity text edit, Save activity, v5 and matching iframe
text; unknown pg006 persistent review; genuine fixed Sectioning limitation and
Open Storyboard navigation showing “Hyena and Raven” positioned text. Browser
input automation required native DOM click/focus/blur events through the supported
browser debugging API; actions still went through the actual React controls and
HTTP Save endpoints. No app state or persistence was injected to make Save pass.
Both fixed and legacy notices persisted after browser reload.
Deferred/conflicting task/draft flows were exercised by component/integration
regressions, not a paid real-provider browser run.

### Limits, decisions and publication

No known functional gap remains against the published scope. Approval of the
specification/stack, acceptance of the fixed-layout B1 boundary, and any decision
to close #515/#580 belong to humans. The issue references here are informational.
SPEC-0013 is not required for this implemented scope.

The [platform report](spec-0012-platform-acceptance.md) documents the actual Docker
image and Electron host/resource versions. No notarized installer, updater,
Windows/Linux Desktop UI, physical power-loss test, real-provider output-quality
run or release certification is claimed. Existing-schema archive round trips do
not certify arbitrary old-schema migrations as byte-identical.

The PR title/body were captured before work and remained byte-identical at the
pre-push check. Remote target `b850875cad8744ad49a0d4adf25422bae599e28e` and base
`a1259013aa2a19bcc6f19e9a28fbc3a42e760e04` were rechecked before publication.
The existing remote branch will be updated with an exact lease; hosted CI must be
verified against the resulting head. Final SHA, CI run and review request are
reported in the authorized PR summary comment, leaving title/body unchanged.
