/**
 * Plain words for auto mode (issue #333). Wording comes from the experiment's
 * round-3 prototypes (experiments/setup-recommender/prototype-words.ts) with
 * the simulated user's fixes: no jargon names ("Starting template", "Reading
 * parts", "Facing pages"), and "Our guess / Other possibility" for disagreeing
 * readings.
 */
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { SetupBookFactId, SetupSettingId } from "@adt/types"

export const FACT_QUESTION: Record<SetupBookFactId, MessageDescriptor> = {
  genre: msg`What is this book mostly?`,
  exercises: msg`Does the book ask the reader to write or mark answers? (Colouring and drawing do not count.)`,
  composition: msg`Where are the words on a page?`,
  diagrams: msg`Are there pictures with labels that explain something, like maps, charts, diagrams or labelled drawings?`,
}

export const FACT_SHORT: Record<SetupBookFactId, Record<string, MessageDescriptor>> = {
  genre: { story: msg`A story`, textbook: msg`A school book`, reference: msg`Information` },
  exercises: { none: msg`No`, some: msg`Yes, on a few pages`, many: msg`Yes, on most pages` },
  composition: {
    "text-in-art": msg`On the picture`,
    "text-beside-art": msg`Beside the picture`,
    "text-mostly": msg`Mostly words`,
  },
  diagrams: { none: msg`No`, some: msg`Yes, a few`, many: msg`Yes, many` },
}

export const FACT_LONG: Record<SetupBookFactId, Record<string, MessageDescriptor>> = {
  genre: {
    story: msg`Readers follow characters or events from start to end: a picture book, a tale or a novel. A few colouring pages don't change that.`,
    textbook: msg`It teaches a subject in lessons and gives the learner tasks to do.`,
    reference: msg`People read it to find information: a report, an article, a manual or a guide. No tasks for the reader.`,
  },
  exercises: {
    none: msg`The reader only reads, or colours and draws.`,
    some: msg`Questions to answer, blanks to fill, things to match, circle or tick, on a few pages.`,
    many: msg`Questions, blanks or matching on most pages.`,
  },
  composition: {
    "text-in-art": msg`The words sit inside the picture, even on a calm part of it like the sky, the sea or a coloured band. The picture may continue onto the facing page.`,
    "text-beside-art": msg`The words have their own area outside the picture: above, below or next to it, or on the facing page.`,
    "text-mostly": msg`It is mostly words. Pictures are few or small.`,
  },
  diagrams: {
    none: msg`Only illustrations or photos. A caption under a photo doesn't count.`,
    some: msg`A few maps, charts, diagrams or labelled drawings.`,
    many: msg`Maps, charts, diagrams or labelled drawings on many pages.`,
  },
}

export const SETTING_NAME: Record<SetupSettingId, MessageDescriptor> = {
  preset: msg`Kind of book`,
  renderStrategy: msg`Page layout`,
  pageGrouping: msg`Pictures across two pages`,
  sectioningMode: msg`How each page is split`,
  activitiesGenerator: msg`Interactive activities`,
  figureExtraction: msg`Maps and labelled drawings`,
}

