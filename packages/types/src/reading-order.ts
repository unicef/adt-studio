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
})
export type ReadingOrderOutput = z.infer<typeof ReadingOrderOutput>
