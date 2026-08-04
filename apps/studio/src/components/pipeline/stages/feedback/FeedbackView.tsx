import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import {
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Link2Off,
  MessagesSquare,
  Share2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { prefersReducedMotion } from "@/lib/utils"
import { LoadingState } from "@/components/pipeline/components/LoadingState"
import { StageEmptyState } from "@/components/pipeline/components/StageEmptyState"
import { useStepHeader } from "@/components/pipeline/components/StepViewRouter"
import { getPublicationPreviewUrl } from "@/api/client"
import { publicationLifecycle, useBookPublication } from "@/hooks/use-book-publication"
import {
  useAuthorIdentity,
  useDeleteOwnComment,
  useEditOwnComment,
  usePublicationComments,
  usePublicationPages,
  useReplyToThread,
  useResolveThread,
} from "@/hooks/use-publication-feedback"
import { FeedbackFrame } from "./FeedbackFrame"
import { useFeedbackRoom } from "./use-feedback-room"
import { ThreadsPanel } from "./ThreadsPanel"
import {
  buildThreads,
  filterThreads,
  firstPageWithFeedback,
  groupThreadsByPage,
  pinNumbers as computePinNumbers,
  unresolvedThreadCount,
  type ThreadFilters,
} from "./lib/threads"

/**
 * The author's half of the feedback loop: the published snapshot in a same-origin iframe with
 * a pin overlay drawn on top of it, beside a threads panel that is the only place in the
 * product where a thread can be resolved.
 *
 * The framed book is the *publication*, proxied through `apps/api` — not a fresh local
 * package. A reviewer's pin refers to the DOM they were looking at, so anything else would
 * put pins on a page that never existed.
 */
export function FeedbackView({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const navigate = useNavigate()
  const { headerSlotEl } = useStepHeader()
  const { data: status, isLoading: statusLoading } = useBookPublication(bookLabel)

  const record = status?.record ?? null
  const hasPublication = record !== null
  const feedbackEnabled = hasPublication && (status?.connected ?? false)

  const comments = usePublicationComments(bookLabel, feedbackEnabled)
  const pages = usePublicationPages(bookLabel, feedbackEnabled)

  const identity = useAuthorIdentity(t`Author`)
  const reply = useReplyToThread(bookLabel, identity.authorName)
  const resolve = useResolveThread(bookLabel, identity.authorName)
  const edit = useEditOwnComment(bookLabel, identity.authorName)
  const remove = useDeleteOwnComment(bookLabel, identity.authorName)

  const [filters, setFilters] = useState<ThreadFilters>({
    resolution: "unresolved",
    pageSectionId: null,
  })
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [flashToken, setFlashToken] = useState(0)
  const [frameHref, setFrameHref] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState<{
    sectionId: string | null
    href: string | null
  }>({ sectionId: null, href: null })
  const [missingPins, setMissingPins] = useState<Set<string>>(new Set())
  const [announcement, setAnnouncement] = useState("")
  const [repliedOnce, setRepliedOnce] = useState(false)
  const [busyThreadId, setBusyThreadId] = useState<string | null>(null)

  const pageEntries = pages.data?.pages ?? []
  const currentVersion = pages.data?.current_version ?? record?.versions.at(-1)?.version ?? 1
  const allComments = comments.data?.comments ?? []
  const authorSessionId = comments.data?.session?.id ?? null

  const threads = useMemo(() => buildThreads(allComments), [allComments])
  const pinNumbers = useMemo(() => computePinNumbers(threads), [threads])
  const unresolved = useMemo(() => unresolvedThreadCount(allComments), [allComments])

  const visibleThreads = useMemo(() => filterThreads(threads, filters), [threads, filters])
  const groups = useMemo(
    () => groupThreadsByPage(visibleThreads, pageEntries),
    [visibleThreads, pageEntries],
  )

  const openingHref = useMemo(
    () => firstPageWithFeedback(threads, pageEntries)?.href ?? pageEntries[0]?.href ?? null,
    [pageEntries, threads],
  )
  useEffect(() => {
    if (openingHref === null) return
    setFrameHref((current) => current ?? openingHref)
  }, [openingHref])

  const pageIndex = pageEntries.findIndex(
    (page) => page.section_id === currentPage.sectionId || page.href === currentPage.href,
  )
  const currentPageEntry = pageIndex >= 0 ? pageEntries[pageIndex] : undefined
  const currentPageSectionId = currentPageEntry?.section_id ?? currentPage.sectionId
  const currentPageLabel =
    currentPageEntry?.page_number === undefined
      ? null
      : t`Page ${currentPageEntry.page_number}`

  /** A page filter pinned to a page the reader has since left would silently hide every
   *  thread, so it follows the frame. */
  useEffect(() => {
    setFilters((current) =>
      current.pageSectionId === null || currentPageSectionId === null
        ? current
        : { ...current, pageSectionId: currentPageSectionId },
    )
  }, [currentPageSectionId])

  const threadsOnFramedPage = useMemo(
    () =>
      currentPageSectionId === null
        ? []
        : visibleThreads.filter((thread) => thread.pageSectionId === currentPageSectionId),
    [visibleThreads, currentPageSectionId],
  )

  const reducedMotion = prefersReducedMotion()

  /** The author joins the room as soon as there is a publication to join, not only once the
   *  frame has settled: presence is about who is *here*, and a reader who arrives while the
   *  snapshot is still loading is exactly the reader worth knowing about. */
  const room = useFeedbackRoom(bookLabel, feedbackEnabled, currentPageSectionId)
  const liveCursors = room.cursorsFor(currentPageSectionId)

  const selectThread = useCallback(
    (threadId: string) => {
      setSelectedThreadId((current) => (current === threadId ? null : threadId))
      const thread = threads.find((candidate) => candidate.root.id === threadId)
      if (!thread) return
      const target = pageEntries.find((page) => page.section_id === thread.pageSectionId)
      if (target && target.href !== frameHref) setFrameHref(target.href)
      setFlashToken((token) => token + 1)
    },
    [frameHref, pageEntries, threads],
  )

  const onUnresolvableChange = useCallback((ids: string[]) => {
    setMissingPins(new Set(ids))
  }, [])

  const navigateFrame = (delta: number) => {
    const next = pageEntries[(pageIndex === -1 ? 0 : pageIndex) + delta]
    if (!next) return
    setFrameHref(next.href)
  }

  const onReply = async (threadId: string, pageSectionId: string, body: string) => {
    setBusyThreadId(threadId)
    try {
      await reply.mutateAsync({ parentId: threadId, pageSectionId, body })
      setRepliedOnce(true)
      setAnnouncement(t`Reply posted as ${identity.displayName}`)
    } catch (error) {
      setAnnouncement(errorMessage(error, t`Your reply could not be posted`))
    } finally {
      setBusyThreadId(null)
    }
  }

  const onResolve = async (threadId: string, resolved: boolean) => {
    setBusyThreadId(threadId)
    try {
      await resolve.mutateAsync({ id: threadId, resolved })
      setAnnouncement(resolved ? t`Thread resolved` : t`Thread reopened`)
    } catch (error) {
      setAnnouncement(errorMessage(error, t`That thread could not be updated`))
    } finally {
      setBusyThreadId(null)
    }
  }

  const onEdit = async (commentId: string, body: string) => {
    try {
      await edit.mutateAsync({ id: commentId, body })
      setAnnouncement(t`Comment updated`)
    } catch (error) {
      setAnnouncement(errorMessage(error, t`That comment could not be edited`))
    }
  }

  const onDelete = async (commentId: string) => {
    try {
      await remove.mutateAsync(commentId)
      setAnnouncement(t`Comment deleted`)
    } catch (error) {
      setAnnouncement(errorMessage(error, t`That comment could not be deleted`))
    }
  }

  const goToShare = () =>
    void navigate({
      to: "/books/$label/$step",
      params: { label: bookLabel, step: "export" },
      search: {},
    })

  if (statusLoading) {
    return <LoadingState label={<Trans>Loading feedback...</Trans>} />
  }

  if (!hasPublication) {
    return (
      <StageEmptyState
        icon={MessagesSquare}
        color="violet"
        title={<Trans>No feedback yet — this book has not been shared</Trans>}
        subtitle={
          <Trans>
            Publish it with Share online, send the link to your reviewers, and their comments
            land here.
          </Trans>
        }
        cta={
          <Button type="button" size="sm" className="gap-2" onClick={goToShare}>
            <Share2 className="h-3.5 w-3.5" aria-hidden />
            <Trans>Go to Share online</Trans>
          </Button>
        }
      />
    )
  }

  if (!status?.connected) {
    return (
      <StageEmptyState
        icon={CloudOff}
        color="amber"
        title={<Trans>Connect your Cloudflare account to read this feedback</Trans>}
        subtitle={
          <Trans>The comments live on your own worker, so the Studio needs that connection.</Trans>
        }
        cta={
          <Button type="button" size="sm" variant="outline" onClick={goToShare}>
            <Trans>Open Share online</Trans>
          </Button>
        }
      />
    )
  }

  const lifecycle = publicationLifecycle(status)
  const workerDown = status.worker_reachable === false || comments.isError

  return (
    <div className="flex h-full min-h-0 flex-col">
      {headerSlotEl && pageEntries.length > 0
        ? createPortal(
            <div className="ml-auto flex items-center gap-1 text-xs">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-white/80 hover:bg-white/20 hover:text-white"
                disabled={pageIndex <= 0}
                onClick={() => navigateFrame(-1)}
                aria-label={t`Previous page`}
                title={t`Previous page`}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <span className="tabular-nums">
                {pageIndex >= 0
                  ? t`${pageIndex + 1} of ${pageEntries.length}`
                  : t`${pageEntries.length} pages`}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-white/80 hover:bg-white/20 hover:text-white"
                disabled={pageIndex === -1 || pageIndex >= pageEntries.length - 1}
                onClick={() => navigateFrame(1)}
                aria-label={t`Next page`}
                title={t`Next page`}
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <span className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
                {t`v${currentVersion}`}
              </span>
            </div>,
            headerSlotEl,
          )
        : null}

      {lifecycle === "revoked" ? (
        <Banner
          tone="amber"
          icon={<Link2Off className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          action={
            <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={goToShare}>
              <Trans>Resume sharing</Trans>
            </Button>
          }
        >
          <Trans>
            This link is off, so reviewers cannot open the book. The feedback they already left
            is still here, and you can still reply and resolve.
          </Trans>
        </Banner>
      ) : null}

      {workerDown ? (
        <Banner
          tone="red"
          icon={<CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              onClick={() => void comments.refetch()}
            >
              <Trans>Try again</Trans>
            </Button>
          }
        >
          <Trans>
            Your publish worker cannot be reached, so this is not showing current feedback.
          </Trans>
        </Banner>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {frameHref === null && !pages.isLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted/20 px-6 text-center text-xs text-muted-foreground">
            <CloudOff className="h-5 w-5" aria-hidden />
            <p>
              <Trans>
                The published book could not be loaded, so there is nothing to pin comments on.
              </Trans>
            </p>
          </div>
        ) : frameHref === null || comments.isLoading || pages.isLoading ? (
          <div className="flex flex-1 items-center justify-center bg-muted/20">
            <LoadingState label={<Trans>Loading the published book...</Trans>} />
          </div>
        ) : (
          <FeedbackFrame
            src={getPublicationPreviewUrl(bookLabel, frameHref)}
            threads={threadsOnFramedPage}
            pinNumbers={pinNumbers}
            selectedThreadId={selectedThreadId}
            flashToken={flashToken}
            onSelectThread={selectThread}
            onPageChange={setCurrentPage}
            onUnresolvableChange={onUnresolvableChange}
            reducedMotion={reducedMotion}
            cursors={liveCursors}
          />
        )}

        <ThreadsPanel
          groups={groups}
          pinNumbers={pinNumbers}
          currentVersion={currentVersion}
          unresolvedCount={unresolved}
          totalCount={threads.length}
          countKnown={comments.data !== undefined}
          missingPins={missingPins}
          filters={filters}
          onFiltersChange={setFilters}
          currentPageSectionId={currentPageSectionId}
          currentPageLabel={currentPageLabel}
          selectedThreadId={selectedThreadId}
          onSelectThread={selectThread}
          authorSessionId={authorSessionId}
          identity={identity}
          showNamePrompt={repliedOnce}
          announcement={announcement}
          isRefreshing={comments.isFetching}
          onRefresh={() => {
            void comments.refetch()
            void pages.refetch()
          }}
          onReply={onReply}
          onResolve={onResolve}
          onEdit={onEdit}
          onDelete={onDelete}
          busyThreadId={busyThreadId}
          onOpenShare={goToShare}
          livePeers={room.peers}
        />
      </div>
    </div>
  )
}

function Banner({
  tone,
  icon,
  children,
  action,
}: {
  tone: "amber" | "red"
  icon: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  const classes =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-red-200 bg-red-50 text-red-900"
  return (
    <div
      className={`flex items-center gap-2 border-b px-3 py-2 text-xs duration-200 animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none ${classes}`}
    >
      {icon}
      <p className="flex-1">{children}</p>
      {action}
    </div>
  )
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0 ? error.message : fallback
}
