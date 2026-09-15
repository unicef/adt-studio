import type { PublishComment } from "@adt/types"

export interface ThreadVisibility {
  version?: number
  includeResolved: boolean
  includeDeleted: boolean
}

/**
 * Threads are one level deep and the root governs the thread: `version`, `resolved_at` and
 * `deleted_at` are read off the root, and replies are kept or dropped with it. A reply written
 * after a republish therefore travels with its root's version instead of splitting the thread
 * across two filter results.
 */
export function filterCommentThreads(
  comments: PublishComment[],
  visibility: ThreadVisibility,
): PublishComment[] {
  const visibleRoots = new Set<string>()
  for (const comment of comments) {
    if (comment.parent_id !== null) continue
    if (visibility.version !== undefined && comment.version !== visibility.version) continue
    if (!visibility.includeResolved && comment.resolved_at !== null) continue
    if (!visibility.includeDeleted && comment.deleted_at !== null) continue
    visibleRoots.add(comment.id)
  }

  return comments.filter((comment) => {
    if (comment.parent_id === null) return visibleRoots.has(comment.id)
    if (!visibleRoots.has(comment.parent_id)) return false
    return visibility.includeDeleted || comment.deleted_at === null
  })
}
