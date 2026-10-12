import { z } from "zod"

/**
 * The book's output sequence: which pages the reader sees, in what order.
 *
 * Stored as a single book-level entity so a reorder is one versioned, roll-back-able
 * change that never touches source data. Position in this list is the *output*
 * position and is never written back to `pageNumber`, `sectionIndex`, or any
 * asset name — source-PDF identity and provenance stay exactly as extracted.
 *
 * Items are referenced by their stable output ids (`pg003_sec002`, `qz001`),
 * which is why those ids had to stop being positional first.
 */
export const READING_ORDER_NODE = "reading-order"
export const READING_ORDER_ITEM_ID = "book"

/**
 * How many times the book's section ids have been thrown away and re-minted.
 *
 * A full Sectioning rebuild clears `page-sectioning`, which is where the
 * section-id high-water mark is read from, so the next run re-allocates
 * densely from `_sec001`. The ids are therefore *reused*, naming different
 * content — and a stored reading order matches by id string alone, so it would
 * reconcile cleanly and silently rebind the user's arrangement to whatever now
 * holds those ids.
 *
 * Counting the rebuilds is what lets an order say which section-id space it was
 * written against. Bumped at the rebuild boundary and stamped onto every order
 * saved after it; an order from an older generation is ignored rather than
 * applied, and cannot be restored.
 *
 * It is a plain counter rather than a reference to a `page-sectioning` version
 * because the versions themselves are what the rebuild destroys.
 */
export const SECTIONING_GENERATION_NODE = "sectioning-generation"
export const SECTIONING_GENERATION_ITEM_ID = "book"

export const SectioningGenerationOutput = z.object({
  generation: z.number().int().nonnegative(),
})
export type SectioningGenerationOutput = z.infer<typeof SectioningGenerationOutput>

export const ReadingOrderItem = z.object({
  kind: z.enum(["section", "quiz"]),
  /** A stable `sectionId` or `quizId`. */
  id: z.string().min(1),
})
export type ReadingOrderItem = z.infer<typeof ReadingOrderItem>

export const ReadingOrderOutput = z.object({
  /** Bumped only if the meaning of `items` ever changes. */
  schemaVersion: z.literal(1).default(1),
  /**
   * The explicit output order. Holds pruned items too: a pruned item keeps its
   * slot so re-including it restores its original position. Visibility is read
   * from the entity itself (`section.isPruned`), never from this list — one
   * writer per fact.
   */
  items: z.array(ReadingOrderItem),
  updatedAt: z.string(),
  /**
   * The `sectioning-generation` this arrangement was made against.
   *
   * Optional because every order saved before the stamp existed has none, and
   * those are honoured rather than invalidated retroactively — an upgrade must
   * not throw away arrangements that are still perfectly valid. Absent means
   * "assume current"; a value *below* the book's current generation means the
   * ids it names have since been reused for other content.
   */
  sectioningGeneration: z.number().int().nonnegative().optional(),
})
export type ReadingOrderOutput = z.infer<typeof ReadingOrderOutput>
