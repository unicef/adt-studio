import { useCallback, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  api,
  type PublicationPageManifest,
  type PublishCommentListResponse,
  type PublishCommentResponse,
} from "@/api/client"

/**
 * The Feedback view's data plumbing. Every read and write goes through the author proxies in
 * `apps/api`, so the browser never holds `MGMT_SECRET`.
 */

export const publicationCommentsKey = (label: string) =>
  ["books", label, "publication", "comments"] as const

export const publicationPagesKey = (label: string) =>
  ["books", label, "publication", "pages"] as const

/**
 * One query serves the panel, the pins and the sidebar badge: resolved threads are fetched
 * too and filtered in the client, so toggling "show resolved" is instant and the badge never
 * disagrees with the list it sits above.
 */
export function usePublicationComments(label: string, enabled: boolean) {
  return useQuery<PublishCommentListResponse>({
    queryKey: publicationCommentsKey(label),
    queryFn: () => api.getPublicationComments(label, { includeResolved: true }),
    enabled,
    retry: false,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  })
}

export function usePublicationPages(label: string, enabled: boolean) {
  return useQuery<PublicationPageManifest>({
    queryKey: publicationPagesKey(label),
    queryFn: () => api.getPublicationPages(label),
    enabled,
    retry: false,
    staleTime: 60_000,
  })
}

export interface ReplyInput {
  parentId: string
  pageSectionId: string
  body: string
}

export function useReplyToThread(label: string, authorName: string | null) {
  const queryClient = useQueryClient()
  return useMutation<PublishCommentResponse, Error, ReplyInput>({
    mutationFn: (input) =>
      api.createPublicationComment(
        label,
        { pageSectionId: input.pageSectionId, body: input.body, parentId: input.parentId },
        authorName,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publicationCommentsKey(label) })
    },
  })
}

export interface ResolveInput {
  id: string
  resolved: boolean
}

export function useResolveThread(label: string, authorName: string | null) {
  const queryClient = useQueryClient()
  return useMutation<PublishCommentResponse, Error, ResolveInput>({
    mutationFn: (input) =>
      api.resolvePublicationComment(label, input.id, input.resolved, authorName),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publicationCommentsKey(label) })
    },
  })
}

export interface EditInput {
  id: string
  body: string
}

export function useEditOwnComment(label: string, authorName: string | null) {
  const queryClient = useQueryClient()
  return useMutation<PublishCommentResponse, Error, EditInput>({
    mutationFn: (input) => api.updatePublicationComment(label, input.id, input.body, authorName),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publicationCommentsKey(label) })
    },
  })
}

export function useDeleteOwnComment(label: string, authorName: string | null) {
  const queryClient = useQueryClient()
  return useMutation<PublishCommentResponse, Error, string>({
    mutationFn: (id) => api.deletePublicationComment(label, id, authorName),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: publicationCommentsKey(label) })
    },
  })
}

const AUTHOR_NAME_STORAGE_KEY = "adt-studio-publish-author-name"

const AUTHOR_NAME_PROMPTED_KEY = "adt-studio-publish-author-name-prompted"

export const AUTHOR_NAME_MAX_LENGTH = 60

function readStored(key: string): string {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}

function writeStored(key: string, value: string): void {
  if (typeof window === "undefined") return
  try {
    if (value.length > 0) window.localStorage.setItem(key, value)
    else window.localStorage.removeItem(key)
  } catch {
    /* a Studio in private mode still has to work, just without remembering */
  }
}

export interface AuthorIdentity {
  /** What the header carries, or `null` to let the worker's default `"Author"` stand. */
  authorName: string | null
  /** Never empty — what the UI shows beside a reply. */
  displayName: string
  setAuthorName: (next: string) => void
  /** True until the author has been shown the "you are replying as…" prompt once. */
  needsNamePrompt: boolean
  dismissNamePrompt: () => void
}

/**
 * The author's display name, persisted studio-side like the other Studio preferences. The
 * worker defaults it to `"Author"` (§4.10) and renames every past author comment when a name
 * arrives, so there is nothing to migrate — the header is the whole mechanism.
 */
export function useAuthorIdentity(defaultDisplayName: string): AuthorIdentity {
  const [stored, setStored] = useState(() => readStored(AUTHOR_NAME_STORAGE_KEY))
  const [prompted, setPrompted] = useState(
    () => readStored(AUTHOR_NAME_PROMPTED_KEY).length > 0,
  )

  const setAuthorName = useCallback((next: string) => {
    const trimmed = next.trim().slice(0, AUTHOR_NAME_MAX_LENGTH)
    setStored(trimmed)
    writeStored(AUTHOR_NAME_STORAGE_KEY, trimmed)
  }, [])

  const dismissNamePrompt = useCallback(() => {
    setPrompted(true)
    writeStored(AUTHOR_NAME_PROMPTED_KEY, "1")
  }, [])

  return {
    authorName: stored.length === 0 ? null : stored,
    displayName: stored.length === 0 ? defaultDisplayName : stored,
    setAuthorName,
    needsNamePrompt: !prompted,
    dismissNamePrompt,
  }
}
