import { useCallback, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { PUBLISH_AUTHOR_DEFAULT_NAME } from "@adt/types"
import type { CommentAnchor } from "@/api/client"
import { buildThreads, filterThreads } from "@/components/publication-feedback/lib/threads"
import {
  parseSectionId,
  sectionLocation,
} from "@/components/pipeline/stages/storyboard/components/feedback/storyboard-pins"
import {
  type BookPublishRunController,
  useBookPublication,
  useRevokePublication,
  useSetPublicationAccessCode,
  useSetPublicationExpiry,
} from "@/hooks/use-book-publication"
import { useBook } from "@/hooks/use-books"
import {
  publicationCommentsKey,
  useAuthorIdentity,
  usePublicationComments,
  useReplyToThread,
  useResolveThread,
} from "@/hooks/use-publication-feedback"
import { usePublicationReaders } from "@/hooks/use-publications"

/**
 * Everything the live Sharing dashboard knows, in one shape, gathered from the publication,
 * feedback and readers queries so the components only draw.
 */

export interface DashThread {
  id: string
  pageSectionId: string
  pageId: string | null
  pageNumber: number | null
  sectionNumber: number | null
  /** "Page 8 · Section 2", or "Somewhere in the book" when the id cannot be read. */
  pageLabel: string
  authorName: string
  authorColor: string
  createdAt: string
  /** When the thread last moved — its root or its newest reply. */
  lastActivityAt: string
  body: string
  replyCount: number
  /** The newest reply, when there is one, so a layout can show that the conversation moved. */
  lastReply: { authorName: string; authorColor: string; body: string; createdAt: string } | null
  /** Every reply the author can read, oldest first. */
  replies: DashReply[]
  resolved: boolean
  resolvedAt: string | null
  /** The book version the comment was left on. */
  version: number | null
  /** Where on the page it was left: a `#content`-rooted selector and an offset inside it.
   *  `null` for a comment on the page as a whole. */
  anchor: CommentAnchor | null
}

export interface DashReply {
  id: string
  authorName: string
  authorColor: string
  body: string
  createdAt: string
}

export interface DashReader {
  id: string
  name: string
  color: string
  joinedAt: string
  commentCount: number
  lastCommentAt: string | null
}

export interface DashVersion {
  version: number
  publishedAt: string
  pageCount: number
}

export interface DashLink {
  bookLabel: string
  title: string
  url: string
  liveVersion: number | null
  updatedAt: string | null
  accessCode: string | null
  expiresAt: string | null
  /** The book has been edited since the live version was shared. `null` when it can't tell. */
  changesWaiting: boolean | null
  workerReachable: boolean
  isUpdating: boolean
  update: () => void
  /** A code is required. `accessCode` can still be `null` when it was set somewhere this
   *  computer never saw, so the link is locked but the code can't be shown. */
  hasAccessCode: boolean
  /** A new code, or `null` to open the link to anyone. Everyone on the old code is locked out.
   *  `onDone` runs once the service has taken it. */
  setAccessCode: (code: string | null, onDone?: () => void) => void
  accessBusy: boolean
  /** An ISO end date, or `null` for none. */
  setExpiry: (iso: string | null) => void
  expiryBusy: boolean
  /** The last access or end-date change failed; nothing changed. */
  changeFailed: boolean
  /** Stop sharing: the link goes dark for everyone. */
  revoke: (onDone?: () => void) => void
  revoking: boolean
  /** Why the last stop-sharing failed, or `null`. */
  revokeError: string | null
  /** Clear a failed change or stop, so an old failure doesn't hang over the next try. */
  clearFailures: () => void
}

export type DashStatus = "ready" | "loading" | "error"

export interface DashboardData {
  /** The feedback's own state. */
  status: DashStatus
  /** The readers' own state — the two lists come from different queries and fail separately. */
  readersStatus: DashStatus
  link: DashLink
  /** Waiting on the author — the unresolved threads, newest activity first. */
  threads: DashThread[]
  /** Every thread, resolved ones included, newest activity first. */
  allThreads: DashThread[]
  readers: DashReader[]
  versions: DashVersion[]
  /** Resolve (or reopen) a thread; settles once the service has it. Layouts should go through
   *  `useHeldResolve` for the undo. */
  resolve: (id: string, resolved: boolean) => Promise<void>
  /** Answer a thread as the author; the reply shows up on the reader's copy. */
  reply: (thread: DashThread, body: string) => Promise<void>
  replying: boolean
}

export function usePageLabel() {
  const { t } = useLingui()
  return useCallback(
    (sectionId: string): string => {
      const at = sectionLocation(sectionId)
      if (at === null) return t`Somewhere in the book`
      return t`Page ${at.pageNumber} · Section ${at.sectionNumber}`
    },
    [t],
  )
}

export function locate(sectionId: string) {
  const parsed = parseSectionId(sectionId)
  const at = sectionLocation(sectionId)
  return {
    pageId: parsed?.pageId ?? null,
    pageNumber: at?.pageNumber ?? null,
    sectionNumber: at?.sectionNumber ?? null,
  }
}

/** The link as the live queries see it. `run` is the page's own publish run, shared so the
 *  in-progress run is followed once. */
export function useSharingLink(bookLabel: string, run: BookPublishRunController): DashLink {
  const { t } = useLingui()
  const status = useBookPublication(bookLabel)
  const book = useBook(bookLabel)
  const accessCode = useSetPublicationAccessCode(bookLabel)
  const expiry = useSetPublicationExpiry(bookLabel)
  const revoke = useRevokePublication(bookLabel)
  const record = status.data?.record ?? null
  const newest = [...(record?.versions ?? [])].sort((a, b) => b.version - a.version)[0] ?? null
  const published = newest?.content_revision ?? null
  const revision = status.data?.content_revision ?? null
  return {
    bookLabel,
    title: book.data?.title ?? bookLabel,
    url: status.data?.url ?? run.result?.url ?? "",
    liveVersion: status.data?.publication?.current_version ?? newest?.version ?? null,
    updatedAt: newest?.published_at ?? null,
    accessCode: status.data?.has_access_code === true ? (record?.access_code ?? null) : null,
    expiresAt: record?.expires_at ?? null,
    changesWaiting: revision === null || published === null ? null : revision > published,
    workerReachable: status.data?.worker_reachable ?? true,
    isUpdating: run.status === "running",
    update: run.update,
    hasAccessCode: status.data?.has_access_code === true,
    setAccessCode: (code, onDone) => {
      expiry.reset()
      accessCode.mutate(code, { onSuccess: () => onDone?.() })
    },
    accessBusy: accessCode.isPending,
    setExpiry: (iso) => {
      accessCode.reset()
      expiry.mutate(iso)
    },
    expiryBusy: expiry.isPending,
    changeFailed: accessCode.isError || expiry.isError,
    revoke: (onDone) => revoke.mutate(undefined, { onSuccess: () => onDone?.() }),
    revoking: revoke.isPending,
    revokeError: revoke.isError ? t`The link is still up. Check the connection and try again.` : null,
    clearFailures: () => {
      accessCode.reset()
      expiry.reset()
      revoke.reset()
    },
  }
}

/** The whole dashboard as the live queries see it. Nobody is "reading now": that needs the room. */
export function useSharingDashboardData(bookLabel: string, link: DashLink): DashboardData {
  const status = useBookPublication(bookLabel)
  const token = status.data?.record?.token ?? null
  const comments = usePublicationComments(bookLabel, true)
  const readers = usePublicationReaders(token ?? "", token !== null)
  const identity = useAuthorIdentity(PUBLISH_AUTHOR_DEFAULT_NAME)
  const resolveThread = useResolveThread(bookLabel, identity.authorName)
  const replyToThread = useReplyToThread(bookLabel, identity.authorName)
  const pageLabel = usePageLabel()
  const queryClient = useQueryClient()

  const allThreads = useMemo<DashThread[]>(() => {
    const all = buildThreads(comments.data?.comments ?? []).filter((thread) => thread.root.deleted_at === null)
    return filterThreads(all, { resolution: "all", pageSectionId: null })
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
      .map((thread) => {
        const replies = thread.replies.filter((reply) => reply.deleted_at === null)
        const last = replies[replies.length - 1] ?? null
        return {
          replies: replies.map((reply) => ({
            id: reply.id,
            authorName: reply.author_name,
            authorColor: reply.author_color,
            body: reply.body,
            createdAt: reply.created_at,
          })),
          resolved: thread.resolved,
          resolvedAt: thread.root.resolved_at,
          version: thread.version,
          anchor: thread.root.anchor,
          id: thread.root.id,
          pageSectionId: thread.pageSectionId,
          ...locate(thread.pageSectionId),
          pageLabel: pageLabel(thread.pageSectionId),
          authorName: thread.root.author_name,
          authorColor: thread.root.author_color,
          createdAt: thread.root.created_at,
          lastActivityAt: new Date(thread.lastActivityAt).toISOString(),
          body: thread.root.body,
          replyCount: thread.replyCount,
          lastReply: last
            ? { authorName: last.author_name, authorColor: last.author_color, body: last.body, createdAt: last.created_at }
            : null,
        }
      })
  }, [comments.data, pageLabel])
  const threads = useMemo(() => allThreads.filter((thread) => !thread.resolved), [allThreads])

  const record = status.data?.record ?? null
  return {
    status: queryStatus(comments),
    readersStatus: token === null ? "loading" : queryStatus(readers),
    link,
    threads,
    allThreads,
    readers: (readers.data?.readers ?? []).map((reader) => ({
      id: reader.id,
      name: reader.name,
      color: reader.color,
      joinedAt: reader.joined_at,
      commentCount: reader.comment_count,
      lastCommentAt: reader.last_comment_at,
    })),
    versions: [...(record?.versions ?? [])]
      .sort((a, b) => b.version - a.version)
      .map((entry) => ({ version: entry.version, publishedAt: entry.published_at, pageCount: entry.page_count })),
    resolve: async (id, resolved) => {
      await resolveThread.mutateAsync({ id, resolved })
      await queryClient.invalidateQueries({ queryKey: publicationCommentsKey(bookLabel) })
    },
    reply: async (thread, body) => {
      await replyToThread.mutateAsync({ parentId: thread.id, pageSectionId: thread.pageSectionId, body })
    },
    replying: replyToThread.isPending,
  }
}

/** A background refetch that fails keeps what was already shown; only a query that never
 *  answered is an error. */
function queryStatus(query: { isPending: boolean; isError: boolean; data: unknown }): DashStatus {
  if (query.data !== undefined) return "ready"
  if (query.isError) return "error"
  return query.isPending ? "loading" : "ready"
}
