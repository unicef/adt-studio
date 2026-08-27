import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { Check, X } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { Switch } from "@/shared/ui/switch"
import { cn } from "@/shared/lib/utils"
import { readableTextColor } from "@/features/comments/lib/color"
import { hrefForSection, pageLabelForSection } from "@/features/comments/lib/follow"
import { relativeTime } from "@/features/comments/lib/relative-time"
import { snippet } from "@/features/comments/lib/summary"
import { repliesOf, rootComments, type PublishComment } from "@/features/comments/lib/contract"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import { PresencePeerList } from "@/features/comments/components/PresencePeerList"
import {
  bookCommentsAtom,
  commentScopeAtom,
  pageResolvedCountAtom,
  showResolvedAtom,
  type CommentScope,
} from "@/features/comments/state/comments.atoms"
import { followedPeerAtom, pendingThreadIdAtom } from "@/features/comments/state/follow.atoms"
import { otherPeersAtom } from "@/features/comments/state/presence.atoms"
import { currentSectionIdAtom, pagesAtom, tocAtom } from "@/features/navigation/state/nav.atoms"

export interface CommentsSidebarProps {
  open: boolean
  roots: PublishComment[]
  comments: PublishComment[]
  /** Roots whose anchor currently resolves — the rest are page-level. */
  anchoredIds: Set<string>
  openThreadId: string | null
  onSelect: (comment: PublishComment) => void
  onClose: () => void
}

/**
 * The book's threads as a list — and the keyboard path to every one of them.
 *
 * Deliberately *not* a modal sheet: the whole point of this panel is to act on the page behind
 * it (jump to a pin, drag one, watch a thread open where the comment actually is), and a
 * dialog's scrim and focus trap would take exactly that away. It stays mounted and `inert` while
 * closed so it can animate in and out without leaving a focus stop behind.
 *
 * It is also the home for page-level threads, which the overlay can only stack in a corner, and
 * for the roster: who is reading belongs beside the feedback, not only in a floating chip.
 */
