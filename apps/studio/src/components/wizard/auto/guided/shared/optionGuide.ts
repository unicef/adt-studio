import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"

/**
 * The long explanation of one option, for the options dialog: the signs that it fits the book,
 * when another option fits better (and which), books it suits, and (for a page layout) what it
 * costs to make. Every option the user can pick on a Check screen has one.
 */
export type OptionGuide = {
  fits: MessageDescriptor[]
  /** When another option fits better: the sign, and the option to look at instead. */
  better: { when: MessageDescriptor; go: string }[]
  examples: MessageDescriptor
  /** How the book is made with it (page layouts only). */
  making?: { ai: boolean; says: MessageDescriptor }
}

const AI_MAKING = { ai: true, says: msg`The AI builds every page, so setting up takes longer and uses AI credits.` }
const TEMPLATE_MAKING = { ai: false, says: msg`Pages are laid out from a template, with no AI work on the layout, so it is quicker and costs no AI credits for the layout.` }

/** Per fact (genre, exercises, composition, diagrams), per answer. */
export const FACT_GUIDE: Record<string, Record<string, OptionGuide>> = {
  genre: {
    story: {
      fits: [msg`Characters or events go from a beginning to an end.`, msg`Most pages are part of one tale, even with a few colouring pages.`, msg`The pictures carry much of the meaning.`],
      better: [
        { when: msg`The pages are lessons with exercises.`, go: "textbook" },
        { when: msg`People open it to look things up, like a guide or a report.`, go: "reference" },
      ],
      examples: msg`Picture books, folk tales, early readers, novels.`,
    },
    textbook: {
      fits: [msg`Chapters or units teach a subject.`, msg`The learner is given questions, exercises or activities.`, msg`Headings like Lesson, Unit or Activity.`],
      better: [
        { when: msg`The only tasks are colouring or drawing inside a story.`, go: "story" },
        { when: msg`There are no tasks, only information.`, go: "reference" },
      ],
      examples: msg`School textbooks, workbooks, lesson booklets, activity books.`,
    },
    reference: {
      fits: [msg`People look things up more than they read it from start to end.`, msg`Facts, instructions or findings under headings.`, msg`No exercises for the reader.`],
      better: [
        { when: msg`It tells a tale.`, go: "story" },
        { when: msg`It sets tasks for a learner.`, go: "textbook" },
      ],
      examples: msg`Reports, manuals, guides, articles, leaflets.`,
    },
  },
  exercises: {
    none: {
      fits: [msg`The reader only reads.`, msg`The only activities are colouring or drawing.`, msg`Questions are asked in the text, but there is no place on the page to answer them.`],
      better: [{ when: msg`Some pages have blanks, lines or boxes to write in.`, go: "some" }],
      examples: msg`Story books, reports, most guides.`,
    },
    some: {
      fits: [msg`A few pages have questions, blanks, matching or tick boxes.`, msg`Most pages are for reading.`],
      better: [
        { when: msg`Almost every page has a task.`, go: "many" },
        { when: msg`The tasks are only colouring or drawing.`, go: "none" },
      ],
      examples: msg`A story with a quiz at the end, a guide with a short check.`,
    },
    many: {
      fits: [msg`Most pages ask the reader to write, match, circle or tick.`, msg`There are lines or boxes to write answers in.`],
      better: [{ when: msg`Only a few pages have tasks.`, go: "some" }],
      examples: msg`Workbooks, exercise books, practice sheets.`,
    },
  },
  composition: {
    "text-in-art": {
      fits: [msg`The words are printed on top of the picture.`, msg`They sit on a calm part of it: the sky, the sea or a coloured band.`, msg`Taking the words out would leave a gap in the picture.`],
      better: [
        { when: msg`The words have their own white area.`, go: "text-beside-art" },
        { when: msg`The pages are mostly text.`, go: "text-mostly" },
      ],
      examples: msg`Picture books for young children, comic-like pages.`,
    },
    "text-beside-art": {
      fits: [msg`The words sit above, below or next to the picture.`, msg`A page of text faces a page of picture.`, msg`The picture is whole without the words.`],
      better: [
        { when: msg`The words are printed on top of the picture.`, go: "text-in-art" },
        { when: msg`Pictures are few or small.`, go: "text-mostly" },
      ],
      examples: msg`Illustrated story books, early readers.`,
    },
    "text-mostly": {
      fits: [msg`Most of each page is text.`, msg`Pictures are few, small or only decoration.`],
      better: [
        { when: msg`Big pictures on most pages, with words on them.`, go: "text-in-art" },
        { when: msg`Big pictures on most pages, with words next to them.`, go: "text-beside-art" },
      ],
      examples: msg`Novels, chapter books, reports, guides.`,
    },
  },
  diagrams: {
    none: {
      fits: [msg`Only illustrations or photos.`, msg`A caption under a photo doesn't count.`],
      better: [{ when: msg`There are maps, charts or drawings with labels.`, go: "some" }],
      examples: msg`Story books, most novels.`,
    },
    some: {
      fits: [msg`A few maps, charts, diagrams or labelled drawings.`, msg`Labels point at parts of a picture.`],
      better: [
        { when: msg`They are on many pages.`, go: "many" },
        { when: msg`The pictures have no labels, only captions.`, go: "none" },
      ],
      examples: msg`A guide with a map, a report with a few charts.`,
    },
    many: {
      fits: [msg`Maps, charts or labelled drawings on many pages.`, msg`Understanding the book depends on them.`],
      better: [{ when: msg`Only a handful of pages have them.`, go: "some" }],
      examples: msg`Science and geography books, atlases, manuals.`,
    },
  },
}