/** What the picked value means for the finished book. */
export const SETTING_VALUE: Record<SetupSettingId, Record<string, { name: MessageDescriptor; means: MessageDescriptor }>> = {
  preset: {
    storybook: { name: msg`Story`, means: msg`Settings made for picture books and tales.` },
    textbook: { name: msg`School book`, means: msg`Settings made for lessons with exercises.` },
    reference: { name: msg`Information`, means: msg`Settings made for reports, articles and guides.` },
  },
  renderStrategy: {
    llm: { name: msg`Rebuilt to fit the screen`, means: msg`The AI rebuilds each page so it reads well on any screen size.` },
    "llm-overlay": {
      name: msg`Printed page, words rebuilt on top`,
      means: msg`The page picture stays, and the AI types its words again on top, so they work like normal text.`,
    },
    single_column: { name: msg`One column, like an article`, means: msg`The words flow in one clean column, with pictures in between.` },
    two_column_story: { name: msg`Picture beside the words`, means: msg`Each page shows the picture on one side and its words on the other.` },
    fixed_layout: { name: msg`Keep the printed page`, means: msg`Each page looks exactly like the printed book.` },
  },
  pageGrouping: {
    single: { name: msg`One PDF page per screen`, means: msg`Every page of the PDF becomes one screen.` },
    spread: { name: msg`Two facing pages joined`, means: msg`Each pair of facing pages becomes one wide screen, so pictures stay whole.` },
  },
  sectioningMode: {
    page: { name: msg`Each page is one part`, means: msg`Pages are kept whole.` },
    dynamic: { name: msg`Split into reading and tasks`, means: msg`Each page is split into parts, so reading and exercises can be handled on their own.` },
  },
  activitiesGenerator: {
    true: { name: msg`On`, means: msg`The book's exercises become activities the reader can answer on screen.` },
    false: { name: msg`Off`, means: msg`No interactive activities are made.` },
  },
  figureExtraction: {
    auto: { name: msg`Kept together with their labels`, means: msg`A map or diagram and its labels stay one figure, so the labels don't turn into loose text.` },
    off: { name: msg`Not needed`, means: msg`Pictures and words are handled separately.` },
  },
}

/** Why the rulebook picked it (rule ids from packages/pipeline/src/setup-recommender/rules.ts). */
export const RULE_WHY: Record<string, MessageDescriptor> = {
  "genre-story": msg`Most of the pages we read tell a story.`,
  "genre-textbook": msg`Most of the pages we read teach lessons or set tasks.`,
  "genre-reference": msg`Most of the pages we read give information, with no tasks for the reader.`,
  "render-reference-column": msg`Information reads best as one clean column.`,
  "render-textbook-ai": msg`Lessons and exercises need their structure rebuilt.`,
  "render-keep-page": msg`The words sit on the pictures, so we keep your page as it is.`,
  "render-overlay-no-text-layer": msg`The words sit on the pictures, but your PDF is a scan (its words can't be selected), so the AI types them again over the page.`,
  "render-overlay-no-text-beside": msg`The words sit beside the pictures, but your PDF is a scan (its words can't be selected), so the AI types them again over the page.`,
  "render-side-by-side": msg`The words sit beside the pictures, so they can go side by side.`,
  "render-reflow": msg`The book is mostly words, so they can flow to fit the screen.`,
  "group-joined-spreads": msg`Pictures run across two facing pages.`,
  "group-facing-pages": msg`The book is laid out in two-page openings: a page of text faces a page of picture.`,
  "group-wide-pages": msg`Your PDF already has both pages side by side on one wide page.`,
  "group-single": msg`Pictures don't run across facing pages.`,
  "activities-on": msg`The book asks the reader to write or mark answers.`,
  "activities-few-cues": msg`The book sets tasks, but few pages have places to write answers, so no activities are made.`,
  "activities-not-in-preset": msg`There are tasks, but this kind of book doesn't turn them into activities.`,
  "activities-none": msg`The book has no tasks for the reader.`,
  "sections-split": msg`Pages mix reading and exercises.`,
  "sections-school-book": msg`School books are split into sections by the AI.`,
  "sections-page": msg`Each page reads as one piece.`,
  "figures-keep-together": msg`The book has labelled pictures like maps or diagrams.`,
  "figures-none": msg`The book has no labelled pictures.`,
  "figures-no-text-layer": msg`Your PDF is a scan (its words can't be selected), so there are no labels to keep together.`,
}

export const TEXT_LAYER: Record<string, MessageDescriptor> = {
  digital: msg`The PDF has real text, so we read the words directly.`,
  scanned: msg`The pages are photos of paper (a scan), so the words are read from the pictures.`,
  "scanned-with-ocr": msg`The pages are a scan with hidden text added.`,
  mixed: msg`Some pages have real text, some are scans.`,
}

export const OUR_GUESS = msg`Our guess`
export const OTHER_POSSIBILITY = msg`Other possibility`
