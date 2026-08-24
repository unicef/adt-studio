# Storyboard Book Remediation Guide

This guide is a reusable playbook for remediating any book, in any subject or language, before, during, and after Storyboard generation.

The goal is not merely to pass automated checks. The digital book should preserve the source book's content, visual identity, reading order, activities, and diagrams while adding keyboard, screen-reader, mobile, language, and voice support.

## Non-destructive workflow

1. Keep the source PDF as the visual and content authority.
2. Treat every page accepted by Sectioning as valid Storyboard input. Do not silently prune it.
3. In **By Page** mode, keep one source page as one Storyboard page. Do not turn visual regions into separate pages.
4. Save corrections as new `web-rendering` entity versions. Never overwrite the previous rendering.
5. Rebuild the ADT package after changes so Preview, Export, and Validation use the latest rendering.
6. Compare the source page, Storyboard page, and packaged page. A file-level edit alone is not sufficient evidence.

## Recurring problems and their general fixes

### Page preservation and section boundaries

**Symptoms**

- Pages present in Sectioning disappear from Storyboard.
- One source page appears as multiple Storyboard pages.
- A continuation page is mistaken for a new activity, table, or table of contents.

**Fix**

- Derive Storyboard page membership from Sectioning output, not from an LLM judgement about whether a page is meaningful.
- In By Page mode, enforce one section per source page.
- Carry continuation context across adjacent pages for tables, TOCs, exercises, experiments, and other multi-page structures.
- Verify page cardinality with an assertion: every non-pruned Sectioning page ID must have a Storyboard rendering.

### Visual fidelity and typography

**Symptoms**

- Heading sizes change from page to page.
- Side colours, chapter colours, cards, page-number ornaments, or borders disappear.
- A generated page contains the right text but no longer feels like the same book.

**Fix**

- Extract a book-level design system before rendering pages: font families, heading levels, font-size ratios, colours, border radii, spacing, page furniture, and repeated component styles.
- Map semantic roles to stable book-wide tokens (`h1`, `h2`, `h3`, body, caption, activity title) instead of choosing sizes independently per page.
- Preserve decorative side bands and page furniture unless the source page intentionally omits them.
- Use screenshot-driven visual review against the complete source page. Compare layout, hierarchy, colour, image scale, and whitespace, not text alone.
- Keep semantic heading order sequential. If the page begins at a subsection, add or infer the missing parent level rather than jumping from `h1` to `h3`.

### Labelled diagrams

**Symptoms**

- The image is cropped to the illustration and the original labels are lost.
- Leader lines stop in empty space or point to the wrong organ or component.
- Labels look correct at one viewport but drift on mobile.
- SVG points use invalid ARIA attributes or create meaningless keyboard stops.

**Fix**

1. Preserve a clean base illustration without burning generated labels into it.
2. Detect the source label text, leader-line endpoints, and anatomical/component targets together. Do not infer target coordinates from label order alone.
3. Store coordinates in the image's intrinsic coordinate system and render overlays with a matching SVG `viewBox`. Scale the image and overlay as one responsive unit.
4. End each leader line at the target coordinate and begin it next to the corresponding label. Use a visible endpoint marker only when it improves clarity.
5. Give the complete figure an accessible name and long description. Provide the labelled parts as semantic text (for example, a list linked to the diagram).
6. Do not put `aria-label` directly on role-less SVG `circle` or `line` elements. Decorative lines should be hidden from assistive technology. Meaningful graphical objects need a supported role and must not be placed in the keyboard order unless they perform an action.
7. Test coordinates at desktop and mobile widths, and visually compare every label with the source page.

### Images on mobile

**Symptoms**

- Important images become too small to understand.
- Labels or captions are clipped.

**Fix**

- Use responsive containers and intrinsic aspect ratios.
- Avoid fixed pixel dimensions that shrink the image below a useful reading size.
- Allow an image or diagram to use the full mobile width; provide zoom or a larger view when dense labels cannot remain legible.
- Keep captions adjacent to the image and associate them with `<figure>`/`<figcaption>`.

### Exercises and activities

**Symptoms**

- An exercise is rendered as a screenshot instead of interactive HTML.
- Multiple-choice or true/false options have no controls or visible labels.
- Short-answer fields are missing or appear far from their questions.
- Fill-in-the-blank responses are placed below the whole activity instead of in the sentence.

