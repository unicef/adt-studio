import { X } from "lucide-react"
import { useEffect, useLayoutEffect, useState, type RefObject } from "react"
import { createPortal } from "react-dom"
import { getChromePortalContainer } from "@/shared/lib/chrome-portal"
import { useCommentsText } from "@/features/comments/hooks/useCommentsText"

const SHOW_AFTER_MS = 1200

function storageKey(apiBase: string): string {
  return `adt-comments-hint-seen:${apiBase}`
}

export function hintSeen(apiBase: string): boolean {
  try {
    return window.localStorage.getItem(storageKey(apiBase)) === "1"
  } catch {
    return true
  }
}

export function markHintSeen(apiBase: string): void {
  try {
    window.localStorage.setItem(storageKey(apiBase), "1")
  } catch {
    /* private-mode storage refusal: the hint simply comes back next time */
  }
}

/**
 * The one time a reader is told they can comment.
 *
 * Nothing else on the page says so: the comment tool is an icon among the reader's other tools,
 * and someone who opened a link to *read* a book has no reason to guess it takes notes. So the
 * first visit to a shared book points at the button — once, after the page has settled, and
 * gone for good the moment it is dismissed or the tool is used. Per book, because a reader sent
 * two books should hear it for each.
 */
export function CommentsHint({
  apiBase,
  anchor,
  side,
  onDismiss,
}: {
  apiBase: string
  /** The button it points at. The dock clips its own contents, so the hint is drawn in the
   *  chrome's portal layer — where its styles still apply — and placed from the button's box. */
  anchor: RefObject<HTMLElement | null>
  side: "top" | "bottom"
  onDismiss: () => void
}) {
  const { t } = useCommentsText()
  const [shown, setShown] = useState(false)
  const [box, setBox] = useState<DOMRect | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setShown(true), SHOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  useLayoutEffect(() => {
    if (!shown) return
    const measure = () => setBox(anchor.current?.getBoundingClientRect() ?? null)
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [shown, anchor])

  const container = typeof document === "undefined" ? null : getChromePortalContainer()
  if (!shown || !box || !container) return null

  /** A dock along the bottom opens the hint upwards, one along the top opens it downwards. */
  const above = side !== "bottom"
  const right = Math.max(8, window.innerWidth - box.right - 4)
  const place = above
    ? { bottom: window.innerHeight - box.top + 12, right }
    : { top: box.bottom + 12, right }

  return createPortal(
    <div
      role="status"
      data-comments-hint=""
      style={{ position: "fixed", ...place }}
      className={
        "z-[60] w-64 rounded-xl bg-popover p-3.5 pr-9 text-left text-popover-foreground shadow-xl ring-1 ring-black/10 duration-300 animate-in fade-in-0 motion-reduce:animate-none " +
        (above ? "slide-in-from-bottom-2" : "slide-in-from-top-2")
      }
    >
      <p className="text-sm font-semibold leading-5">{t("comments-hint-title")}</p>
      <p className="mt-1 text-[0.8125rem] leading-5 text-muted-foreground">{t("comments-hint-body")}</p>
      <button
        type="button"
        aria-label={t("comments-hint-dismiss-label")}
        onClick={() => {
          markHintSeen(apiBase)
          onDismiss()
        }}
        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>,
    container,
  )
}
