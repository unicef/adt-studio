# Finding — a block model for responsive editing

Date: 2026-10-18. Follow-up to the
[responsive controls experiment](responsive-canvas-controls.md), related to #706
and the existing experiment PR #923. This is a design recommendation, not an
approved spec or a change to the editor's storage or runtime contract.

## Evidence from the user trial

Whole-component movement, ordering, and floating asides now work well in the
user's trial. Remaining failures expose a distinction between the object the user
sees and the HTML/CSS structure that currently implements it.

- The current saved page 13 (`pg013`, rendering v3) has a one-column grid at the
  section level, a nested two-column grid containing the first paragraph and
  vocabulary aside, and the next paragraph outside that inner grid. A float cannot
  make that next grid row fill the space beside the aside. There is also an empty
  grid wrapper. This is valid structure with a different layout meaning from
  continuous text; further nesting does not solve it.
- Page 12 places its aside and following paragraphs in a shared normal-flow
  container. This supports the text-wrapping behavior the user expects.
- Page 11's chapter badge currently has a block parent (rendering v7). Page 15's
  badge has a responsive flex parent (rendering v2). A read-only browser probe at
  actual canvas widths 762px and 1168px found that page 11's badge permits resizing
  at both widths. Page 15 permits it at 762px but loses it at 1168px when the parent
  becomes a flex row. Page 12's image has the same width-dependent restriction
  because its image/caption figure changes from flex-column to flex-row.
- `inspectFlow` deliberately disables direct sizing for immediate grid/flex-row
  children. The guard is predictable from CSS, but not from the user's concept of
  an image or chapter badge. Enabling every handle without interpreting the parent
  would only exchange an unexplained restriction for inconsistent resizing.
- The current Blocks rail renders the library's default palette. The installed
  library already accepts custom `PaletteEntry` entries through Palette/Grid.
  This supplies insertion plumbing, not a system for recognition, editable slots,
  reusable definitions, linked styling, or conversions of existing book content.

This investigation only read book pages and mounted temporary copies in the
browser. No page fixes, conversions, saves, or AI calls were performed.

## Recommended model

Keep ordinary HTML as the rendered/exported document. Add an explicit description
of recognized components and their editing capabilities. Adopt existing content
progressively, retaining a custom-HTML fallback for layouts that cannot yet be
described reliably.

Separate three responsibilities:

| Responsibility | Examples | What it controls |
| --- | --- | --- |
| Content block | Paragraph, figure, vocabulary callout, chapter badge | Content slots, nested blocks, semantic associations, resizing capabilities |
| Layout container | Text flow, vertical stack, columns | Ordering, wrapping, widths, gaps, placement, and narrow-screen reading order |
| Style variant | Green vocabulary card, circular chapter badge, compact callout | Typography, color, border, spacing and decoration |

A vocabulary block can retain its identity and style while becoming a full-width
block, a left/right float in text flow, or an item in a column. Nesting remains
available: a chapter header can contain a title block and a badge block; a figure
can contain media and caption slots. Movement chooses the component as a unit,
while editing its contents is an explicit selection level.

The initial set should be small: paragraph, figure, callout and chapter badge,
plus flow, stack and columns. Unknown HTML remains editable through the existing
editor and is not flattened or forced into a generic component.

## How the two reported cases should work

**Text with asides:** provide a meaningful “Text flow” layout with an anchored aside
and an ordered sequence of paragraphs. Text occupies the remaining width beside
the aside and returns to full width below it. A “Columns” layout retains separate
tracks instead. Converting the page-13 group to text flow should preview the
necessary wrapper/placement changes, retain all text and references, and apply as
one undoable operation. Only recognized layout wrappers can be removed; semantic
sections, diagrams, activities and linked labels must retain their associations.

**Consistent resizing:** the block's resize policy decides the operation. A chapter
badge changes diameter while retaining its shape and checking text fit. A figure
distinguishes resizing the whole figure from resizing its media slot; cropping is
another operation. A column item can adjust its track or allocated width instead
of receiving an arbitrary width override. The same selected block should expose
the same named controls, with a clear explanation when the parent limits them.

Both canvas handles and the Styles panel must use one property read/write path.
That closes the current inline-style/class disagreement rather than adding a third
independent set of values. Manual HTML/CSS edits need an explicit reconciliation
policy: recognize the supported change or mark the instance as customized; never
silently discard it when rendering the block again.

## Custom blocks and variations

The proposed workflow is:

1. Select an existing component and choose “Save as block.”
2. Detect its structure and suggest editable slots: title, body, image, caption,
   and nested content. The user can correct the proposed boundary and slots.
3. Save a book-local, versioned definition and style variant in the Blocks menu.
4. Insert independent content instances, or apply the style variant to compatible
   existing components. A copied example and an empty template are distinct choices.
5. Preview any update to matching instances before creating new page versions.

Definitions, style variants, and instances have different identities. Editing one
instance's text must not change other instances. A shared style update must be
explicit, reviewable, versioned and reversible; instances need a way to opt out.
Adopting an existing block preserves authored IDs. Inserting a new copy requires
new instance/content IDs through the project's ID factories and remapping of
internal references such as `label/for` and activity identifiers. Raw HTML cloning
is not sufficient for reusable blocks.

Exact schemas, metadata location, definition-version references, export behavior,
and the existing-library integration belong in an approved spec. Reusable book
definitions must travel with the book. Cross-book sharing can later be an explicit
import/export operation.

## AI's role

Use deterministic recognition for known structures, and AI for ambiguous grouping,
slot inference, repeated-pattern discovery, and proposals for new style variants.
A book scan can identify likely vocabulary cards, figures and chapter headers,
then offer representative examples for review and a batch of proposed conversions.

The AI should propose structured operations against existing content: adopt,
group, change layout, map slots, or apply a variant. Applying those operations uses
the same validated editor commands as manual editing. Dragging and resizing a
recognized block need no AI request.

Conversion previews must show desktop and narrow layouts. Mechanical checks retain
text, images, authored IDs, captions, alternate descriptions, activity/label links,
and explicit reading order. Prompts, proposals and validation results remain
inspectable and cached at the call level. Uncertain cases stay as custom HTML;
there is no automatic whole-book rewrite as the first step.

## Recommended next slice

Write a focused spec before building the production block model. Use pages 11, 12,
13 and 15 as acceptance examples: adopt the two chapter badges into one definition,
convert a grid-based text/aside group to text flow, keep figure captions attached,
save/reinsert a vocabulary variant with valid new IDs, and keep the inspector and
canvas in agreement. Verify at actual editor widths as well as phone widths.

Prove recognition and adoption on those pages before adding a whole-book conversion
command. The first implementation should not require users to convert their entire
book before receiving more dependable controls.