**Fix**

- Detect activity intent from the heading, instructions, numbering, option patterns, and cross-page continuation—not from a single visual block.
- Multiple choice: use a labelled `fieldset`, `legend`, and one radio group per question.
- True/false: show explicit **True** and **False** labels and give each radio group the statement as its accessible name.
- Open-ended questions: place a labelled input or textarea immediately below its question. Preserve subquestions such as 2(a) and 2(b) as separate answer fields.
- Fill in the blank: place the input at the blank's position and provide a meaningful accessible label.
- Drawing or programming tasks: provide an appropriately sized response area and retain the instruction; do not pretend a text field fully replaces a required external tool.
- Preserve response state and keyboard focus, and ensure every control has a unique name and label.
- Page-mode books often classify an entire mixed page as `text_and_images` instead of an `activity_*` section. Activity detection and writable-field validation must therefore inspect saved node roles and instructions, not only the section type.
- When a crop is primarily a passage, worksheet, form, table, or exercise, do not display it as the learner-facing result. Reconstruct its text, headings, word bank, borders, and controls as semantic HTML. Retain only genuine illustrations that can be isolated from the text.
- Passage blanks must remain inline at the exact missing-word position. A separate answer panel changes the exercise mechanic and is not an acceptable digitization even when every question has a field.
- Conversations and dialogues with blanks are exercises, not illustrations. Rebuild the speaker turns as semantic HTML, retain the speaker names and reading order, and place a labelled inline control at every blank.
- For a printed word bank or choices in parentheses, preserve the choice mechanic with reusable answer chips and inline drop targets. Support pointer drag-and-drop, chip selection followed by Enter on a focused blank, and direct typing or a native select/datalist fallback. Dragging must never be the only interaction; use specific target labels, `aria-pressed` selection state, and a live status region that announces selection and placement.
- In picture word-bank exercises, place a labelled dropdown/drop target below every picture, retain reusable answer chips, and add meaningful image alternatives. Remove the original decorative underline when inserting the control so learners do not see an input followed by a second blank line.
- When a picture word-bank exercise continues across pages, associate all continuation pictures with the same activity and repeat the complete choice bank on each storyboard page. Do not leave the first half interactive and the following half as a screenshot or unassisted text fields.
- In picture grids, stack each image and its response field in a column. A `w-full` input placed in a horizontal flex row beside an image can collapse to an unusable sliver even though it technically exists.

**Verification**

- Audit every page for answerable instructions, explicit questions, printed blanks, and existing controls.
- Assert that controls have unique IDs and `data-activity-item` values, supported input types, specific accessible names, and at least 44px touch height.
- Test the Storyboard's real Mobile mode (375px), not only a resized outer browser window, because the preview iframe has its own device viewport.
- Enter a sample answer and verify the control is enabled, keyboard-focusable, and retains the typed value.

### Tables and table continuations

**Symptoms**

- A continued row is rendered as an image.
- Repeated column headings are disconnected from the continuation.
- Empty layout cells trigger table accessibility warnings.

**Fix**

- Reconstruct tables as semantic HTML, including continuation rows on following pages.
- A timetable or other table made entirely from text is never a learner-facing image: reconstruct every row and cell, keep the source crop hidden for provenance, and verify the table wraps without horizontal clipping at 375px.
- Preserve the original column model and use `<th scope="col">` and `<th scope="row">` where appropriate.
- Do not create header cells with no associated data solely to imitate spacing.
- If a table continues on another page, repeat visible column headings for comprehension while preserving continuation metadata.

### Table of contents

**Symptoms**

- Page numbers appear beside titles on the left.
- Dotted leaders are too short.
- Only the first TOC page is recognized.
- A continuation page creates a separate, absolutely positioned page-number column.
- Long entries overflow instead of wrapping while keeping their page number aligned.
- Old decorative dot spans remain beside the repaired leader and produce doubled or broken leaders.

**Fix**

