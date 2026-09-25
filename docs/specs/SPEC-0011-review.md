# SPEC-0011 implementation review

## Scope and method

Reviewed the local implementation starting at `4484d267`; fixes are committed in
`a4671d0c`. The review used the complete
published SPEC-0011 contract, its 18 ACs, narrative requirements, compatibility,
rollout and non-goals. This is a fresh adversarial review of the work in the same
task, not an external human approval. The specification remains in review and
ADR 027 remains proposed.

At review time, the isolated branch was `spec/629-prompt-persistence`, based on refreshed develop
`737d331418d13f930955504e8288ee26ec1b20ba`. The remote PR then had specification
head `bb37a583c9080315a23aed6a0c9925d140d6d739` and the old documentation-stack base;
the implementation and review fixes were local only. No push, merge, replacement
PR or change to #644 was made. Current #887 comments and reviews were empty.

The review traced editor buffers and navigation guards through HTTP revisions,
root admission, immutable versions, selection publication and reload; traced
generation root injection through stages, targeted edits, agents, CLI and raw
image prompts; and inspected cache inputs, prompt-call provenance, migration,
archive snapshots and deployment roots. Existing transport/filesystem/process
regressions were retained. New editor regressions exercise actual controllers
and components with deferred API responses; Monaco is represented by a textarea
adapter, so those tests do not constitute live Monaco/browser acceptance.

## Findings fixed

| Severity | Finding and impact | Correction / evidence |
|---|---|---|
| P1 | Typing back to the original server text during Save cleared the draft before the submitted response arrived. Both global and book editors then displayed the submitted text and lost the newer revert. AC-11. | Retain the explicit buffer while Save is pending, even when it matches the old server bytes. Global controller and book viewer regressions reproduce the loss before the fix and retain the newer dirty draft afterward. |
| P1 | With an unset stage model, preview/editing selected the generic prompt while generation inherited the configured default model. Hidden refinement/image/review editors also lacked their actual execution model, and some model actions assumed the built-in base model. Edits could target a prompt generation would not consume. AC-1, 3, 4, 12. | Resolve the inherited generation model, pass the execution model into hidden viewers, wait for initial book configuration, and use the configured base model in tree/copy/reset classification. Actual viewer and configured-base helper tests cover the corrected behavior. |
| P1 | The alternate file reset fetched a fresh revision immediately before mutation, bypassing the visible draft's loaded revision. A concurrent selection could be reset without showing a conflict. Historical bytes remained recoverable, but the user's concurrency intent was lost. AC-5. | File/folder reset uses the displayed/cached revision, preserves drafts, refreshes conflict state, and blocks conflicting local controls. The alternate-reset regression verifies the old revision is submitted and the draft remains visible on 409. |
| P1 | A late history-selection response could be passed to a viewer now showing a different book, potentially updating the wrong cache or clearing that viewer's draft. AC-11, 17. | Scope response caches to submitted book/name/model and guard draft changes against the current selection. The navigation regression confirms only the original book cache changes and the new viewer callback is not invoked. |
| P2 | Retained history could still activate a version when its parent was read-only/busy. Unmounting a pending history view could leave the editor stuck in its pending state. AC-5, 11. | Honor the disabled flag on activation; block competing controls and panel toggles; release pending state on unmount. Component tests cover retained-history disabling and pending cleanup. |
| P2 | Book Reset and history Restore did not reconcile a lost response before offering another attempt. Server revisions prevented silent duplicate commits, but the client did not meet the promised retry protocol. AC-7, 8. | Re-read the authoritative selection after non-conflict errors without automatically retrying a mutation. The lost-restore-response test verifies one mutation and a subsequent read of the committed state. |
| P2 | Copy actions claimed files were created when identical-content Save correctly returned a no-op. Selected models could also have no accessible inherited entries in the tree. AC-1, 7. | Count actual changed revisions, explain no-op inheritance, expose inherited prompts for the selected model and retain the spec's no-op rule. The copy regression verifies no false creation toast. |
| P2 | The navigation dialog inferred “Save & Re-run” from the separate rerun button, although the revised stage-settings leave action only saved. AC-1, 13. | Stage settings explicitly declare that leaving does not rerun. The shared store preserves legacy behavior for other consumers; regression tests verify the leave action calls Save and never the opt-in rerun handler. |

