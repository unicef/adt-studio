import { useMemo } from "react"
import { buildThreads, filterThreads } from "@/components/publication-feedback/lib/threads"
import { useBookPublication } from "@/hooks/use-book-publication"
import { usePages } from "@/hooks/use-pages"
import { usePublicationComments } from "@/hooks/use-publication-feedback"
import { sectionIdFor } from "./storyboard-pins"

export interface CommentedSection {
  sectionId: string
  pageId: string
  sectionIndex: number
  pageNumber: number
  /** Threads still waiting on the author. */
  waiting: number
  /** The most recently active waiting thread — the one to open first. */
  latestThreadId: string
}

/**
 * Where the book's waiting comments are, section by section, in the order the book reads. The
 * Storyboard's page list marks these, and the comment layer uses it to jump to the next one — so
 * an author can work through the feedback without hunting page by page.
 */
export function useBookComments(bookLabel: string) {
  const status = useBookPublication(bookLabel)
  const published = status.data?.record !== null && status.data?.record !== undefined
  const comments = usePublicationComments(bookLabel, published)
  const pages = usePages(bookLabel)

  return useMemo(() => {
    const waiting = filterThreads(
      buildThreads(comments.data?.comments ?? []).filter((thread) => thread.root.deleted_at === null),
      { resolution: "unresolved", pageSectionId: null },
    )
    const bySection = new Map<string, CommentedSection>()
    const ordered: CommentedSection[] = []
    for (const page of pages.data ?? []) {
      for (const section of page.sections) {
        const sectionId = sectionIdFor(page.pageId, section.sectionIndex)
        const here = waiting.filter((thread) => thread.pageSectionId === sectionId)
        if (here.length === 0) continue
        const latest = [...here].sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0]
        const entry = {
          sectionId,
          pageId: page.pageId,
          sectionIndex: section.sectionIndex,
          pageNumber: page.pageNumber,
          waiting: here.length,
          latestThreadId: latest.root.id,
        }
        bySection.set(sectionId, entry)
        ordered.push(entry)
      }
    }
    return {
      published,
      bySection,
      ordered,
      total: ordered.reduce((sum, entry) => sum + entry.waiting, 0),
    }
  }, [comments.data, pages.data, published])
}

export type BookComments = ReturnType<typeof useBookComments>

/** The next commented section after this one in book order, wrapping round; `null` when this is
 *  the only one. */
export function nextCommented(book: BookComments, sectionId: string): CommentedSection | null {
  const others = book.ordered.filter((entry) => entry.sectionId !== sectionId)
  if (others.length === 0) return null
  const index = book.ordered.findIndex((entry) => entry.sectionId === sectionId)
  if (index === -1) {
    return book.ordered.find((entry) => entry.sectionId > sectionId) ?? book.ordered[0]
  }
  return book.ordered[(index + 1) % book.ordered.length]
}
