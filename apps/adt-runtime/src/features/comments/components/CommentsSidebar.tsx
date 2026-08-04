import { useAtom, useAtomValue } from "jotai"
import { Check, X } from "lucide-react"
import { useEffect, useRef } from "react"
import { Switch } from "@/shared/ui/switch"
import { cn } from "@/shared/lib/utils"
import { readableTextColor } from "@/features/comments/lib/color"
import { relativeTime } from "@/features/comments/lib/relative-time"
import { snippet } from "@/features/comments/lib/summary"
import { repliesOf, type PublishComment } from "@/features/comments/lib/contract"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"
import {
  pageResolvedCountAtom,
  showResolvedAtom,
} from "@/features/comments/state/comments.atoms"

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
 * The page's threads as a list — and the keyboard path to every one of them.
 *
 * Deliberately *not* a modal sheet: the whole point of this panel is to act on
 * the page behind it (jump to a pin, drag one, watch a thread open where the
 * comment actually is), and a dialog's scrim and focus trap would take exactly
 * that away. It stays mounted and `inert` while closed so it can animate in and
 * out without leaving a focus stop or a screen-reader stop behind.
 *
 * It is also the home for page-level threads, which the overlay can only stack
 * in a corner.
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
  const resolvedCount = useAtomValue(pageResolvedCountAtom)
  const listRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  /**
   * Opening the panel moves focus into it — the first thread if there is one,
   * otherwise the close button. Without this a keyboard reviewer would have to
   * tab back through the whole dock to reach a list they just asked for; the
   * overlay hands focus back to the trigger on close.
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

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {roots.length === 0 ? (
          <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">
            {t("comments-empty-label")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {roots.map((comment, index) => {
              const replies = repliesOf(comments, comment.id)
              const resolved = comment.resolved_at !== null
              const selected = openThreadId === comment.id
              return (
                <li key={comment.id}>
                  <button
                    type="button"
                    aria-current={selected || undefined}
                    onClick={() => onSelect(comment)}
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
                        {anchoredIds.has(comment.id) ? null : (
                          <span className="rounded bg-muted px-1 py-px text-[0.6rem] font-medium text-muted-foreground">
                            {t("comments-page-level-label")}
                          </span>
                        )}
                      </span>

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
