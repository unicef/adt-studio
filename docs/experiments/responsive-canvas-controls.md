# Finding — responsive canvas controls

**Status (2026-10-20):** the direct canvas controls described below were migrated
into `adt-html-editor` 0.2.0 and the Studio now uses the library's
`Canvas.FlowControls`, `Canvas.FlowToolbar`, `Canvas.FlowStatusBar` and
`Inspector.TagHeader`. The Studio adapter, the `/responsive-playground.html` entry,
the **Direct controls · prototype** toggle, **Wrap in container** and the
`scripts/experiments/responsive-*.mjs` checks were removed with it. Only the Styles
panel inspection accordions and the Position/Free transform section remain in
`editor/responsive/`. The rest of this document records the experiment as it was.

**Question:** can direct gestures make common responsive HTML edits easier while
keeping elements in normal flow and preserving their nesting?

**Scope:** experiment, related to [#706](https://github.com/unicef/adt-studio/issues/706)
and the existing [HTML editor experiment #923](https://github.com/unicef/adt-studio/pull/923).
The older [#711](https://github.com/unicef/adt-studio/pull/711) was checked at triage;
it explores free positioning and per-viewport transforms, a different approach.
At the workspace owner's request, the accumulated prototype is captured on
`exp/706-responsive-editor-controls` in a draft PR targeting
`feature/new-html-editor` (#923). The base branch is not renamed or modified.
This is an experiment checkpoint for trying and reviewing the accumulated work,
not an approved production implementation. It exceeds the normal implementation
review budget; production adoption still needs a spec and smaller reviewed slices.
No merge, release, book conversion or reusable-block implementation is included.

**Time box:** 2026-10-17, initial trial; explicitly extended on 2026-10-18 for
the user's text-wrapping, visual-header, component-container, style-inspection and
direct smart placement, free-transform offsets and tag-picker trials within the existing editor. The reusable block
system remains a design recommendation, outside this extension. **Demo:**
<http://localhost:5173/responsive-playground.html> with the Studio dev server running.
Start it with `pnpm --filter @adt/studio dev` if needed. The playground edits a
sample in memory; refresh or Reset sample discards changes. Its entry is excluded
from the production build. In the real Storyboard canvas, **Direct controls ·
prototype** enables the same adapter and changes use the existing draft/save flow.

## Snapshot contents

- **Direct manipulation:** responsive width, height, spacing and alignment handles;
  local reordering; an explicit container wrapper for otherwise constrained items.
- **Component placement:** one purple Reposition control, automatic whole-component
  dragging, cross-container drops, insertion previews and explanations for blocked
  or unchanged drops. Figures keep their captions and selected containers carry
  their children.
- **Readable layout choices:** wrap text around a left/right object, side by side,
  stacking, order swapping, rows aligned at their tops/centres/bottoms, and centred
  badge contents. Adjacent multi-selection works with these layout actions.
- **Styles visibility:** selected-element Inline CSS, Tailwind Classes with the
  existing class editor, filtered Computed CSS, muted rendered pixels, and live
  gesture values. Accordion choices persist across selections, pages and reloads.
- **Position:** numeric X/Y offsets, opt-in Free transform, keyboard nudges and
  Reset, using independent CSS translation while retaining normal-flow space.
- **Tag editing:** click the tag in the toolbar or sidebar to choose a compatible
  paragraph, heading or container tag, preserving authored attributes and children.
- **Interaction repairs:** duplicate utility-class repair, container reorder and
  wrapping fixes, drop commits at actual canvas widths, RTL placement, pixel-accurate
  spacing, and cancellation when selection, document or lock state changes.
- **Supporting material:** an in-memory playground, browser regression scripts,
  five translated locale catalogs, the implementation-risk review, and a separate
  reusable-block design recommendation.

The adapter uses the installed editor's public APIs; it adds no dependency, API
route, storage schema or AI call. Editor transactions retain Undo/Redo, and the
existing Storyboard draft/save path remains responsible for persistence.

### Review map

The integration files are under `apps/studio/src/components/app/screens/pipeline/`.
The adapter lives in its `editor/responsive/` directory; adjacent filenames in
each row below share that directory.

| Area | Entry points |
| --- | --- |
| Integration and feature toggle | `editor/EditorCanvas.tsx`, `editor/StoryboardShell.tsx`, `panel/StylesPanel.tsx` |
| Selection, gesture routing and handles | `editor/responsive/ResponsiveCanvas.tsx`, `useDragRouting.ts`, `useFlowGestures.ts`, `ComponentMoveHandle.tsx` |
| Placement, layout and wrapping | `editor/responsive/useArrangeGesture.ts`, `componentDrop.ts`, `componentLayout.ts`, `textFlow.ts`, `visualLayout.ts`, `elementContainer.ts` |
| Styles, offsets and tags | `editor/responsive/inspection/`, `editor/responsive/position/` (replaced by the library's `Inspector.FlowPosition` in 0.3.0), `editor/responsive/tags/` |
| Reproducible samples | `editor/responsive/playground.tsx`, `bookSample.ts`; `scripts/experiments/responsive-*.mjs` at the repo root |

## Try the prototype

To try component placement, refresh Studio, open a responsive Storyboard section,
and enable that toggle. Select an aside, figure, or recognizable component, then
drag it directly. Drag the purple **Reposition** control in the quick toolbar to start the
same gesture without activating a mode. Hovering or focusing it outlines the whole
component and its label identifies the target (for example, `figure` when an image
is selected). Clicking the same control toggles Reposition mode; Enter/Space can also
activate it and Escape cancels. This combines the former separate purple handle
and Move button; the old alignment/reordering grip was removed. **Component layout** (the columns button)
opens **Wrap text · object on left/right**, **Side by side · equal columns**,
**One below another**, and **Switch order**. Use **Select parent** to act on the
container holding multiple figures. In the playground, choose **Components and
columns** from the sample selector. No AI provider configuration is needed.
For the fourth weather page (printed page 12), use
<http://localhost:5173/responsive-playground.html?book=C-98-Weather-and-Climate---textbook&page=pg012>.
It loads a copy through the normal read-only page API and starts with a manually
constructed text column and aside column. The selector also offers the original
layout; **Editor width** reproduces the 794px canvas. These copies are in memory,
with no save path or changes to the book's versions.

For page 13's nested text/aside layout, select either the vocabulary aside or the
grid containing it, then choose **Layout → Wrap text · object on right**. The action
joins the adjacent paragraph flow across plain layout wrappers. Shift-click
neighbouring items in one container to apply wrapping, columns or stacking to a
selection. Side-by-side neighbour actions remain available for individual objects.

For page 11's header, Shift-click the title and chapter label, then choose
**Layout → Row · align centres**. The row keeps the two objects on opposite sides,
with top/centre/bottom alternatives and phone stacking. **Centre contents** centres
labels inside simple badges; select the chapter label or its containing box. The
**Size** popover edits height and horizontal/vertical inner space. On containers,
the blue handle at the bottom changes height; the amber handle changes space below.
The current chapter badge has substantial horizontal padding, so reducing its
**Horizontal inner space** gives the label room without changing its font size.

For page 15's Chapter 3 badge, select its decorated div (click the label, then
**Select parent**) and choose **Layout → Wrap in container**. The same action is
available in the status bar. Confirm, then use a corner to change width or the
blue bottom handle to change height. The new container uses the spare space in
the row, so the badge can grow as well as shrink. The badge remains selected.
Wrapping and each subsequent resize have separate Undo steps.

The Styles sidebar now has **Position** immediately below Spacing. X/Y are visual
translation offsets in pixels from the element's layout position, not page coordinates.
**Free transform** arms the exact selection: drag a label independently, or select
its container to carry the whole group. Arrow keys nudge by 1px; Shift nudges by 10px.
**Done transforming** or Escape exits the mode; Escape during a drag discards its
preview. **Reset offsets** sets this translation to zero, and Undo restores it.
In the playground, **Styles** opens this same panel. The existing fixed-layout
Position/Transform controls are unchanged.

This separate mode writes inline CSS `translate`; X/Y and Inline CSS update live.
The element keeps its original space and DOM order, so visual offsets can overlap
neighbours or be clipped by an overflow container. Offsets apply at every screen
size; they do not infer a new responsive layout. Existing `transform`, `rotate`,
`scale`, margins and dimensions remain intact. Dragging adds to percentage/calc
translations without freezing their percentage base; explicitly entering an axis
sets that axis to pixels. Reset zeros the independent translation, including an
authored translation, while preserving rotation/scale and the legacy `transform`.
Locks (including descendants), inline text, internal table boxes, positioned
selections and rotated/skewed/3D ancestors are protected with a short explanation.
Select a suitable container or wrap the element where the existing wrapper allows it.
Scaled ancestors are supported. Breakpoint-specific offsets, rotation/scale handles,
AI layout inference and unrestricted absolute positioning are outside this trial.
If an important rule or animation prevents the inline offset from applying, the
prototype restores the preview, reports the blocked edit and leaves history intact.
Existing inline `!important` priorities are preserved.

The element tag is now a picker in both the quick toolbar and the Styles header.
Select an element, click its `h1`/`h2`/other tag, and choose **p · Paragraph**,
another heading level, or a compatible container tag. Changes preserve child nodes,
text, links, images, comments, authored IDs/data attributes, class order and inline
styles, and have one Undo step. Tag-dependent stylesheet rules can still change
appearance; this action does not rewrite heading classes to paragraph classes.

The picker excludes media/void elements, opaque roots, table/list internals and
other structural tags. Locks (including ancestors/descendants), text editing and
multiple selections prevent retagging. Incompatible content/parent combinations
are disabled, such as a div containing paragraphs becoming one paragraph, or an
inline span inside a sentence becoming a heading. Selection/document changes close
the picker, and the action rechecks the current selection and constraints on commit.
The installed editor has no `setTag` API, so the trial replaces only the outer node
using a public transaction and moves its original children. The outer node receives
a new internal editor ID; authored IDs and descendant editor IDs remain intact.
A native retag action should replace this adapter before production adoption.

The right **Styles** tab starts with the selected element's icon and tag, followed
by three independent accordions: **Inline CSS** and **Tailwind Classes** start
expanded, and **Computed CSS** starts collapsed. Each accordion remembers the user's
open/closed choice across elements, deselection, pages, panel/tab switches and reloads.
These are local sidebar preferences, separate from book HTML and history. Inline CSS shows existing styles
before any edit. Percentage values have their rounded, rendered pixel equivalents
beside them in muted text. Tailwind Classes shows compact class tokens; **Edit**
reveals the existing class editor for adding, reordering and deleting classes.
Changes apply immediately and support Undo; **Done** returns to the compact list.
The editor-wide recent-change log was removed: selecting another element replaces
the readout and closes the class editor while retaining accordion choices. Deselecting
or selecting a group hides the readout. Computed CSS lists properties from the
element's inline declarations and matching stylesheet selectors, excluding universal resets,
Tailwind variable initializers and the browser's full defaults catalogue. Selector
matching respects scopes, nesting, hover, media and supports conditions. Container
variants contribute candidate properties; the browser resolves their values at
the actual canvas width. This is not winning-rule attribution. Opaque cross-origin
stylesheets cannot be inspected through CSSOM, and inherited-only declarations
are not enumerated as the element's own properties.

Gesture tooltips show only changing properties and values. Nested edits retain
target labels to distinguish their containers. The sidebar also follows the current
DOM preview and restores after cancellation. Escape, changing selection and document
replacement clear previews. No past changes are retained. Measurements follow the
actual canvas viewport, independently of the Inspector's class-editing target.
This adds observability without changing write semantics or repairing the old
Inspector's class-only values. UI state is scoped to the editor and never serialized.

## What we tried

- For child images, paragraphs and ambiguous plain divs, a second press and drag on
  the selected element chooses an
  axis after a 5px threshold. Horizontal movement snaps to left, center, or right
  using thirds of the current parent. Text uses text alignment; boxes use margins,
  and grid items also use self-alignment. These ordinary gestures add no position, transform, or
  authored ID. Wrapping is a separate, confirmed action described below.
- Ordinary vertical dragging reorders existing siblings and shows an insertion line. It
  never reparents during a drag. Toolbar buttons provide the same move-earlier/move-later actions.
  When an image is alone in a div, paragraph, or figure, reordering moves that
  whole block among its siblings; alignment and resizing still act on the image.
  A selected container also drags from its children's area; recognized whole
  components use smart Move as described below. A plain click still selects the
  child. Text and inline siblings form an indivisible insertion target,
  allowing a block to move before or after prose without splitting the sentence.
- Four corners change width, using horizontal motion and a percentage of the
  parent's content box, clamped to 10–100%. Image height stays automatic. Content
  determines text height. Containers additionally have the height control described
  below; it retains a content-driven minimum. Width buttons provide keyboard alternatives.
- A distinct amber bottom handle changes positive bottom margin (0–96px, in 4px
  steps). Separating it from the corners avoids an ambiguous resize/spacing gesture.
  Toolbar buttons also adjust spacing.
- A floating toolbar provides alignment, text size, width, ordering, spacing, and
  parent selection. The dashed parent outline and “Inside” label expose nesting.
  The status bar makes the cross-viewport scope explicit.
- Live styles exist only on the preview DOM during a gesture. Release commits one
  library action; Escape, pointer cancellation, blur, reset, and unmount restore
  the preview. History shortcuts cancel the gesture before acting on history.
  Existing library serialization and Studio saving remain the only persistence path.
- Blocked image drags now explain the constraint. Where HTML allows it, the user
  can confirm **Wrap in container**, also available beside the status hint. This
  inserts a full-width div and moves the existing image into it in one transaction.
  Image attributes and IDs are retained, no duplicate wrappers are offered, and
  one Undo removes the wrapper. Subsequent vertical dragging moves the whole block.
  Sentence/link images instead offer **Select parent**; a div cannot safely be
  inserted inside every HTML element.
- **Wrap in container** also supports complete block components, including divs,
  headings, and figures in simple rows/grids. A row wrapper uses the available
  flex space; a grid wrapper fills its cell. The selected component starts with
  its measured border-box width, retains its decoration/content/IDs, and resizes
  within the new normal-flow area. Base width/margin constraints are replaced;
  breakpoint width classes such as `max-sm:w-full` are retained. Rows may
  redistribute neighbouring space, disclosed in the confirmation. A normal-flow
  wrapper leaves the child's styles unchanged. A serialized
  `data-responsive-container` marker prevents repeated nesting and keeps the
  wrapper with its content when reordering or selecting the whole component.
  Captioned images offer wrapping on the complete figure, not on its image alone.
  Locked descendants, positioned/transformed diagrams, CSS-reversed/wrapping rows,
  explicit grid placement, tables, list children and inline prose remain guarded.
- **Reposition** now starts directly by dragging its toolbar control or a selected
  aside, figure, header/footer, image/caption div, decorated div (background, border,
  shadow or float), or explicit resize wrapper. Child images and paragraphs retain
  alignment and local reordering. Plain layout divs retain those gestures; the handle
  is their explicit way to move as a component. Clicking **Reposition** enables the
  optional per-selection mode. Its existing component resolution promotes images and
  captions to their figure/aside or recognizable image/caption/diagram div,
  previews a moving outline and destination, then commits on release. Top/bottom
  edges insert before/after; a container's center appends inside; left/right edges
  create a two-column wrapper with the target, except asides and figures beside
  paragraphs, which preview continuous text wrapping. Existing row/grid siblings
  reorder horizontally; paragraph-edge wrapping takes precedence. Gaps inside a
  containing block resolve to nearby siblings. An aside dragged left/right across
  itself also changes its float and is placed before the text it wraps. Newly
  created columns stack below `sm` (640px).
  Escape cancels. Invalid targets use a gray outline and explicit feedback; a
  successful move, an unchanged position, and an invalid drop have distinct results.
  One pointer router chooses ordinary dragging or smart Move at the start and never
  changes that choice mid-gesture. Clicks below the drag threshold still select
  children; text editing, Shift-click selection, inputs, buttons and links remain
  separate interactions. The library's native HTML drag is blocked on the selected
  element so rejected/protected gestures cannot fall back to moving a child.
  The control labels and outlines the whole moving component and sits inside the
  toolbar, clear of resize corners. Keyboard activation arms the existing Reposition mode,
  and Escape disarms it. This is a selected-object interaction, not first-press
  dragging of every unselected item, and it does not add a global persistent mode.
- **Component layout** offers **Wrap text · object on left/right** (one-third width with a side gap,
  stacking below 640px), two columns with aligned tops, stacked
  contents, and swapping a pair. Explicit presets clear conflicting child widths,
  floats and offsets; simple image wrappers also lose offset padding. Unrelated
  styles, content and authored IDs remain. Each action or drop is one Undo.
  **Side by side with previous item / next item** combines neighbouring blocks;
  **Side by side · equal columns** arranges a container's existing children.
  Reposition and Layout have visible text labels as well as icons.

## What we learned

The installed editor's public actions (`placeNode`, `moveNode`, `select`), selection
hooks, and history are sufficient for a local adapter. No editor fork or dependency
is needed. DOM lookup is scoped to this canvas and uses the library's existing
`data-adt-id`; controls are outside the serialized document tree.

Layout-specific restrictions are necessary. Text alignment is safe inside a flex
row, but moving a flex-row item with auto margins can shift its siblings. Grid
widths refer to a grid area rather than the whole parent's width. The prototype
therefore disables box alignment in flex rows and direct sizing/spacing/reordering
for immediate flex-row and grid children. Text inside these containers still has
its own controls. Inline text can change font size but stays within its sentence.
Mixed prose images, table structures, transforms, floats, positioned elements,
vertical writing, and display-contents structures cannot use the ordinary drag.
Smart Move (automatic for recognized selected components, via the handle, or in
explicit Arrange mode) and the layout menu handle common floats and columns;
tables, transformed/positioned selections, CSS-reordered structures, locked
content, and images embedded in sentences/links remain protected. A diagram's
positioned labels can move with its containing group.
Images beside loose text can be explicitly wrapped where flow content is allowed;
images embedded in sentences or links offer parent selection instead.
Reordering rejects inline selections and CSS-reordered siblings. Normal-flow
blocks can reorder around mixed prose, with consecutive text and inline elements
kept together as a single target.

The first user trial was positive but reported images without a div getting stuck.
A bare root image with block siblings already supports alignment/reordering. An
image-only paragraph revealed a different boundary: the image had no siblings
inside its paragraph, even though that paragraph had siblings. Moving the existing
paragraph as a unit resolves that case without introducing another container.
The playground's **Image structure** selector now includes both cases, a sentence,
and loose text. Wrapping respects the HTML
[paragraph content model](https://html.spec.whatwg.org/multipage/grouping-content.html#the-p-element).

The next trial found that the newly created div itself could appear stuck. It did
not need classes: a descendant-image pointer event bypassed our gesture handler,
letting native dragging extract the image instead. Separately, loose text beside
the wrapper disabled reordering for the entire parent. Selected-container gestures
now include descendant hits, and insertion targets group prose instead of rejecting
it. The wrapper stays intact and uses the same normal-flow CSS and history actions.

A follow-up check of the real `StylesPanel` beside the adapter exposed an inspector
integration gap. Increasing image width to 65% changed the document and canvas, but
the inspector's Width field still showed `auto`. Text alignment without a matching
class reflected the computed inline value, but then choosing left in the inspector
added `text-left` while the canvas remained right-aligned because its inline style
still won. The installed shadcn sizing/spacing controls read class values; some
typography controls fall back to computed styles. Sharing the editor store alone
therefore does not provide consistent style editing in both directions. A common
style read/write path is needed before these controls can be treated as equivalent.

### Weather and Climate output review

Reviewed the current eight rendered sections (`pg009`–`pg016`) through read-only
API requests and mounted temporary copies in the actual responsive canvas. The
saved versions were 1 except `pg011` and `pg016`, which were version 2. Checked
computed layout and gesture eligibility at 1440px and 390px browser widths.

- Eight right-floating asides across seven pages become full-width blocks below
  the existing `max-lg` breakpoint. The float guard blocks the aside itself, and
  the sibling-order guard also blocks ordinary figures and text beside it. These
  are common page structures, not unusual edge cases.
- The snowplow figure (`pg012`) is a horizontal flex image/caption pair. The Wind
  figures (`pg015`) are vertical image/caption pairs inside a two-column grid.
  Air Masses (`pg016`) includes a grid-based image/caption pair. The current
  image-only-wrapper rule does not recognize these as whole components: it can
  offer to reorder an image relative to its caption while blocking the figure.
- The cloud pair (`pg014`) is a two-column grid with deliberate vertical padding
  and negative horizontal margin on its children. A "line up side by side" action
  needs to adjust these offsets as well as the parent's column count.
- The pressure diagram (`pg009`) contains absolutely positioned labels. Those
  labels must travel with the diagram; treating them as free page-level blocks
  would change their meaning. Similarly, a hidden figure caption is not an empty
  component and must be retained.
- Container alignment was unconditionally writing `display: block`. Reproduced
  that flattening the Wind header's flex layout, then fixed alignment to retain
  existing flex/grid display. Inline flex/grid boxes blockify to flex/grid rather
  than to plain blocks. This prevents future alignment damage; existing saved
  inline overrides were not rewritten.

Read-only feasibility trials used the editor's public actions on temporary copies:
switch the precipitation Vocabulary aside left while mirroring its side margin;
swap the two complete Wind figures; and switch the Air Masses image/caption grid
to one column. All three retained their contents and undid successfully. The first
two retained phone stacking. Checked all eight stored renderings and versions
against the initial API responses afterward: none changed. These were initially
feasibility trials; the subsequent iteration exposes the actions in the component
menu and implements the deterministic placement gestures described above. No AI
call was made.

The explicit Arrange mode separates whole-component movement from ordinary image
alignment/resizing. Float switching is available in the menu and when dragging an
aside horizontally beside text. Converting blocks into columns wraps the selected block and
the drop target, preserves their IDs/content, and uses DOM order for phone reading
order. Splitting an arbitrary div still requires a visible split point rather than
guessing which content belongs in each new container.

An optional free-placement/AI experiment could use a temporary ghost to capture
intent, then propose responsive structure after release. Inputs should include the
selected component, original HTML, neighboring containers, original/drop geometry,
and existing breakpoint rules. Prefer a small structured operation plan (move,
wrap, columns, stack, float side, gap, width) applied by the same editor actions.
Show desktop and phone previews before Apply, with one Undo. Ambiguous structures
can use AI to propose grouping; clear float/column operations can be immediate.
The existing layout-mirror agent is not suitable unchanged: its contract permits
dropping content. Placement must retain all content, IDs, image/caption associations,
and activity/label references, and validate reading order and sectioning consistency.
The sidebar must use the same style writer. The AI-assisted proposal/preview flow
remains a spec recommendation. The current Arrange prototype uses deterministic
editor operations and is not a production implementation.

CSS references used to check these distinctions:
[justify-self](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/justify-self)
and [align-self](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/align-self).

### Real-workspace follow-up

The user reported that floats and two columns did nothing, and a purple outline
disappeared without moving the component. Reproduced on the fourth weather page
(`pg012`) inside the real Storyboard shell with both rails open. The canvas was
794px wide. The editor translates responsive media rules into canvas container
rules, so `max-lg:float-none`, `max-lg:w-full`, and the prototype's own
`max-lg:grid-cols-1` still applied in the Desktop view. Earlier full-width fixtures
missed this integration failure. Explicit float and column actions now use 640px
as their stacking threshold, and clear conflicting relevant overrides.

The purple outline previously followed the pointer even without a valid target.
Gaps hit the parent container, and an ancestor check rejected the drop. Gaps now
resolve to nearby block boundaries, and rejected/no-op drops explain the result.
The release coordinates are checked again before committing. Added direct neighbour
actions to make column creation possible without a precision edge drag.

The original page content was intact. The test copy reconstructs the requested
two-column arrangement using its existing nodes and authored IDs; no book rendering
was overwritten or saved during this work.

### Verification

#### PR checkpoint, 2026-10-18

The latest tag-picker iteration passed 61 Chromium checks (tags 16, smart move 20,
style inspection 25), Studio TypeScript, lint with eight pre-existing warnings,
strict compilation of all five catalogs, and the Studio production build with
its existing chunk-size warning. Those commands and results are recorded below.
The checkpoint changes only documentation and whitespace; it does not change
editor behavior after that validation.

A broader check of the earlier scripts against the final UI also passed editor
(32), Arrange (14), class updates (4), and text flow (10). These are manual
Playwright scripts, not an automated CI suite. The broader run is **not all green**:

| Script | Current result and limitation |
| --- | --- |
| `responsive-edge-cases.mjs` | 9/10 pass. In the LTR flex-row case, a selected plain div's Reposition gesture reports “Gesture cancelled” and never shows the expected insertion indicator. A second diagnostic run reproduces it. Cause remains unresolved; the RTL and grid cases pass. |
| `responsive-containers.mjs` | Stops at its initial page-15 precondition: expects no width handles but finds four. The saved badge is already inside `data-responsive-container`, reflecting subsequent user edits. Its remaining cases were not reached in this run. |
| `responsive-visual-layout.mjs` | Stops in the first page-11 check: the title's assumed next sibling is absent in the edited header, so the old geometry lookup fails. The current book no longer matches this fixture's nesting assumption. |
| `responsive-workspace.mjs` | Stops at its first page-12 precondition: the current aside already floats left, while the fixture expects `float: none`. Later cases were not reached. |
| `responsive-position.mjs` | 21/22 pass, including the in-memory weather label. The last real-workspace smoke check times out looking specifically for `h1` containing “Chapter 2”; the edited page no longer matches that tag-dependent locator. |

The earlier passing counts below are historical evidence, not a claim that these
book-dependent scripts pass against every later edit of the user's book. Pinning
their input to stable in-memory fixtures, and resolving the LTR flex cancellation,
are follow-ups before production adoption. Test runs did not save or regenerate
book pages. The draft PR preserves these failures explicitly instead of marking
the complete regression set verified.

- Tag-picker refinement: `responsive-tags.mjs` passes 16 Chromium checks, alongside
  20 smart-move and 25 style-inspection checks (61 total). Covers toolbar/sidebar
  retagging, heading levels, exact content/attribute/class preservation, descendant
  editor IDs, one-step undo/redo with earlier history retained, valid nesting,
  locks, stale selections, groups, text editing, structural/media protection,
  opaque SVG, keyboard navigation/focus and unchanged offsets while navigating the
  picker during Free transform. A weather page-11 copy changes Chapter 2 from h1 to
  p and undoes it without book writes; that focused check was repeated for final
  sidebar sizing and screenshot verification. Studio TypeScript, lint (eight
  existing warnings), strict compilation of all five locale catalogs and production
  build pass; the existing chunk-size warning remains. Full repository tests,
  Electron packaging and fixed-page gestures were not re-run for this refinement.

- Position/Free transform trial: `responsive-position.mjs` passes 22 Chromium
  checks, `responsive-smart-move.mjs` passes 20, and
  `responsive-style-inspection.mjs` passes 25: 67 browser checks. Coverage includes
  selected labels versus whole figures, live X/Y and inline values, numeric edits,
  keyboard nudges, Reset, undo/redo, cancellation on Escape/pointer cancel/blur/
  selection/document/lock/direct-controls changes, preserved rotation and percentage
  translation, scaled ancestors, blocked CSS priorities, protected selections,
  panel remounts, and separation from Reposition. A weather page-11 copy verifies
  its Chapter 2 label; the actual Storyboard verifies mode activation without edits.
  No book writes occurred. Studio TypeScript, lint (eight existing warnings), strict
  compilation of all five locale catalogs and production build pass; the existing
  chunk-size warning remains. Full repository tests, Electron packaging, native
  touch devices and fixed-page gestures were not re-run for this trial.

- Unified Move control refinement: the smart Move (20), Arrange (14) and editor
  (32) suites pass 66 Chromium checks. Coverage includes a single toolbar control,
  immediate dragging without accidentally toggling Move mode, click/keyboard
  activation and cancellation, whole-component highlighting, protected controls,
  narrow-viewport toolbar placement, image alignment, local reordering and undo/redo.
  Weather page-12 and page-13 copies verify the real components without book writes.
  Studio TypeScript, lint (eight existing warnings), strict compilation of all five
  locale catalogs and the production build pass; the existing chunk-size warning
  remains. Full repository tests and Electron packaging were not run.

- Accordion preference refinement: 24 style-inspection Chromium checks and a
  separately run workspace persistence check pass. The updated
  `scripts/experiments/responsive-style-inspection.mjs` contains all 25 checks.
  Coverage includes independent open/closed choices across selection, deselection,
  groups, replacement documents, panel unmounts, actual page-13/page-15 navigation,
  AI/Styles tabs, sidebar collapse/reopen and reloads. Class Edit mode still closes
  on selection changes and computed values follow the current element. These UI
  choices do not change HTML/history or write to books. Studio TypeScript, lint
  (eight existing warnings), and the production build pass; the existing chunk-size
  warning remains. No user-facing strings changed. Full repository tests and
  Electron packaging were not run.

- Direct smart Move refinement: `node scripts/experiments/responsive-smart-move.mjs`
  passes 19 Chromium checks. Covers automatic aside wrapping, figure/caption transfer
  between columns, handle promotion and whole-component highlighting, unchanged image
  and paragraph alignment, ordinary child selection and text editing, Escape/pointer
  cancellation/blur/selection/document/lock cleanup, protected destinations and locked
  descendants, embedded controls, resizing, Shift-click groups, keyboard activation,
  narrow-viewport handle placement and a read-only weather page-13 copy. The handle
  measures its actual toolbar and bounds to avoid overlapping resize corners. Tests
  caught and fixed a competing native drag path that could extract an input when
  the responsive router correctly ignored its pointer interaction. The existing
  editor (32) and Arrange (14) suites also pass: 65 browser checks for this refinement.
  The book rendering/version response remains unchanged and there were no book writes.
  Studio TypeScript, lint (eight existing warnings), strict compilation of all five
  locale catalogs and the production build pass. The existing chunk-size warning
  remains. Full repository tests, Electron packaging and an assistive-technology
  audit were not run. Existing cascade/inheritance limits described below still apply.

- Sidebar accordion refinement: `node scripts/experiments/responsive-style-inspection.mjs`
  passes 23 Chromium checks, retaining the selection-based coverage below and adding
  element-header order, accordion defaults and keyboard toggles, class Edit/Done,
  add/reorder/delete with undo/redo, selection changes during class editing, the image
  header and opaque SVG class editing. `node scripts/experiments/responsive-class-updates.mjs`
  passes four more checks for repeated resize, numeric height, duplicate-class repair
  and deletion, including undo/redo: 27 browser checks for this refinement. Screenshots
  cover the selected image and a page-15 copy; the saved book and versions remain
  unchanged. Studio TypeScript, lint (eight existing warnings), strict compilation
  of all five locale catalogs and the production build pass. The existing chunk-size
  warning remains. Full repository tests and Electron packaging were not run.

- Earlier selection-based inspection refinement: `node scripts/experiments/responsive-style-inspection.mjs`
  passes 18 Chromium checks. Covers existing inline percentages before editing,
  selection changes/deselection without stale values, filtered class/custom-rule
  properties, unrelated selectors, scopes (including scoped roots), nesting, hover,
  inactive media/supports conditions, responsive canvas measurements, live versus
  committed CSS, undo/redo, cancellation, nested height/padding, reordering and layout
  presets. A page-15 copy verifies the value-only tooltip and sidebar; the saved book
  and versions remain unchanged. Studio TypeScript, lint (eight existing warnings),
  all five locale catalogs and the production build pass. The existing chunk-size
  warning remains. Full repository tests and Electron packaging were not run.

- Earlier compact readout refinement: the 14 style-inspection Chromium checks also
  verify that **All styles** is initially the only readout, CSS outside the normal
  controls is available when expanded, percentage/pixel values share one row,
  duplicate headings/explanations are absent, and replacement classes show the new
  value only. The page-15 screenshot was refreshed with the compact tooltip and
  sidebar; the original book and its versions are unchanged. Class-update (4) and
  workspace (7) checks also passed: 25 Chromium checks for this refinement. Studio
  TypeScript, strict compilation of all five locales, lint (eight existing
  warnings), and the production Studio build passed. The existing chunk-size
  warning remains.

- Initial inspection iteration: 14 Chromium checks
  cover read-only inspection, live versus committed inline changes, conflicting
  sidebar class edits, undo/redo, Escape/pointer cancellation/reset/lock cleanup,
  nested height/padding targets, spacing, structural reorders, layout class deltas,
  an `!important` rule blocking a resize, and actual canvas viewport changes.
  A page-15 copy verifies the badge tooltip stays out of the sidebar and compares
  saved rendering/version data afterward. No book writes. Existing editor (32),
  Arrange (14), visual layout (12, including the actual Storyboard shell), workspace
  (7), and class-update (4) checks also passed: 83 checks in the initial inspection iteration.
  Studio TypeScript, lint (eight existing warnings), strict locale compilation and
  the production Studio build passed. The build retains its chunk-size warning.
  No Electron packaging, full repository suite, assistive-technology audit or
  performance benchmark was run. Arbitrary stylesheet rule attribution is not
  implemented; the readout separates declarations from rendered values instead.

- `node scripts/experiments/responsive-containers.mjs`: ten Chromium checks using
  the latest page-15 rendering in memory (v6 when investigated), the actual Styles
  panel, and focused fixtures. Covers the previously blocked Chapter 3 badge,
  initial geometry/decoration and neighbour preservation, width growth/shrink,
  height, atomic undo/redo, phone stacking, serialization/reload, unique classes,
  figures/captions in grids, ordinary blocks and inheritance, whole-wrapper
  reordering, RTL rows, unsafe structures and locking while the dialog is open.
  API rendering and version comparisons verify that the book stayed unchanged.
  The existing editor (32) and Arrange (14) checks also pass. Studio TypeScript,
  full lint (eight existing warnings), and strict compilation of all five locale
  catalogs pass. These are targeted prototype checks, not a full repository run.
  Wrapping does not solve arbitrary stylesheet selectors, `!important` precedence,
  breakpoint-specific placement rules, or the shared sidebar style-writer gap.

- The [implementation review](responsive-controls-review.md) records four more
  confirmed fixes and the remaining appearance/cascade/diagram risks. Its new
  `responsive-edge-cases.mjs` suite adds ten checks for short stacked drop targets,
  RTL/LTR insertion indicators, non-default root-font spacing, and lock changes
  during width/height/Arrange gestures. All seven browser suites were rerun: 89
  Chromium checks passed, plus Studio TypeScript and full lint (eight existing
  warnings). The remaining risks were reproduced on in-memory fixtures; they are
  not covered by a claim of general appearance-preserving editing.

- `node scripts/experiments/responsive-class-updates.mjs`: four Chromium regression
  checks with the real Styles panel mounted. The pre-fix run reproduced duplicate
  `box-border` classes on the second height drag. Checks now cover repeated pointer
  and numeric resizing through nested wrappers, conflicting `box-content`, class
  removal, existing duplicate cleanup, preservation of unrelated/variant classes,
  and undo/redo without saving or reloading. Fresh resizing produces no duplicate-key
  warnings. The 12 visual-layout checks were also rerun successfully, including the
  actual page-11 Storyboard shell. No browser errors or book writes. Studio TypeScript
  and full lint pass (eight existing warnings). No UI strings changed in this fix.

- `node scripts/experiments/responsive-visual-layout.mjs`: 12 Chromium checks for
  the current page-11 rendering (v9 when investigated), including the actual
  Storyboard shell with both rails open. Covers multi-selection through a badge's
  decorative wrappers, row top/centre/bottom alignment, centring while retaining
  the empty heading's ID, padding fields, header shrinking/growing, the content
  minimum, atomic undo/redo, Escape/pointer cancellation/document reset, locks,
  serialization round-trip, and mobile stacking/containment. No book writes or
  browser errors; saved rendering and versions unchanged. Screenshots include
  `.context/weather-page11-workspace-header.png`,
  `.context/weather-page11-visual-header.png` and
  `.context/weather-page11-visual-mobile.png`. All preceding 63 browser checks
  also pass, for 75 total. Studio TypeScript, full lint (eight existing warnings),
  strict Lingui compilation, the Studio build (chunk-size warning) and the 19 editor
  unit tests pass. Twelve new messages are translated in all four target locales.
  The page-13 workspace test now selects the actual container holding the aside,
  accommodating the user's saved v4 text-flow layout instead of assuming v3's
  original grid nesting. No stored content was changed to satisfy a fixture.

- `node scripts/experiments/responsive-text-flow.mjs`: 10 Chromium checks for
  selecting the inner grid or aside, continuous wrapping across multiple paragraphs,
  full width below the float, left/right switching without accumulating wrappers,
  grid-to-flow drag/drop, Shift-click selection, group columns/stacking, lock and
  boundary guards, one-step undo/redo, HTML round-trip, and phone stacking. Includes
  the latest page-13 copy and the real Storyboard shell at its 794px canvas width.
  Text, images, authored IDs, activity/label links and saved page versions are
  preserved; no book write requests or browser errors occurred. Also passed the
  preceding 32 + 14 + 7 browser checks, Studio TypeScript, full lint (eight existing
  warnings), strict Lingui compilation, Studio build and 19 editor unit tests.
  Twelve replacement/new messages plus the group-selection hint are translated
  in all four target locales. Screenshots: `.context/weather-page13-workspace-flow.png`,
  `.context/weather-page13-text-flow.png`, `.context/weather-page13-text-flow-mobile.png`.

- `node scripts/experiments/responsive-editor.mjs`: 32 Chromium browser checks,
  including screenshot capture; no browser page errors. Uses only the in-memory
  sample. Set `STUDIO_URL` for a non-default dev-server origin.
- `node scripts/experiments/responsive-arrange.mjs`: 14 additional Chromium checks
  for the real playground/menu/drag UI, float breakpoint and margin preservation,
  aligned/stacked/swapped columns, cross-container drops, creating columns,
  atomic undo/redo, cancellation/reset, locks, cycles, diagrams, unsupported
  structures, phone containment, and clean serialization. No browser page errors.
- `node scripts/experiments/responsive-workspace.mjs`: 7 checks in the actual
  Storyboard shell and the page-copy playground. Covers floats at 794px, neighbour
  columns, gap drops, horizontal aside placement, invalid-drop feedback, preserved
  content/mobile stacking, and moving a complete paragraph by selecting a text span
  and dropping below the other column's content. The test records book requests:
  no write requests occurred, and the stored rendering and versions were unchanged.
  This follow-up also passed Studio TypeScript, ESLint, strict Lingui compilation,
  the Studio build and the 19 editor tests. Fifteen new messages are translated in
  all four target locales. Screenshots include `.context/weather-page4-two-columns.png`.
- A temporary real-book probe exercised the new menu on precipitation floats,
  Wind columns, the Air Masses caption grid, and the cloud pair's offsets. Each
  action undid to the original serialized HTML. All eight saved page renderings
  and versions were unchanged afterward.
- This component iteration passed Studio TypeScript, focused ESLint, full
  `pnpm lint` (eight existing warnings), strict Lingui compilation (all five
  locales), the Studio production build, and the 19 editor unit tests. Build
  warnings concern chunk size and plugin timing. New copy has 19 translated
  messages; it has not been visually reviewed in every locale.
- Covers margin alignment with undo/redo, body dragging, percentage resizing with
  single-step undo, Escape, pointer cancellation, document reset during a gesture,
  spacing, button/drag sibling reordering, text and parent controls, layout guards,
  mobile containment, overlay geometry after resizing, and clean serialized HTML.
  Added checks cover bare root images, wrapping/cancellation, attribute preservation,
  atomic undo/redo, serialization round-trip, moving wrappers and image-only
  paragraphs, blocked-drag prompts, loose text, and invalid/constrained parents.
  Wrapper regressions cover grip/empty-area/descendant dragging with and without
  loose text, undo/redo, click selection, Escape, both ordering buttons, and keeping
  text plus inline markup together even when there are no other block siblings.
- `pnpm exec vitest run --project studio apps/studio/src/components/app/screens/pipeline/editor`:
  4 test files / 19 tests passed.
- The latest alignment fix passed `pnpm exec tsc --build apps/studio --pretty false`
  and focused ESLint for `editor/responsive/`, alongside the 32 browser checks above.
  The new regression verifies that alignment preserves flex/grid child geometry,
  including inline-flex and inline-grid containers. A separate real-book probe
  also verified the alignment toolbar on the Wind header and the temporary layout
  trials described above; no browser page errors occurred.
- A separate Chromium probe mounted the real `StylesPanel` and `ResponsiveCanvas`
  under one controlled provider with an in-memory sample. It reproduced stale
  inspector width and conflicting inline/class text alignment as described above;
  this probe identified a remaining gap, not a passing synchronization check.
- The preceding prototype iteration passed `pnpm typecheck`, `pnpm lint`, strict
  Lingui compilation, and the Studio production build. New strings translated in
  en, es, fr, pt-BR, and sq; the wrapper fix adds no user-visible strings.
  Full lint reports eight existing unused-disable warnings in unchanged files;
  the build reports large-chunk/plugin-timing warnings.
- Screenshots are saved under `.context/responsive-desktop.png` and
  `.context/responsive-mobile.png`; the wrapper prompt is captured in
  `.context/responsive-wrap-prompt.png` and a selected-wrapper drag in
  `.context/responsive-wrapper-reorder.png`.
  The weather aside comparison is in `.context/weather-aside-comparison.png`.
  The new menu and placement preview are in `.context/responsive-component-menu.png`
  and `.context/responsive-arrange-preview.png`.

### Limits and not verified

- The [implementation review](responsive-controls-review.md#remaining-confirmed-risks)
  contains concrete remaining failures: inherited appearance can change during
  reparenting, `!important` can prevent a reported edit from taking effect, and
  ordinary diagram width changes can misalign positioned labels. The prototype's
  node/ID preservation does not imply visual preservation for arbitrary CSS.
- This is an experiment, not a universal CSS constraint solver. Complex intrinsic
  sizing, important CSS, authored min/max constraints and unusual margins need a
  broader fixture set before shipping.
- Ordinary sizing/alignment edits use base inline styles and apply at every viewport. They can override
  existing responsive utility declarations for the edited property. Breakpoint
  authoring and a clear way to remove an override need a spec decision.
- Grid-cell and flex-row direct resizing, multi-selection dragging, rotation and
  padding handles are out of this trial. Wrapping can provide a normal-flow sizing
  area. Free transform supplies opt-in visual offsets, not unrestricted absolute
  positioning or automatic responsive reflow. The existing editor's native
  layer-tree dragging remains available.
- Arrange supports transfers into valid containers, row/column reordering, and
  creating columns beside another block. Group layout supports consecutive siblings
  in one container; it does not group arbitrary cross-container selections.
  It does not split arbitrary content into
  new containers or infer a responsive design from arbitrary screen coordinates.
  Edge auto-scroll, AI proposals, and consistent sidebar synchronization remain
  follow-up work. New layout actions use utility classes, but existing inline
  size/spacing/alignment edits still have the inspector gap documented above.
- Corner handles change width only. This intentionally preserves content-driven
  text/image height; containers have a separate vertical handle that edits spare
  height/padding. Image cropping and free aspect-ratio changes remain separate.
- Automated fixtures do not establish usability. After the latest user feedback, no
  further human trial, real-book save/reload,
  Electron installer, Safari/Firefox, touch-device, or full repository test run was
  performed. Translations compiled but were not visually reviewed in every locale.
- `pnpm lint:invariants` is still planned and absent, as documented in INVARIANTS.md.

## Recommendation

The 2026-10-18 user trial led to a
[block-model recommendation](responsive-block-model.md): separate content blocks,
layout containers and style variants, with progressive adoption of existing HTML.
It records the page-13 grid/flow distinction and the page-11/page-15 resize mismatch.
No editor changes or book conversions were made during that design investigation.
The user subsequently requested the bounded text-flow extension above before a
block system. The extension changes existing in-memory editor operations only.

### Text-flow extension findings

The menu now describes outcomes rather than CSS mechanisms. Selecting an aside,
figure/image with neighbouring paragraphs, or a grid containing one object and
paragraphs, can convert the relevant group into continuous text flow. Plain nested
layout divs become ordinary blocks and the object moves before the target paragraph's
outer wrapper. A containing flow root keeps following figures/activities below the
group; paragraphs continue alongside and then regain the full width. Wrapper nodes,
authored IDs, typography, object contents and semantic sections remain intact.
Selecting an inner grid discovers adjacent paragraphs through its plain outer
wrappers, matching the aside-selection behavior. The change is one undoable editor
transaction, with no document replacement or new storage model.

Arrange edge drops of asides and figures beside paragraphs prefer wrapping even
inside a grid. Dedicated side-by-side actions create independent column tracks.
Shift-click uses the library's existing multi-selection and adds a group Layout
menu. A selection must contain consecutive siblings; wrapping requires one
recognized object plus paragraphs. Nonconsecutive selections, loose prose between
selected items, locked descendants, decorated cards, activities, transformed
content and ambiguous groups are not silently flattened. Guards depend on known
HTML/CSS patterns; this remains a prototype rather than a general layout solver.

### Visual-header extension findings

Page 11's saved header had a block display override, so its title and badge were
stacked despite flex classes. Its badge had an empty heading consuming a grid row,
plus an edited 60% width and 30px internal padding. The new row actions replace
the conflicting layout declarations and preserve the objects' relative widths
while clearing alignment offsets. Rows spread the items apart, align their tops,
centres or bottoms, and stack below 640px. A multi-selection can promote a selected
label through single-content div wrappers (ignoring empty text placeholders),
but does not pull other unselected content into the selection.

**Centre contents** is limited to simple text-label containers. It uses a centred
column, clears child alignment offsets, and hides empty heading placeholders
without removing nodes or authored IDs. It retains wording and typography; the
separate inner-space controls make room for a label in a heavily padded badge.

Height editing measures the selected frame and its single-child div wrappers. It
reduces unused height and vertical padding before reaching the content's minimum.
Growth centres a single nested group within the frame. Height remains automatic
with an explicit minimum, so narrower layouts can grow. Numeric height and padding
fields and pointer commits write utilities through the same editor class/style
actions; pointer previews are removed on every cancellation path. Locked content
and positioned descendants reject this operation. No absolute placement, transforms,
new storage, dependencies or AI calls are introduced by this extension.

Repeated height edits exposed a class-writer bug: each action appended `box-border`
without removing or deduplicating the previous copy. The editor's `setClasses` action
retains duplicates, and the Inspector keys its class rows by class value. This caused
both duplicate document entries and stale, apparently undeletable rows. The shared
layout writer now deduplicates all exact class tokens; height edits also replace
conflicting box-sizing utilities. A resize repairs existing duplicates on the frames
it edits. The Styles panel rebuilds its Inspector only when the selected node's
duplicate count changes, clearing stale rows after cleanup or direct deletion while
keeping the document/provider/history intact. Ordinary edits retain panel state.

For a later free-placement trial, an explicit **Design container** is the clearer
boundary: the container remains one block in page flow, with its own placement and
breakpoint rules. AI can propose a conversion to rows, stacks, anchors and spacing
after placement, with desktop/tablet/phone previews and one Apply/Undo. A generic
offset panel alone does not define how surrounding content should reflow and can
accumulate overlapping corrections. The free-placement container, unrestricted
position panel and AI conversion remain recommendations requiring a focused spec.
The new Position prototype deliberately tests only visual translation offsets; it
does not solve content reflow or introduce those larger layout contracts.

- [x] Write a focused spec after the user tries the prototype.
- [ ] Archive.
- [x] Extend the experiment for the explicit text-flow and visual-header trials; retain the spec
  recommendation for production and reusable blocks.

Retain parent-bounded snapping, relative width, separate spacing handles, and the
parent-navigation toolbar as the candidate interaction model. Decide whether to
keep second-press body dragging or make the grip primary, how to scope overrides
to breakpoints, and which constrained layouts are worth supporting next. Shipping
requires a reviewed spec and implementation slices; this experiment is not to be
merged as implementation.
