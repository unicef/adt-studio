import type { PublishComment } from "@adt/types"

/**
 * Comments that arrived since the last look and were written by someone other than the author:
 * a reply the author just sent from Studio comes back on the next fetch and must not alert them.
 */
export function newReaderComments(
  comments: PublishComment[],
  seen: ReadonlySet<string>,
  authorName: string,
): PublishComment[] {
  return comments.filter(
    (comment) => !seen.has(comment.id) && comment.deleted_at === null && comment.author_name !== authorName,
  )
}

export function excerpt(body: string, max = 90): string {
  const text = body.replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}