The original no-op acceptance criterion was not weakened to preserve an old
“create files” success message. Matching content continues to inherit until it is
edited, and the UI now explains this. No automatic regeneration, new dependency,
provider-discovery rewrite, prompt-schema change or separate freshness engine was
introduced.

## Acceptance and confidence

The [AC evidence matrix](SPEC-0011-implementation-evidence.md) remains the primary
18-row acceptance record. This review strengthens AC-1, 3–5, 7–8 and 11–13 without
claiming that the missing integrated freshness behavior has been supplied.

Estimated implementation coverage is **about 90% of the original full behavioral
contract**. This is an engineering estimate, not a line-count or test-count
measurement. Fifteen of eighteen ACs have complete development evidence; AC-13,
AC-15 and AC-17 have partial implementation/acceptance evidence. Docker is a
verification gap rather than a demonstrated missing implementation.

Confidence in the implemented persistence/resolution/editor slice is **high,
approximately 8/10**, bounded by the tests and platforms below. Confidence in a
claim of full original-spec/release completion is lower; that claim is not made.
No confirmed unresolved P1/P2 defect remains in the reviewed slice after these
fixes. This does not imply the absence of undiscovered defects or human approval.

## Remaining blockers and coordination

| Remaining work | Dependency / classification |
|---|---|
| Integrate effective prompt/include changes with shared output staleness and consuming-scope regeneration. | **SPEC-0001 / PR #879** is still open and documentation-only at `375081fc3ba84b185861c7977623ae2d589eb34a`. This is the direct functional dependency for AC-13. The specified regeneration-warning fallback is implemented. |
| Identify changed effective host-global inputs for imported outputs, beyond the existing warning and retained provenance. | Shared freshness/input comparison from **SPEC-0001**; remaining part of AC-17. Book overrides, histories, archive snapshots and actual used-prompt logs are already preserved. |
| Verify Docker persistent volumes through container restart/recreation with read-only bundled prompts. | Environment/test prerequisite: a working Docker daemon. No container acceptance is claimed. |
| Preserve manual edits when future scoped regeneration is added. | **SPEC-0002 / PR #880**, open and documentation-only at `5eeaab68665f594f828dcf448b30e52dc109ba7a`, is coordination for that regeneration integration, not a blocker for prompt save/reset/restore. |
| Complete installed-app upgrade, Windows/Linux and release verification. | Deployment/release acceptance; no code dependency PR is inferred. |

The original spec ratification questions remain human-owned. Approval is not the
reason implementation stopped: the user's sequencing override was applied.
PR #644 has already been reused with attribution and does not need to merge
first. PRs #884–#886 are documentation ancestors, not implementation prerequisites.

## Verification boundaries

Verification runs use Node **22.23.2**, matching the repository CI major version.
The final full suite passed **3,652 tests across 289 files** on application/test
source `a4671d0c`; 27 focused editor/navigation tests also passed. Repository and
runtime typechecks, the root build and production Studio build passed. Lint
passed with zero errors and eight unused-suppression warnings. Lingui extraction
reported 3,629 messages with zero missing translations. Exact commands and
historical deployment evidence are recorded in the linked AC evidence document. All five locales are updated; production
Studio compilation is checked in addition to the root build. No test calls a paid
provider. The existing Desktop harness was run before these Studio-only review
fixes, and no new installed Desktop or live-browser run is claimed here.

Earlier Desktop standalone web-typecheck failures were reproduced on unchanged
develop; that baseline limitation remains separate from the passing repository
and runtime typechecks. Process-crash tests establish SIGKILL behavior on macOS,
not power-loss durability or Windows behavior. Hosted CI had not tested the reviewed commits because pushing was prohibited
during review. Publication was authorized on 2026-09-26; CI results must be checked
on the published head separately from this development evidence.

## Publication follow-up

The local branch is now `spec/spec-0011-prompt-persistence`. The remote source
branch remains `spec/629-prompt-persistence` to preserve PR #887: GitHub closes an
open PR when its source branch is renamed. Publication targets that same PR with
`develop` as its base. No replacement PR, merge or spec approval is authorized.
See the PR for the final published head and hosted checks.