export function CommentsSidebar({
  open,
  roots,
  comments,
  anchoredIds,
  openThreadId,
  onSelect,
  onClose,
}: CommentsSidebarProps) {
  const { t } = useCommentsText()
  const [showResolved, setShowResolved] = useAtom(showResolvedAtom)
  const [scope, setScope] = useAtom(commentScopeAtom)
  const resolvedCount = useAtomValue(pageResolvedCountAtom)
  const bookComments = useAtomValue(bookCommentsAtom)
  const peers = useAtomValue(otherPeersAtom)
  const pages = useAtomValue(pagesAtom)
  const toc = useAtomValue(tocAtom)
  const currentSectionId = useAtomValue(currentSectionIdAtom)
  const setPendingThread = useSetAtom(pendingThreadIdAtom)
  const stopFollowing = useSetAtom(followedPeerAtom)
  const listRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const whole = (scope as CommentScope) === "book"
  const bookRoots = useMemo(() => rootComments(bookComments), [bookComments])
  const shown = whole ? bookRoots : roots
  const threadSource = whole ? bookComments : comments

  const labels = {
    unknown: t("comments-presence-unknown-page-label"),
    page: (number: number) => t("comments-presence-page-label", { number: String(number) }),
  }

  /**
   * Opening the panel moves focus into it — the first thread if there is one, otherwise the
   * close button. Without this a keyboard reviewer would have to tab back through the whole
   * dock to reach a list they just asked for.
   */
  const wasOpen = useRef(false)
  useEffect(() => {
    const opening = open && !wasOpen.current
    wasOpen.current = open
    if (!opening) return
    const first = listRef.current?.querySelector<HTMLElement>("ul button")
    ;(first ?? closeRef.current)?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (!listRef.current?.contains(document.activeElement)) return
      event.stopPropagation()
      onClose()
    }
    const node = listRef.current
    node?.addEventListener("keydown", onKeyDown)
    return () => node?.removeEventListener("keydown", onKeyDown)
  }, [onClose, open])

  /**
   * A comment on another page is a navigation, not a scroll: every page here is its own
   * document. The thread id is handed to the next document through session storage so it opens
   * on arrival — otherwise the reader lands on the right page with no idea which comment they
   * asked for.
   */
  function openComment(comment: PublishComment): void {
    /** Going to a comment is going somewhere of your own choosing, so it ends a follow — being
     *  yanked back to somebody else's page mid-read would make the list unusable. */
    stopFollowing(null)
    if (comment.page_section_id === currentSectionId) {
      onSelect(comment)
      return
    }
    const href = hrefForSection(comment.page_section_id, pages)
    if (href === null) return
    setPendingThread(comment.id)
    window.location.href = href
  }

  return (
    <aside
      ref={listRef}
      role="complementary"
      aria-label={t("comments-list-label")}
      aria-hidden={!open}
      inert={!open ? true : undefined}
      data-comments-sidebar=""
      className={cn(
        // Stops above the dock rather than covering it: the reader's other tools
        // — and the button that opened this panel — must stay reachable.
        "fixed right-0 top-0 bottom-[var(--dock-height,5rem)] z-50 flex w-80 max-w-[85vw] flex-col",
        "border-l border-border bg-popover/97 text-popover-foreground shadow-xl backdrop-blur-md",
        "transition-transform duration-250 ease-out motion-reduce:transition-none",
        open ? "translate-x-0" : "pointer-events-none translate-x-full",
      )}
    >
      <header className="flex flex-col gap-2.5 border-b border-border px-3.5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold">{t("comments-list-label")}</h2>
          <button
            ref={closeRef}
            type="button"
            aria-label={t("comments-list-close-label")}
            onClick={onClose}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground",
              "transition-colors hover:bg-muted hover:text-foreground focus:outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
            )}
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>

        <div role="tablist" className="flex gap-1 rounded-lg bg-muted/60 p-0.5">
          {(
            [
              { value: "page", label: t("comments-scope-page-label"), count: roots.length },
              { value: "book", label: t("comments-scope-book-label"), count: bookRoots.length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={scope === tab.value}
              onClick={() => setScope(tab.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
                "transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "motion-reduce:transition-none",
                scope === tab.value
                  ? "bg-popover text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.count > 0 ? (
                <span className="rounded-full bg-muted px-1.5 text-[0.6rem] font-bold leading-4">
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={showResolved as boolean}
            onCheckedChange={(checked) => setShowResolved(checked)}
          />
          <span className="flex-1">{t("comments-show-resolved-label")}</span>
          {showResolved && resolvedCount > 0 ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium">
              {resolvedCount === 1
                ? t("comments-one-resolved-label")
                : t("comments-resolved-hidden-label", { count: String(resolvedCount) })}
            </span>
          ) : null}
        </label>
      </header>

      {peers.length > 0 ? (
        <section className="border-b border-border py-1.5">
          <h3 className="px-3.5 pb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("comments-reading-now-label")}
          </h3>
          <div className="max-h-40 overflow-y-auto">
            <PresencePeerList />
          </div>
        </section>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {shown.length === 0 ? (
          <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">
            {whole ? t("comments-book-empty-label") : t("comments-empty-label")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {shown.map((comment, index) => {
              const replies = repliesOf(threadSource, comment.id)
              const resolved = comment.resolved_at !== null
              const selected = openThreadId === comment.id
              const elsewhere = comment.page_section_id !== currentSectionId
              return (
                <li key={comment.id}>
                  <button
                    type="button"
                    aria-current={selected || undefined}
                    onClick={() => openComment(comment)}
                    className={cn(
                      "group/item flex w-full gap-2 rounded-lg p-2 text-left",
                      "transition-colors duration-150 hover:bg-muted focus:outline-none",
                      "focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                      selected && "bg-muted ring-1 ring-border",
                      resolved && "opacity-70",
                    )}
                  >
                    <span
                      aria-hidden
                      style={{
                        backgroundColor: comment.author_color,
                        color: readableTextColor(comment.author_color),
                      }}
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center",
                        "rounded-full rounded-bl-none text-[0.6rem] font-bold leading-none",
                        resolved && "opacity-60 saturate-50",
                      )}
                    >
                      {resolved ? <Check className="h-3 w-3 stroke-[3]" /> : index + 1}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-xs font-semibold">{comment.author_name}</span>
                        <span className="text-[0.65rem] text-muted-foreground">
                          {relativeTime(comment.created_at, t)}
                        </span>
                        {!elsewhere && !anchoredIds.has(comment.id) ? (
                          <span className="rounded bg-muted px-1 py-px text-[0.6rem] font-medium text-muted-foreground">
                            {t("comments-page-level-label")}
                          </span>
                        ) : null}
                      </span>

                      {/* Which page a thread is on only needs saying when it is not this one —
                          on the page tab every row would carry the same label. */}
                      {elsewhere ? (
                        <span className="mt-0.5 block truncate text-[0.65rem] font-medium text-muted-foreground">
                          {pageLabelForSection(comment.page_section_id, pages, toc, labels)}
                        </span>
                      ) : null}

                      <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-foreground/85">
                        {snippet(comment.body)}
                      </span>

                      {replies.length > 0 ? (
                        <span className="mt-1 block text-[0.65rem] font-medium text-muted-foreground">
                          {replies.length === 1
                            ? t("comments-one-reply-label")
                            : t("comments-replies-label", { count: String(replies.length) })}
                        </span>
                      ) : null}

                      {resolved ? (
                        <span className="mt-1 flex items-center gap-1 text-[0.65rem] font-medium text-muted-foreground">
                          <Check aria-hidden className="h-3 w-3" />
                          {t("comments-resolved-label")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
