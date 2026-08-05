# Storyboard Book Remediation Guide

This guide records the reusable lessons from remediating the **Science Standard 5** book. It is intended for any subject or language and should be used before, during, and after Storyboard generation.

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

### Tables and table continuations

**Symptoms**

- A continued row is rendered as an image.
- Repeated column headings are disconnected from the continuation.
- Empty layout cells trigger table accessibility warnings.

**Fix**

- Reconstruct tables as semantic HTML, including continuation rows on following pages.
- Preserve the original column model and use `<th scope="col">` and `<th scope="row">` where appropriate.
- Do not create header cells with no associated data solely to imitate spacing.
- If a table continues on another page, repeat visible column headings for comprehension while preserving continuation metadata.

### Table of contents

**Symptoms**

- Page numbers appear beside titles on the left.
- Dotted leaders are too short.
- Only the first TOC page is recognized.

**Fix**

- Detect TOC continuation across pages.
- Render each entry as title, flexible dotted leader, and right-aligned page number.
- The leader should expand from near the end of the title to near the page number, while allowing wrapped titles and mobile layouts.
- Keep entries semantic and link them to the corresponding digital page when targets are available.

### Accessibility validation findings

The Science Standard 5 remediation reduced **69 confirmed violations on 49 pages to 0 confirmed violations across 88 pages**. The safe, reusable corrections were:

- remove unsupported ARIA roles from native elements;
- replace decorative nested `<aside>` landmarks with non-landmark containers;
- repair skipped heading levels;
- remove invalid `aria-label`/`aria-labelledby` usage from role-less SVG primitives;
- remove non-interactive graphics from the keyboard tab order;
- repair missing radio labels and broken ID references;
- darken low-contrast activity headers, page-number ornaments, and callouts while retaining the book palette;
- keep automated “incomplete” results separate from confirmed violations and review them manually.

Do not chase a zero score by hiding meaningful content from assistive technology. A fix must remain visually faithful and semantically honest.

## Required quality gates for future books

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
- [ ] Capture desktop and mobile screenshots.
- [ ] Compare representative pages with the PDF, including diagrams, dense exercises, tables, TOCs, and chapter openings.
- [ ] Test keyboard navigation, focus visibility, accessible names, and answer entry.
- [ ] Rebuild Preview/Export and confirm they use the same latest HTML as Storyboard.

## Network resilience

Image meaningfulness and other LLM-backed extraction calls can fail with timeouts or connection closures. These are transport failures, not evidence that a page or image is invalid.

- Use bounded retries with exponential backoff and jitter for retryable network errors.
- Preserve successful per-page results through LLM-level caching.
- Resume only failed pages rather than restarting the book.
- Surface the page ID, attempt count, and retry status to the user.
- Never prune a page because an API call timed out.

## Related GitHub work

The following existing issues and pull requests cover the general code changes discovered during this remediation. Add evidence to these threads instead of filing duplicates:

| Area | Issue | Pull request |
| --- | --- | --- |
| Full-page visual fidelity | [#668](https://github.com/unicef/adt-studio/issues/668) | [#669](https://github.com/unicef/adt-studio/pull/669) |
| Page preservation in By Page mode | — | [#667](https://github.com/unicef/adt-studio/pull/667) |
| TOC leaders and response spacing | [#670](https://github.com/unicef/adt-studio/issues/670) | [#671](https://github.com/unicef/adt-studio/pull/671) |
| Accessible labelled diagrams | — | [#672](https://github.com/unicef/adt-studio/pull/672) |
| Heading hierarchy and font consistency | [#673](https://github.com/unicef/adt-studio/issues/673) | [#674](https://github.com/unicef/adt-studio/pull/674) |
| Validation fix routing | [#618](https://github.com/unicef/adt-studio/issues/618) | — |
| Embedded accessibility QA | [#678](https://github.com/unicef/adt-studio/issues/678) | — |

