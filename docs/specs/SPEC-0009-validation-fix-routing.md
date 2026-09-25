---
id: SPEC-0009
title: Validation findings and safe fix-routing
status: in-review
owner: "@ksokolovic"
approvers: []
issues: ["#618"]
prs: []
adr: ""
created: 2026-09-22
updated: 2026-09-25
---

## Implementation scope (2026-09-25)

Phase A is implemented locally on this PR's branch under the owner's explicit sequencing override; approval remains pending. [Acceptance evidence](SPEC-0009-implementation-evidence.md) records the implementation, tests and limits. Phase B remains unavailable because the common renderer does not yet establish all admission, freshness, protection and publication guarantees below. This is not full delivery of #618. `status: in-review`, `approvers: []` and the unapproved acceptance checklist are retained; `prs` stays empty until implementation lands.

## Decision under review

Every actionable Validation finding offers a labeled route to its likely repair surface, preserving the book, source page and stable section identity where known. Opening a destination never changes content or marks a finding resolved. An explicit **Rerender section** action is a separate, guarded operation using the existing targeted-render service.

SPEC-0009 extends the eight reserved entries in [PR #878's index](https://github.com/unicef/adt-studio/blob/dd8e931bb52d2b5113b1595a3aa6b6b84ed57bfc/docs/specs/INDEX.md). This draft formalizes [#618](https://github.com/unicef/adt-studio/issues/618) and the navigation work in [PR #645](https://github.com/unicef/adt-studio/pull/645); it does not replace that PR or declare it complete. There are two implementation phases below. `prs` remains empty until implementation lands.

### Coordination with existing specs

[PR #879 / SPEC-0001](https://github.com/unicef/adt-studio/pull/879) and [PR #880 / SPEC-0002](https://github.com/unicef/adt-studio/pull/880) are still proposals. References below describe required interfaces and safety properties, not approval or implementation of those PRs. This spec does not publish or depend on unpublished local revisions of them.

Direct rerender requires expected-version checks, explicit replacement of protected rendering and failure-safe publication. These capabilities are not all supplied by the current preservation draft, which excludes Storyboard full-rerun preservation and broader replacement UI. They are Phase B prerequisites, not delivered dependencies.

## Problem (with evidence)

The issue asks for direct routes, section rerendering and automatic destination selection by issue type. Reviewers otherwise leave Validation, guess the responsible stage and find the page/section again.

The [Science Standard 5 report](https://github.com/unicef/adt-studio/issues/618#issuecomment-5155450784) describes different repair owners for heading hierarchy, activity labels, SVG semantics and style tokens. Those reported book results were not independently rerun for this draft. They show why a rule category alone cannot prove root cause: a heading-order failure can originate in generated HTML even when Sectioning is correct.

Evidence checked on 2026-09-22:

| Source | Observed state |
|---|---|
| Live develop `7a88965284faebcc0beb2e357a5adda9fbfbda45` | Baseline implementation predates the unmerged routing PR. |
| PR #645, head `0a98858953706c78a950420e3b3aa0ead847f479` | Adds optional checklist `fix_stage`, stable section context, rule/category routing, destination controls and consume-once section focus. This is also the local feature checkout's HEAD. |
| `apps/studio/src/lib/validation-fix-routing.ts` at that PR head | Has rule → category defaults and criterion → section → legacy → Storyboard fallbacks; exact section focus is limited to Sectioning and Storyboard. |
| `packages/types/src/reviewer-validation.ts`; `ReviewerValidationSummaryTab.tsx` at that head | Reviewer sessions retain checklist snapshots and records have optional location fields. |
| PR description | Explicitly defers direct rerender and does not claim to close #618. |

These are code/document observations, not successful execution of the PR's tests. The feature needs a spec because it adds persisted review metadata and a cross-stage action surface.

## Goals

- Make findings actionable without losing their original validation/reviewer context.
- Route using stable identities and actual destination capabilities.
- Preserve historical checklist meaning and distinguish suggestions from proven root cause.
- Make a targeted rerender explicit, scoped, observable and compatible with preservation rules.

## Non-goals

- Automatic AI remediation, automatic regeneration on navigation, or inferred changes to a human review decision.
- A new validation engine, remediation agent, accessibility CI harness or batch rerender system.
- Defining rendering/cache/protection semantics already owned by #731, [SPEC-0001](https://github.com/unicef/adt-studio/pull/879) and [SPEC-0002](https://github.com/unicef/adt-studio/pull/880).
- Replacing pipeline topology with a second UI-maintained list of stages.

## Proposed design

### Options and delivery boundary

| Option | Relative cost | Decision |
|---|---|---|
| A generic “Open Storyboard” link | Small | Useful fallback; insufficient for stage ownership and exact location. |
| Typed destinations with stable context, followed by guarded targeted rerender | Moderate UI/API integration | Recommended; navigation can ship independently. |
| Automatically classify, edit, regenerate and revalidate | Large new workflow and cost surface | Out of scope. |

Phase A delivers routing and context preservation. Phase B delivers direct rerender once the targeted-render safety prerequisites exist. Keep #618 open after Phase A unless the issue owner explicitly narrows it. A hidden or disabled Phase B button is not completion evidence.

### Finding identity and destination contract

A displayed action is derived from a finding identity, its immutable assessment/session reference, source page identity, optional stable section identity and a suggested destination. Use Zod schemas in `@adt/types` for persisted/API fields. Missing optional fields keep legacy records readable.

The target is one of: book-level surface, page-level surface, or page-plus-section surface. Capabilities determine which can be used; do not construct page URLs for book-only views. Pipeline stages and labels derive from `PIPELINE`; application-only surfaces, such as Sign Language, use the existing application routing registry. Keep that distinction explicit rather than forcing a non-pipeline view into `StageName`.

Resolve stable section identity first from the stored field. A legacy relative packaged `href` may supply a candidate through a validated parser, but only after resolving against the selected book's known section/page inventory. Do not trust arbitrary URLs, concatenate them into app routes, infer identities from display order, or treat `sectionIndex` as a durable key. Malformed or ambiguous context degrades to a supported page/stage destination.

If the original section was moved, follow it only when the active identity map proves its new owner page. If retired, deleted or absent, keep the original finding visible, explain that its target is no longer available and offer the nearest supported surface. Never focus or rerender the section now occupying the old array index.

### Suggested ownership and overrides

For automated findings, resolve a reviewed rule-specific default before the category default. These defaults are repair suggestions, not assertions about root cause. Present **Open in …**, with the finding's explanation and any manual-review qualifier intact.

| Finding family | Proposed default | Boundary |
|---|---|---|
| Missing alternative text with a mapped image | Captions | Unknown/custom HTML image context can fall back to Storyboard. |
| Generated HTML semantics, heading order, landmarks, ARIA, keyboard and form labels | Storyboard | Reviewer may choose Sectioning when the source role/order itself is wrong. |
| Known source content/reading-order problem | Sectioning | Only where the finding actually identifies source structure. |
| Speech/caption timing | Speech | Video/sign-language-specific findings use that available application surface. |
| Visual contrast/layout | Storyboard or its supported book-style settings entry | Do not invent a style-panel deep link that does not exist yet. |
| Unknown rule/category | Storyboard | Visible generic fallback; never claim exact attribution. |

This deliberately changes PR #645's blanket `heading-order → sectioning` proposal. Product/integration review must ratify that choice using representative fixtures. The table is not a second pipeline definition; rule ownership is separate metadata referencing canonical destinations.

For reviewer findings, precedence is criterion `fix_stage`, then section `fix_stage`, then the reviewed historical default-ID mapping, then Storyboard. The session's checklist snapshot owns that metadata. Editing the active checklist changes future sessions, not the meaning or route of an existing session. Legacy sessions without snapshots retain their historical mapping and show unknown criteria with a safe fallback.

Checklist settings expose destination selection at section and optional criterion level. The criterion can inherit its section. Validate allowed destinations server-side. Choosing an alternative route from a finding affects that navigation only; it must not rewrite old records or silently modify the shared checklist.

### Navigation and review continuity

Resolve a destination before leaving Validation. Respect the current unsaved-review guard. On entry, wait for destination data, then focus/scroll to the matching stable section and consume only that focus parameter once. Preserve unrelated query/fragment state. Refetches must not repeatedly steal focus or reset an ongoing edit. A vanished target produces a visible notice.

Keep a return-to-Validation context containing the assessment/session and relevant filter/tab/page. This may be route state; it is not a new persistent workflow database. Browser back and refresh should produce a sensible fallback if the original assessment no longer exists. Links must work by keyboard with an accessible name including destination and page/section when known.

Automated `incomplete` findings remain manual-review items, separate from confirmed violations. Reviewer `needs-changes`, `pass`, `not-reviewed` and `not-applicable` retain their meanings. Opening a link or returning from an editor changes none of them.

### Explicit section rerender, Phase B

Offer the action only when an active stable section resolves to a supported renderer. The action presents the selected page/section, that a provider call may cost money, and any protection/replacement confirmation required by SPEC-0002. Do not advertise an exact price without a real estimate. Historical/retired/unknown targets get navigation only.

After confirmation, call the existing targeted-render API through `client.ts`, carrying stable identity and expected source/render versions. The server validates membership, mode preflight from SPEC-0003, permissions/configuration, live task conflicts and editorial protection. It derives the affected work from current state; it must not trust a client-provided section index or bypass protection because the request came from Validation.

Reuse the common task service and scope contract; no second renderer inside Validation. A retry/double click cannot start duplicate tasks for the same accepted request. A queued response means queued, not fixed. Show queued/running/failed/cancelled/completed states and link to the actual editor/task details. A stale version conflict prompts refresh while keeping the finding and draft context.

Explicit rerender must obey the force-fresh contract of #731, including consistent cache publication, and replace only the selected eligible output after success. On failure/cancel preserve the prior active rendering and media. Other pages/sections and manual outputs remain intact. Disable Phase B until those guarantees exist; Phase A remains independently useful.

The original automated result remains attached to its tested artifact snapshot. Editing/rerendering makes that evidence old; only a subsequent applicable validation run can produce a new automated result. Human review statuses change through an explicit reviewer action. Do not mark a whole book passed because one repair task succeeded.

## Impact map

| Area | Expected work / boundary |
|---|---|
| Types/reviewer persistence | Optional ownership/location fields; snapshot compatibility and server validation. |
| Studio Validation/checklist settings | Shared resolver, selectable destinations, navigation context, task UI and translations. |
| Sectioning/Storyboard entry | Stable focus, moved/retired target handling, consume-once navigation. |
| API targeted rendering | Existing service admission and expected-version/protection checks; no new generation engine. |
| PR #645 | Reuse and reconcile its Phase A implementation against current develop; routing table differences need review. |
| #614/#619/#627/#731 | Rendering reliability/scope/cache coordination; Phase B cannot claim these are already solved. |
| SPEC-0001/0002/0003 | Shared freshness, protection and By Page preflight; this spec owns only the Validation entry workflow. |

An additive record schema is sufficient; no rewrite of historical reviewer answers or assessments. New user-visible strings use Lingui in all five locales. No new dependencies.

## Acceptance criteria

- [ ] AC-1 Automated rule defaults override category defaults; unknown mappings use a supported labeled fallback.
- [ ] AC-2 Reviewer routing follows criterion → section → historical mapping → Storyboard precedence.
- [ ] AC-3 Existing sessions retain snapshot ownership after checklist edits; legacy/missing metadata stays readable.
- [ ] AC-4 Invalid destination metadata is rejected before saving a checklist or review record.
- [ ] AC-5 Page-capable and book-only destinations produce valid app routes derived from their capabilities.
- [ ] AC-6 Stored section IDs beat validated legacy href hints; ambiguous/external/malformed hints never select an arbitrary section.
- [ ] AC-7 Moved identities resolve through the active map; retired/deleted identities display a notice without targeting a successor index.
- [ ] AC-8 Exact focus is applied once after data loads; later refetches and unrelated URL state are preserved.
- [ ] AC-9 Navigation respects unsaved review state and provides a usable return to its original Validation context.
- [ ] AC-10 Opening destinations changes no content, task state or reviewer/automated verdict.
- [ ] AC-11 Incomplete/manual-review findings remain distinct from confirmed violations throughout the workflow.
- [ ] AC-12 Checklist destination controls and action links are accessible and translated in all five locales.
- [ ] AC-13 Rerender is offered only for a supported active section and requires the normal protection/cost confirmation.
- [ ] AC-14 Rerender admission checks current stable membership, expected versions, mode and conflicting live work; rejection changes no output.
- [ ] AC-15 Duplicate submissions do not start duplicate accepted tasks; queued/running/terminal states reflect actual task status.
- [ ] AC-16 Explicit rerender invokes the common force-fresh path and changes only the selected allowed scope.
- [ ] AC-17 Failure/cancel/version conflict retains previous content, media and finding context.
- [ ] AC-18 A successful repair never automatically passes a finding; fresh automated evidence and human decisions remain separate.
- [ ] AC-19 Phase A can ship without Phase B, and neither the UI nor release notes claim #618 fully delivered until the approved scope is met.

## Test plan

| Layer | Criteria | Fixtures |
|---|---|---|
| Resolver/schema units | AC-1–7 | Known/unknown rules, custom criteria, snapshots, malformed/foreign hrefs, moved/deleted stable IDs, book-only surfaces. Include heading-order caused by rendered HTML. |
| Studio routing/components | AC-8–12 | Deferred query load, repeated refetch, unsaved review, back navigation, missing assessment, keyboard access and both confirmed/incomplete findings. |
| API + task integration | AC-13–17 | Protected/manual rendering, active task with no running step row, outdated source version, double submit, queued cancellation and one-page failure. Assert unaffected entity/media hashes. |
| End-to-end review loop | AC-10–11, AC-18–19 | Open finding, edit, return, observe old assessment, rerender selected section, revalidate and compare old/new evidence. |

Reuse PR #645's focused tests as a starting point, but run them on the integrated head and add gaps above. Phase B also needs rendering fixtures and API/DAG preservation checks from its prerequisite specs. No runtime verification is claimed by this document.

## Rollout

Land/review Phase A with optional metadata and safe fallbacks, then add the task-backed action after common rendering guarantees are verified. Rebase existing work on current develop before relying on its old test report. Rollback hides the new actions while retaining readable historical metadata; it must not delete review records or loosen renderer protection.

## Open questions

| Question | Owner | Resolve by |
|---|---|---|
| Ratify the ownership table, particularly heading/landmark defaults, and confirm Phase A alone does not close #618. | @ksokolovic, coordinating product review | 2026-09-25, before spec approval |
| Confirm the concrete targeted-render prerequisite PRs and the expected-version/idempotency interface used by Phase B. | @ksokolovic, coordinating integration review | 2026-09-25, before spec approval |