- Detect TOC continuation across adjacent pages from structure and content, even when a continuation page does not repeat the `Contents` heading.
- Parse each entry into three semantic siblings inside one full-width flex row: a title, a flexible dotted leader, and a fixed-width right-aligned page number. Keep Roman numerals valid for front matter.
- Give the title `min-width: 0` and a bounded maximum width, the leader `flex: 1` with a useful minimum width, and the page number a fixed shrink-proof width with tabular numerals.
- Allow long titles to wrap. Do not force `nowrap` at desktop breakpoints; the leader must begin after the final title line and continue to the shared page-number column.
- Remove obsolete decorative leader elements and remove duplicate absolute number-only overlays only when their values match the semantic TOC entries. Do not remove unrelated page furniture.
- Do not interpret a heading such as `Chapter 1` as a TOC entry unless it contains a leader pattern or is already structurally row-like.
- Keep entries semantic and link them to the corresponding digital page when targets are available.

**Verification**

- Compare every TOC page—not only the page containing the `Contents` heading—with its source PDF page.
- Assert that every entry's page-number right edge equals its row's right edge and that all entries share one page-number column.
- Assert that each row has a non-zero leader, there are no duplicate number-only overlays, and the rendered section has no horizontal overflow.
- Include tests for front-matter Roman numerals, multi-page continuation, long wrapped titles, unit/chapter headings, and cleanup of legacy generated markup.

### Accessibility validation

**Fix**

- Remove unsupported ARIA roles from native elements.
- Replace decorative nested `<aside>` landmarks with non-landmark containers.
- Repair skipped heading levels.
- Remove invalid `aria-label`/`aria-labelledby` usage from role-less SVG primitives.
- Remove non-interactive graphics from the keyboard tab order.
- Repair missing radio labels and broken ID references.
- Darken low-contrast activity headers, page-number ornaments, and callouts while retaining the book palette.
- Keep automated “incomplete” results separate from confirmed violations and review them manually.

Do not chase a zero score by hiding meaningful content from assistive technology. A fix must remain visually faithful and semantically honest.

## Required quality gates for every book

### Before Storyboard

- [ ] Page IDs and counts match the source PDF and Sectioning output.
- [ ] Book-level typography and colour tokens are extracted.
- [ ] Multi-page TOCs, tables, experiments, and exercises are identified.
- [ ] Labelled diagrams are flagged for coordinate-aware handling.

### Per-page Storyboard review

- [ ] Content and reading order match the source.
- [ ] Heading role and size match the book-wide hierarchy.
- [ ] Side colours, borders, cards, and page furniture are preserved.
- [ ] Images remain legible on desktop and mobile.
- [ ] Diagram leaders touch the correct parts and labels correspond one-to-one.
- [ ] Activities use real controls and response spaces are next to their questions.
- [ ] Tables and TOCs continue correctly from adjacent pages.

### Automated and visual testing

- [ ] Run structural HTML validation.
- [ ] Run axe/WCAG validation on the packaged book.
- [ ] Treat confirmed violations as failures; record inconclusive checks for human review.
- [ ] Retain before/after machine-readable reports with the book revision and exact command used. See the [accessibility regression tooling](../README.md#accessibility-regression-tooling).
- [ ] Capture desktop and mobile screenshots.
- [ ] Compare representative pages with the PDF, including diagrams, dense exercises, tables, TOCs, and chapter openings.
- [ ] Test keyboard navigation, focus visibility, accessible names, and answer entry.
- [ ] Rebuild Preview/Export and confirm they use the same latest HTML as Storyboard.

## Network resilience

Image meaningfulness and other LLM-backed extraction calls can fail with timeouts or connection closures. These are transport failures, not evidence that a page or image is invalid.

- Treat connection timeouts, connection resets or closures, HTTP 408, HTTP 429, and retryable HTTP 5xx responses as transient. Do not retry authentication, validation, or other non-retryable failures.
- Use bounded retries with exponential backoff and jitter for transient errors.
- Preserve successful per-page results through LLM-level caching.
- Resume only failed page IDs rather than restarting successful pages or calling the LLM for them again.
- After retries are exhausted, preserve page cardinality and surface an actionable per-page error with a retry action. Never prune a page because an API call failed.
- Record the page ID, attempt count, final error class, prompt and model, cache status, and retry outcome for inspection.
- Test connection timeout, closed connection, HTTP 429, retryable HTTP 5xx, and non-retryable failure paths.
