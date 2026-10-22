# Responsive controls implementation review

2026-10-18. Follow-up audit of the [responsive controls experiment](responsive-canvas-controls.md),
within the same experiment scope. This is a review and bounded bug correction, not
an approved production contract or an implementation of the proposed block system.

**Snapshot note:** this audit predates the later smart Reposition, sidebar,
Free transform and tag-picker refinements documented in the
[current finding](responsive-canvas-controls.md#snapshot-contents). Its confirmed
risks still apply to ordinary responsive gestures. Free transform now checks
whether CSS priorities block its own translation and protects complex ancestor
transforms; that does not resolve the general style-writer or diagram-sizing gaps.
The historical verification below is specific to this audit, rather than the
complete final prototype.

The PR checkpoint also reproduced an unresolved Reposition cancellation for a
plain div in an LTR flex row (`responsive-edge-cases.mjs`, 9/10 checks passing).
Several older book-backed scripts now fail their original layout/tag assumptions
after subsequent user edits. See the
[checkpoint verification](responsive-canvas-controls.md#pr-checkpoint-2026-10-18)
for exact failures and the distinction from the historical passing counts below.

The interaction model works for recognizable flow, stack, row and column patterns.
It cannot yet promise appearance-preserving edits to arbitrary HTML/CSS. Preserving
nodes and content IDs is necessary but does not preserve inherited styling, selectors,
coordinate relationships, or intended behavior at other screen sizes.

## Confirmed bugs fixed in this audit

| Bug | Reproduction | Correction |
| --- | --- | --- |
| Short stacked elements treated as a horizontal row | Two 24px-high paragraphs in a flex column or single-column grid. Dropping the first at the bottom-left of the second produced a no-op. | Horizontal row detection requires vertical overlap and excludes flex columns. |
| Right-to-left row drops reversed | Drag the rightmost first item to the left edge of the second item in an RTL flex/grid row. Preview said “before” and the drop kept its old place. | Both the insertion decision and indicator honor the parent's reading direction. |
| Spacing preview disagreed with the applied pixels | With a 20px root font, moving the margin handle from 20px to 40px produced 50px. | Store the measured spacing in pixels, matching the toolbar and feedback. |
| Lock changes during a drag did not cancel it | Start a width, height, or Arrange gesture, lock its element, then release. All three could still commit. | All gesture cleanup effects observe lock changes as well as selection/document changes. |

The new `scripts/experiments/responsive-edge-cases.mjs` exercises these cases,
including atomic undo, cancellation without a history entry, and RTL/LTR indicator
geometry. The original spacing test now checks computed pixels rather than a
particular serialized CSS unit.

## Remaining confirmed risks

### P1: Canvas and sidebar do not share a complete style model

`useFlowGestures.apply` and `widthStyle` write inline declarations. The installed
Inspector's sizing controls read utility classes. In the audit fixture, decreasing
a box from 60% to 50% visibly made it 392px wide, while the Inspector still displayed
`auto`. This is the previously documented synchronization gap, reconfirmed after
the recent class-list repair. De-duplicating classes does not resolve it.

Cascade priority is another part of the same problem: a `w-full!` box remained
784px wide after the quick control wrote `width: 90%`. The UI permits an edit that
has no visible effect. Arbitrary authored CSS, responsive variants, and inline
declarations need a common property reader/writer and an explicit override policy.

Relevant code: `flowLayout.ts` (`widthStyle`, `alignmentStyle`),
`useFlowGestures.ts` (`apply`, pointer commit), and the library Inspector's
`useClassMapControl`. Layout presets use `layoutOperations.update`; that different
writer is why class-based actions behave differently from ordinary gestures.

The follow-up sidebar check reproduced both directions with the actual Inspector:
an element started at `w-[400px]` with Width showing 400. A corner drag committed
inline `width: 61%`, giving a rendered width of 478.234px, while Width still showed
400. Editing Width to 260 replaced the class with `w-[260px]` but left the inline
61% in place; the canvas stayed 478.234px wide. The drag declaration was present in
serialized HTML, so this is conflicting style readers/writers, not a missing
document commit. The isolated probe is `.context/responsive-style-sync-probe.mjs`;
it made no book requests or writes. No production fix was made by this check.

Height deserves a separate distinction: the blue handle intentionally writes
`h-auto` plus a `min-h-[…px]` utility and adjusts padding, so the sidebar's Height
can correctly remain `auto`; the edited lower bound belongs in Min height.
Typography controls have computed-style fallbacks, but class values take priority
in their reader even when an inline declaration wins in the browser. A shared
property reader/writer must account for both representations and breakpoint scope.

The subsequent style-inspection trial makes this disagreement visible through the
selected element's inline CSS, its classes and filtered computed values. Rendered
pixels sit beside percentage declarations. Live tooltips show changing values;
the earlier change log was removed because it confused users after selection changes.
The existing writers and Inspector inputs are unchanged; this P1 remains open.
See the [experiment finding](responsive-canvas-controls.md) for the new verification.

### P1: Reparenting can change inherited appearance

The text-flow planner considers transparent, unpadded divs to be layout wrappers.
A wrapper can still carry typography, language/direction, CSS variables, or other
inherited meaning. Moving an aside before that wrapper takes it out of that context.

Reproduction: an inner grid with `color: red; font-size: 22px` contains a paragraph
and an aside; another paragraph follows outside the grid. Choosing “Wrap text ·
object on right” moved the aside out of the inner grid. Its computed color changed
from red to black and its font size from 22px to 16px. Text and IDs survived.

Relevant code: `textFlow.ts` (`layoutWrapper`, `surroundingTextFlow`, `applyTextFlow`).
Arrange transfers can encounter the same inheritance problem between containers.
Style-bearing wrappers need to be recognized as boundaries, with a deliberate
policy for retaining source appearance versus adopting destination styles. Copying
all computed desktop styles would freeze inherited and responsive behavior, so it
is not a general repair.

### P1: Resizing diagrams can detach labels from their targets

Whole-component Arrange correctly moves an image with its positioned labels.
However, ordinary width editing only checks the selected element's own layout and
its ancestors; it does not protect the coordinate relationships of its descendants.

Reproduction: a 400px-wide diagram with a full-width image and a label at
`left: 200px`. Decreasing the container width produced a 321.4375px image while
the label stayed at 200px. Its intended center moved to approximately 160.7px.
The height handler already rejects positioned descendants; the width handler does
not provide the same protection. Selecting the image itself can have the same risk.

Relevant code: `flowLayout.ts` (`inspectFlow`, `widthStyle`), compared with
`boxHeight.ts` (`heightFrames`). A diagram needs a known sizing policy: scale its
coordinate system together, use meaningful anchors, or disallow that resize with
an explanation. Generic percentage width does not establish such a policy.

### P2: Breakpoint edits are global, not scoped

Ordinary gestures write base inline styles; explicit layout presets replace the
edited utility families across breakpoints. A small correction made while viewing
mobile therefore also changes desktop. This is disclosed by the prototype's
“Edits apply at every screen size” hint, but it remains a significant usability
limit rather than breakpoint authoring.

The column preset does stack when selecting the actual narrow canvas preset in a
wide browser; this was independently verified. The problem is deciding which
changes should be global, which should be local, and how an override is reset.

## Where the model needs explicit limits

| Layout or intention | Current boundary |
| --- | --- |
| Ordinary paragraphs, images, captions, stacks, simple rows/columns | Supported patterns, subject to the style and nesting risks above. |
| Continuous prose with an aside | Requires a shared text flow. The planner handles one recognized object plus contiguous paragraphs, crossing only wrappers it considers plain. |
| Multiple asides in one continuous flow | No general multi-anchor planner. The current planner rejects groups containing multiple recognized objects. |
| Tables, inline prose, transformed/positioned items, explicit grid placement, CSS-reversed/dense ordering | Many actions deliberately reject these. Current guards are heuristics, not a complete CSS or HTML validity checker. |
| Overlapping cover designs, rotations, diagrams, arbitrary vertical placement | Require component-specific rules or an explicit design container. A normal-flow width/margin/reorder operation cannot express all of these intentions. |
| A desktop drop that should become a different phone composition | One pointer position does not identify a unique responsive rule or reading order. Requires stated behavior and previews. |

AI can propose a structure and breakpoint behavior after a free-placement edit,
but the proposal still needs validation and preview. It does not remove ambiguity
about grouping, reading order, anchors, or which styles should follow an object.

## Recommended next improvements

1. **Unify property editing.** Give the canvas and sidebar one reader/writer that
   understands utility classes, inline CSS, precedence and breakpoint scope. Show
   the effective value, support removing an override, and report when a rule prevents
   an edit from taking effect.
2. **Centralize component capabilities and boundaries.** Return allowed actions
   with reasons from one place. Diagram sizing, inherited styles, locked descendants,
   and semantic containers should receive consistent treatment across the toolbar,
   handles, layout menu and Arrange mode. This can improve the existing editor before
   a complete reusable-block system is built.
3. **Make constrained operations understandable.** Explain disabled actions,
   identify the actual object/container being moved, and preview structural changes.
   Add edge auto-scroll and a keyboard destination action for cross-container moves.
4. **Consolidate gesture lifecycle and regression fixtures.** Cancellation is
   currently repeated in three hooks; the lock bug affected all three. The browser
   scripts are manual experiments, with some depending on mutable local weather-book
   data. Promote stable in-memory fixtures into automated checks before production.

The [block-model finding](responsive-block-model.md) remains the longer-term
recommendation. Component identity, layout responsibility and style variants would
provide the missing editing contracts. A design container should remain one block
in page flow and specify its own resizing and narrow-screen behavior.

## Verification and limits of this review

- 89 Chromium checks passed: editor (32), Arrange (14), workspace/page copy (7),
  text flow (10), visual headers (12), class updates (4), and new edge cases (10).
- Studio TypeScript build and full lint passed; lint has eight existing warnings.
- Additional in-memory probes reproduced the remaining sidebar, `!important`,
  inherited-style and diagram failures. These are findings, not passing coverage
  for those capabilities. The local probe is `.context/responsive-review-probe.mjs`.
- The probes and book-backed scripts recorded no book writes. The review did not
  save, migrate, or regenerate the user's pages.
- No Electron installer, real-book save/reload, Safari/Firefox, touch-device,
  assistive-technology, performance benchmark, or full repository test run was
  performed. No UI strings, dependencies, schemas or persistence behavior changed.