/** Per page layout (render strategy). */
export const LAYOUT_GUIDE: Record<string, OptionGuide> = {
  llm: {
    fits: [msg`Pages mix headings, text, pictures and exercises.`, msg`Readers use phones as well as computers.`, msg`Reading well on any screen matters more than the printed look.`],
    better: [{ when: msg`The page must look exactly as printed.`, go: "fixed_layout" }],
    examples: msg`School books, workbooks, guides with many parts.`,
    making: AI_MAKING,
  },
  "llm-overlay": {
    fits: [msg`The words sit on the pictures, and the PDF is a scan with no real text.`, msg`You want the printed look with real, readable words.`],
    better: [{ when: msg`The PDF already has real text.`, go: "fixed_layout" }],
    examples: msg`Scanned picture books.`,
    making: AI_MAKING,
  },
  single_column: {
    fits: [msg`It is mostly text, like an article or a report.`, msg`Long reading on small screens.`],
    better: [{ when: msg`Big pictures carry the meaning.`, go: "two_column_story" }],
    examples: msg`Reports, articles, novels, guides.`,
    making: TEMPLATE_MAKING,
  },
  two_column_story: {
    fits: [msg`Each page has a picture and some words next to it.`, msg`The picture and its words belong together.`],
    better: [{ when: msg`The words are printed on the picture.`, go: "fixed_layout" }],
    examples: msg`Illustrated story books, early readers.`,
    making: TEMPLATE_MAKING,
  },
  fixed_layout: {
    fits: [msg`The words are part of the picture.`, msg`The design of the printed page matters.`],
    better: [{ when: msg`Readers will mostly use phones, where a whole page gets small.`, go: "llm" }],
    examples: msg`Picture books, posters, designed pages.`,
    making: { ai: false, says: msg`Each page is kept as it is printed, with no AI work on the layout, so it is quick and costs no AI credits for the layout.` },
  },
}

/**
 * The page layouts at a glance, on the Look screen: one line on what you get (the card), the books
 * it suits, and what happens on a phone.
 */
export const LAYOUT_AT_A_GLANCE: Record<string, { line: MessageDescriptor; best: MessageDescriptor; phone: MessageDescriptor }> = {
  fixed_layout: {
    line: msg`Your page, exactly as printed.`,
    best: msg`Picture books where the words are part of the art.`,
    phone: msg`The whole page shrinks to fit, so small text gets small.`,
  },
  two_column_story: {
    line: msg`The picture on one side, its words on the other.`,
    best: msg`Picture books with the words beside the art.`,
    phone: msg`The words move under the picture.`,
  },
  single_column: {
    line: msg`One clean column of text, pictures in between.`,
    best: msg`Articles, reports, guides and novels.`,
    phone: msg`Reads like a web page; the text stays a comfortable size.`,
  },
  llm: {
    line: msg`The AI rebuilds each page to fit the screen.`,
    best: msg`School books and pages with many parts: headings, pictures, exercises.`,
    phone: msg`Everything rearranges into one easy column.`,
  },
  "llm-overlay": {
    line: msg`The printed page stays, with real words laid on top.`,
    best: msg`Scanned picture books, where the PDF has no real text.`,
    phone: msg`The whole page shrinks to fit, like the printed page.`,
  },
}
