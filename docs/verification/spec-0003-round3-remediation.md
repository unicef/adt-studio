# SPEC-0003 round-three remediation (local work in progress)

The owner authorized addressing every confirmed finding from both independent
reviews on November 3, including the inherited corrupt-database Library failure.
Starting candidate: `4a16cd1e27f741b37dab90ce7ce33406eb762d50`; implementation parent:
`0d8021ec152d026b7c01e82bc176c7bab9f32a19`. The earlier readiness recommendation is
superseded by these reproduced defects. Nothing in this record grants approval,
defers a finding, or authorizes remote publication. PR #884 stays unchanged.

Original AC-1–26 mappings remain in `spec-0003-oct12-audit.md`. This work repairs
the revised contract without changing the acceptance criteria. Both reviewers'
original reports and reproduction artifacts are retained in the repository's
ignored `.local-docs/spec0003-round3-{codex-20261103-121243,claude-code-20261103-121320}`.

| Finding | Contract / current defect | Required shared-boundary change | Verification and public entry points | Disposition |
|---|---|---|---|---|
| F1 P1 | Book storage/path containment; packaging writes outside its staging directory for unsafe IDs | Validate editable identities and contain every output member before writing; imported records fail safely | Storyboard PUT → Package task; prior export and sibling-book canary hashes unchanged | Pending |
| F2 P1 | RAC-6, AC-24; changed prompts consume an old reset receipt | Bind selected resolved prompts and their version/content to consent and revalidation | Immediate, queued, in-flight prompt controls; zero calls/reset for stale receipt; fresh consent succeeds | Pending |
| F3 P1 | RAC-7/12/18; cosmetic draft restores deactivated HTML | Guard rendering writes with captured selected rendering version, including both public writers and Studio | Failed reset and successful rerun with dirty second client; 409 preserves draft/history; next fresh save succeeds | Pending |
| F4 P1 | RAC-2/9/11; legacy fixed pairs and empty outputs misclassify layout switches | Use the shared usable-pair resolver for actual published layout | Legacy fixed, empty first run and mixed-switch fixtures through ordinary/targeted/combined routes; publication barrier | Pending |
| F5 P1 | RAC-12/13/18; page-local IDs collide in public namespace | Reject new book-wide collisions; safely disclose/omit ambiguous imported owners in every reader | Two pages with same ID, public saves, manifest/URLs/coverage and actual ZIP | Pending |
| F6 P1 | RAC-13; a failed artifact replaces working export | Validate staged package with shared member validator before directory swap | Missing stylesheet, task/status/first download, previous ZIP bytes and recovery | Pending |
| F7 P1 | RAC-12/13; missing referenced media passes package completeness | Share required media/member validation across build/cache/download | Remove referenced image/media; status/download fail safely; cache rebuild repairs exact member | Pending |
| F8 P2 | Repeated idle step-status rereads all packaged bytes | Reuse bounded verification with selected-version/file-identity invalidation | Count actual file reads on unchanged HTTP polls; restore, swap, member changes invalidate | Pending |
| F9 P2 | RAC-16, AC-20; part-window task error is English-only | Stable typed error/parameters through task and client in five locales | Real targeted task outside window → polling/SSE → localized mapper; extraction/strict compile | Pending |
| F10 P1 | RAC-9; late event subscriber misses already published page | Initial catch-up after listener registration refreshes status and page availability | Two clients before/after page-one commit, page two held, actual saved page opens without reload | Pending |
| Claude F-R3-1 High | Corrupt book DB aborts entire Library (inherited, expressly authorized) | Narrow typed corruption isolation while preserving DB/history and surfacing per-book unavailability | Real truncated SQLite + healthy neighbor via Library/API; repair restores listing; unrelated errors still propagate | Pending |

All checks are pending on the repaired candidate. Previous reports' green full
suite and package checks do not exercise these failures. Record initial failures,
focused regressions, complete branch checks, platform probes, and a separate
independent recheck at the final frozen head here before claiming readiness.

## Bounded independent recheck, first candidate

The writer froze `623b52b56d8dd6820bf4c8b35080a204dc3483a9` after the first repairs.
At that exact source head, `pnpm test --maxWorkers=4` passed 501 files / 6,365 tests,
with 16 Linux-only cases skipped on macOS. Root/runtime/Desktop typechecks, lint,
Studio build, fresh extraction (unchanged catalog bytes), and strict five-locale
compilation also passed. This is a checkpoint, **not final acceptance**.

A separate reviewer derived its own map from the original reports and authorized
contract before seeing these changes. Its bounded source recheck is retained at
`.local-docs/spec0003-round3-bounded-recheck-20261103/623b52b5/source-recheck.md`.
It found three additional in-scope defects; none is deferred:

| Recheck | Before-fix evidence | Correction and regression |
|---|---|---|
| IR3-1 P1 / F7 | A comma without following whitespace in `srcset` hid a missing high-density image; real filesystem probe returned `true`. | Parse HTML candidate boundaries, preserving data-URL commas. Verify every local candidate in staging/cache/download; missing asset and subsequent repair are exercised. |
| IR3-2 P1 / F3 | Queued AI-edit accepted stale client HTML after a same-layout rendering update; it also adopted a newer rendering version at dequeue. Both rejection regressions failed against `623b52b5`. | Require the originally viewed rendering version alongside the semantic version at admission, execution and publication. Studio sends the captured draft version and keeps a rejected instruction/draft. Fresh consent still succeeds. |
| IR3-3 P2 / F5 | Malformed quiz JSON newly threw from unrelated section coverage. | Isolate unreadable quiz identity evidence without changing raw quiz data. Healthy saved page reads/coverage remain available. This does not certify the broken quiz as complete. |

The writer also reproduced two adjacent boundary cases: root-absolute image URLs
were misread as bundle-relative files, and readable legacy quiz arrays without
document metadata did not reserve their public IDs. Both are corrected and have
real filesystem/storage regressions. Original reproduction output is retained in
`results/recheck-counterexamples-before.json`; the corresponding after-repair
receipt is `results/recheck-counterexamples-after.json`, under the remediation
evidence directory.

API compatibility: saved HTML now requires its selected `baseVersion` on the
standalone rendering writer; combined Storyboard saves and AI-edit requests use
`renderingBaseVersion` separately from semantic `baseVersion`. The current Studio
supplies these values from the edited snapshot. An old client omitting a required
guard is rejected rather than allowed to reactivate or overwrite newer HTML.
This is an implemented concurrency contract, not an unapproved scope deferral.

Final public/browser, package/restart, complete-branch and independent runtime
recheck results remain pending below. The 16 skipped macOS cases require their
separate Linux execution; they are not counted as passes here.

The follow-up at `b105e094` found IR3-4 (P1), the same public-identity boundary:
a readable legacy quiz missing unused `reasoning` / deprecated `quizIndex`
still escaped reservation. A real-SQLite counterexample retained `qz001` in the
reading order while accepting its section claim. Identity-only reservation now
rejects that claim without normalizing or rewriting the legacy quiz. The receipt
`results/recheck-counterexamples-after-sparse.json` and the parameterized HTTP
regression compare unchanged quiz history and source versions. Focused regression:
3 files / 210 tests passed (including queued AI-edit admission/publication).
The positive AI-edit fixture now sends its current rendering guard so its later
stale-source case reaches the intended publication check; separate regressions
retain the stale-render rejection checks. The b105 full-suite run was interrupted
for this correction and is not counted as a completed pass.

The same recheck then identified `quizId: null`, which the shared legacy resolver
accepts as a missing ID. Its real-SQLite before receipt also escaped reservation.
Reservation now invokes that shared resolver directly for each object entry,
catching only its identity-validation error; it no longer applies a stricter
write schema to readable legacy identity. The null case joins the HTTP matrix
and passes with unchanged raw/history records. Its before/after receipts are
`recheck-counterexamples-null-id-before.json` and
`recheck-counterexamples-after-null-id.json`. The intermediate `8d0e52bf`
full-suite attempt was stopped and is not final acceptance evidence.

## Final audit additions after the independent runtime checkpoint

At `24fdaa82`, the complete branch passed 501 files / 6,375 tests (16 Linux-only
skips); the independent bounded runtime recheck separately verified 382 selected
cases and 24 additional real filesystem/SQLite/Hono checks. These are exact
checkpoint results, not a claim that later changes were tested at that head.

The final diff audit identified a remaining R4/RAC-16 gap in the new HTML save
validation branches: malformed requests returned raw English, and AI validation
incorrectly blamed versions even when the instruction was empty. The reviewer
confirmed this narrow finding. All three schemas now return HTTP 400 with the
stable `STORYBOARD_REQUEST_INVALID` code, translated through the existing shared
mapper in all five locales. Stale writes remain HTTP 409. Four actual route
regressions failed before the correction and pass afterward with unchanged
history and no task submission; mapper regression and strict compilation pass.

The first public acceptance replay also exposed a fail-closed liveness defect:
a background canonical status fetch could be deduplicated into an explicit
protection read, bypassing that read's completion callback. The second Sectioning
confirmation then falsely reported inability to verify content after HTTP 200.
The independent reviewer confirmed the mechanism. Explicit protection reads now
use unique transient query keys under the same book/status prefix; ordinary
status refreshes target the canonical key exactly. Aborted reads and changed
book/stage scopes still cannot authorize work, deliberate prefix cancellation
still works, and each temporary query is removed. The new real-QueryClient
regression failed before correction; 62 focused UI cases pass, including cancelled
fresh reads, warm-cache controls, frozen consent and cross-book/ABA protection.

Earlier replay evidence is preserved, including harness limitations: completed
stage service runs return `idle` (tasks return `completed`); invalid-first live
By Page generation yields actual transport counts 2/1/0 because the feedback retry
has different inputs from the next ordinary request. Text-only fixed fixtures
must explicitly classify extracted images as pruned; an empty classification
array is not a prune decision. A Node-hosted test API must not claim Electron's
utility-process screenshot environment. None of these corrections weakens a
product assertion or certifies missing input. The final run uses fresh private
fixtures under `.local-docs/spec0003-round3-final-20261103`; kept real illustrations
remain separately exercised by the representative PDF probe.
