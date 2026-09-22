---
id: SPEC-0012
title: Sectioning and Storyboard synchronization
status: in-review
owner: "@ksokolovic"
approvers: []
issues: ["#515", "#580"]
prs: []
adr: ""
created: 2026-09-22
updated: 2026-09-22
---

## Decision under review

A compatible text edit in a reflowable book updates its existing Storyboard HTML deterministically, without an LLM call or unrelated layout changes. If synchronization cannot be proved safe, preserve the rendering and report persistent drift for the affected stable sections. Save, reopening and targeted repair all show the same state.

[#515](https://github.com/unicef/adt-studio/issues/515) and its explicitly linked follow-up [#580](https://github.com/unicef/adt-studio/issues/580) share one synchronization contract and therefore one spec. [PR #581](https://github.com/unicef/adt-studio/pull/581) is an implementation starting point, not evidence that all four follow-up gaps are solved.

### Coordination with existing specs

[PR #879 / SPEC-0001](https://github.com/unicef/adt-studio/pull/879) and [PR #880 / SPEC-0002](https://github.com/unicef/adt-studio/pull/880) are still proposals. References below describe required interfaces and safety properties, not approval or implementation of those PRs. This spec does not publish or depend on unpublished local revisions of them.

This spec owns Sectioning-to-Storyboard correspondence, a scope explicitly excluded by the current freshness draft. Its protection of unknown-origin or manually changed HTML is a proposed requirement: the current preservation draft excludes Storyboard full-rerun preservation and treats missing provenance as AI. Reconcile those boundaries before enabling automatic propagation or repair.

## Problem (with evidence)

Sectioning stores semantic text while Storyboard renders stored HTML. Saving one does not inherently update the other. The user may see updated sidebar text beside an old page preview.

Checked on 2026-09-22:

| Evidence | Implication |
|---|---|
| Develop `7a88965284faebcc0beb2e357a5adda9fbfbda45`, `apps/api/src/routes/pages.ts:1526` | Sectioning PUT saves the semantic tree through `saveStoryboardNode`; it does not perform PR #581's propagation. |
| Same source, `pages.ts:461` | `clearCaptionData` still clears downstream node types book-wide. |
| Same source, `pages.ts:1607–1664`; `StoryboardSectionDetail.tsx:866` | Current develop already has one atomic Storyboard save endpoint. #580's original two-request description is historical; preserve this newer endpoint when integrating. |
| PR #581 at `8d077980fb9acbf99bc35e476f5c467ba7ac7a66` | Adds a pure text propagation helper, save-time warning and targeted repair. Its helper matches by `sectionIndex`, which needs reconciliation with today's stable-ID contract. |
| `packages/pipeline/src/pipeline-dag.ts:608`; `stage-runner.ts:1641` | Fixed-layout rendering consumes positioned extraction/fixed-layout sectioning, not the edited semantic tree. A semantic rerender cannot be promised to fix it. |

PR #581 changes 12 files and adds roughly 1,000 lines including tests/locales. More importantly, it defines an interface between semantic content, rendering and save behavior. The shared contract deserves a spec even though the issues currently carry fast-lane labels.

## Goals

- Correct ordinary reflowable text drift without paid generation or layout loss.
- Detect and explain unresolved drift on save and every later read.
- Preserve stable identity, immutable history and explicit manual render edits.
- Keep one user save atomic and avoid duplicate no-op rendering versions.

## Non-goals

- Building an automatic semantic-to-positioned-tree mapping for fixed layout.
- Automatic structural regeneration, flattening custom activities, changing section identities or a general HTML repair engine.
- Reimplementing downstream staleness/protection from [SPEC-0001](https://github.com/unicef/adt-studio/pull/879) and [SPEC-0002](https://github.com/unicef/adt-studio/pull/880).
- Fixing the stale editor-buffer bug #595 here; it remains a focused independent regression fix.

## Proposed design

### Options

| Option | Relative cost | Decision |
|---|---|---|
| Rerender after every text save | Moderate orchestration, recurring cost and layout/protection risk | Rejected as default. |
| Deterministic compatible text patch plus explicit drift/repair | Moderate pure helper, save/read integration and tests | Recommended. |
| Unify semantic and positioned rendering trees | Large content-model migration | Deferred beyond B1. |

### Ownership and stable correspondence

The semantic tree owns source text/roles. Existing rendered HTML owns its saved layout and any permitted manual presentation edits. A source edit authorizes updating the corresponding generated text projection only where correspondence and lack of a conflicting manual text edit are established. It is not permission to replace arbitrary user HTML.

Match source and rendering by stable `sectionId` and leaf `nodeId`/`data-id`, with page ownership validated against the current graph. Rendering arrays can be sparse or reordered. Never match solely by array position or recycled `sectionIndex`. Legacy renderings lacking identity/provenance may be associated only through a unique, proven mapping using retained source/render history; otherwise report `unknown-origin` drift and require review.

Capture expected semantic and rendering versions for a save. A patch compares the prior source, proposed source and current rendering. A leaf whose rendered text differs from the recorded prior source may be an intentional manual edit; do not overwrite it automatically. Use SPEC-0002's protection/review action to resolve that conflict. Unknown origin is protected, not assumed generated.

### Pure synchronization classifier

Provide a pure helper receiving prior/proposed source trees, current rendering and verified ownership/protection metadata. Return a candidate rendering plus stable-ID results; it performs no writes or provider calls. Its classifications are:

| Result | Behavior |
|---|---|
| `current` | No content change; no new rendering version. |
| `text-patched` | Same active leaf/image/role structure; only compatible source text changed; patch those text projections. |
| `structural-drift` | Added/removed/pruned/re-roled nodes, changed section membership, unsupported activity structure or unmatched image identity; retain HTML. |
| `invalid-rendering` | Missing/unparseable HTML or correspondence errors; retain available HTML and diagnostics. |
| `protected-divergence` / `unknown-origin` | A conflicting manual text projection or unprovable source relationship; retain HTML and require explicit review. |
| `fixed-layout-unmapped` | Semantic edits do not project into the positioned render tree; explain the boundary. |

Reuse the renderer's substitution/validation primitives where their contract permits it, but do not invoke unrelated normalization that rewrites accepted layout, IDs, image URLs, scripts or custom activity content. Preserve entity escaping, placeholders, fill-in-the-blank markers, optional text nodes, containers and permitted generated activity IDs. Substituting text must never interpret user text as executable markup.

Unchanged sections remain byte-identical. A compatible patch may create one new page rendering version containing the changed sections, but all untouched sections stay unchanged. Repeating the same input is a no-op. A validator returning errors is not permission to silently drop content; classify before any mutation.

### One save and one authoritative response

Integrate with the **current** atomic `/books/:label/pages/:pageId/storyboard` service rather than resurrecting the old pair of requests. Sectioning-only PUT should reuse that save service and classifier. Keep Zod contracts in `@adt/types`; put pure transformation logic in pipeline and I/O in API/storage.

Under shared book writer admission, validate expected source/render versions and conflicting live tasks, then compute/classify and commit the semantic version, any safe rendering version and freshness/protection metadata in one transaction. Recheck versions before publication if computation occurred outside the transaction. Invalid request/conflict/storage failure commits nothing and returns a useful error with the draft intact.

An expected unpatchable section is a valid save result: persist the user's semantic edit, retain its old rendering and record/derive explicit drift. That is different from an unexpected failed rendering write, which rolls the entire attempted save back. The response returns committed versions and per-section synchronization results, never just a generic success implying the preview changed.

If Storyboard submits an already-patched source/render pair, validate it and write it once. Do not also propagate a second rendering version. A client `renderingInSync` flag is a hint, not proof: a queued rerender is pending, and server-side verification decides currentness.

### Persistent read-time drift

The page GET computes synchronization against the latest active source/render/protection snapshots, using the same classifier's read-only comparison rules. Persist only minimal input/provenance versions needed to make that comparison reproducible; do not invent a second downstream freshness database. Optional versioned rendering-input metadata can share the freshness representation defined during SPEC-0001 integration.

GET never patches content or creates versions. After navigation, reload, restart, import or version restoration it returns the same unresolved drift, including source sections with no rendering. UI notices list stable affected sections and the available next action. Retired identities do not become actionable successor sections. A historical rendering can be inspected, but its relationship to the current semantic tree remains visible.

For fixed-layout books, show a persistent explanation in the semantic Sectioning editor: its text edits affect semantic content but do not update the visible positioned page. Saving remains allowed because semantic consumers can use those edits. Do not offer a semantic “Rerender to sync” action as a cure. Provide a route to supported Storyboard editing if available. Making those edits alter positioned text is deferred and cannot be claimed as delivered by a warning.

### Targeted repair and downstream effects

For rerenderable reflowable drift, show an explicit action listing affected stable sections. Use the existing task service, SPEC-0002 protection decisions, SPEC-0003 mode preflight and #731 force-fresh behavior. No automatic paid rerender on Save. Custom activity/protected/unknown cases require their supported review path rather than a destructive generic render.

Keep the notice while the task is queued/running. Clear it only after committed output passes the authoritative comparison. Failed, cancelled or conflicted work retains previous output and the actionable notice. Reject stale section IDs/versions before publication.

Semantic changes invalidate their actual consumers through SPEC-0001. This spec owns Sectioning→Storyboard correspondence; it does not own translation/TTS scheduling. Do not call book-wide `clearCaptionData` as a synchronization shortcut. Retain manual outputs and all historical versions. #580 gap 3 is completed only when the shared scoped invalidation is integrated; this spec alone cannot close that part.

## Issue coverage and impact map

| Issue item | Owning behavior |
|---|---|
| #515 | Compatible text projection, versioned save, preview update and safe unpatchable fallback. |
| #580 gap 1 | Read-time drift that survives reopening/import/restore. |
| #580 gap 2 | Preserve current atomic save; prevent propagation from creating an extra no-op version. Verify against current develop, not the old issue snippet. |
| #580 gap 3 | SPEC-0001/0002 own downstream preservation/scoped invalidation; this save path must consume them. |
| #580 gap 4 | Explicit fixed-layout limitation and supported navigation; no semantic-to-positioned sync claim. Product must accept this scope before closure. |

Expected implementation areas: `packages/pipeline` pure classifier/HTML fixtures; `packages/types` result schemas; API page GET/save service and storage transactions; Studio Sectioning/Storyboard notices, task completion and query invalidation. PR #581 must be rebased and adapted to stable IDs/current atomic saves. No new dependencies. Every new UI string is translated in the five supported locales.

## Acceptance criteria

- [ ] AC-1 A compatible reflowable text edit updates the corresponding stored/preview text without any provider call.
- [ ] AC-2 Untouched sections, layout attributes, image references and custom activity scripts remain byte-identical.
- [ ] AC-3 Escaping, placeholders, optional/container IDs and activity-generated content survive safe substitution without injected markup.
- [ ] AC-4 Sparse/reordered rendering arrays resolve by stable identity; no index fallback can modify a different section.
- [ ] AC-5 Structural, missing and invalid rendering cases preserve prior HTML and return explicit affected-section drift.
- [ ] AC-6 Conflicting manual text and unknown origin are preserved and require review; no silent generated-origin inference.
- [ ] AC-7 One save commits the source/render pair and metadata atomically; storage failure rolls back the whole mutation.
- [ ] AC-8 A source edit with expected unpatchable rendering still saves successfully with an honest drift response.
- [ ] AC-9 Already-patched Storyboard saves produce at most one changed rendering version; identical repeated content creates none.
- [ ] AC-10 Expected-version conflicts and active task races change nothing and keep the editor draft available.
- [ ] AC-11 GET/reopen/restart/import/restore returns unresolved drift without writing content or adding versions.
- [ ] AC-12 Queued/running rerenders remain pending; only committed verified output clears drift, while failure/cancel retains it.
- [ ] AC-13 Targeted repair uses common stable-ID/protection/mode/cache policies and cannot touch unrelated sections.
- [ ] AC-14 Fixed-layout semantic editing displays its persistent limitation and never offers a misleading sync-by-rerender action.
- [ ] AC-15 Save and repair preserve downstream histories/media and use scoped invalidation, including the #580 gap 3 integration.
- [ ] AC-16 Restored or retired identities never redirect a drift action to a successor index.
- [ ] AC-17 Studio refreshes both preview and editor data after committed versions, with accessible notices and five-locale translations.
- [ ] AC-18 Release/issue closure distinguishes implemented text sync, shared invalidation dependencies and the accepted fixed-layout limitation.

## Test plan

| Layer | Criteria | Required fixtures |
|---|---|---|
| Pure HTML/tree tests | AC-1–6 | Typography attributes, images, fill-in-the-blank, nested containers, sparse/reordered IDs, deleted/added leaves, malformed HTML and manual text divergence. |
| Real SQLite API save tests | AC-7–10, AC-15–16 | Two-version source/render pairs, injected second-write failure, overlapping page edits and active task; compare every unrelated row and referenced asset hash. |
| Page read/projection tests | AC-11, AC-14, AC-16 | Legacy unknown provenance, import/restore, missing render and a fixed-layout page with a separate positioned tree. Assert GET writes nothing. |
| Studio/task tests | AC-12–14, AC-17 | Navigate away/back, queue then fail/cancel/succeed, conflicting source version, fixed-layout warning and translated notices. |
| Acceptance book | AC-1–3, AC-15, AC-18 | At least one actual reflowable activity page and one fixed-layout page; compare editor, preview and packaged output. |

PR #581 explicitly reports no real-book verification. Its synthetic tests are useful inputs, not sufficient evidence of this full contract. No runtime tests were executed while drafting.

## Rollout

Land the pure classifier and authoritative read projection, then integrate the current save transaction and UI. Enable deterministic propagation only for proven compatible/protected-safe inputs; leave ambiguous cases visible for review. Integrate scoped downstream invalidation before claiming #580 fully addressed. A rollback can disable patching and retain drift notices; it cannot erase semantic edits, historical render versions or provenance.

## Open questions

| Question | Owner | Resolve by |
|---|---|---|
| Accept persistent explanation/support routing as B1 treatment of fixed-layout gap 4, with real positioned-text synchronization deferred. | @ksokolovic, obtaining product sign-off | 2026-09-25, before spec approval |
| Ratify the stable legacy correspondence proof and align input/protection metadata with SPEC-0001/0002 and the rebased PR #581. | @ksokolovic, coordinating storage/integration review | 2026-09-25, before spec approval |
