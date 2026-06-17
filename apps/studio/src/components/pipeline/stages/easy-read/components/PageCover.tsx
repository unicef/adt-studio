import { useEffect, useRef, useState } from "react"
import { FileText } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { usePageImage } from "@/hooks/use-pages"

/** Small lazily-loaded page rendering used to distinguish pages at a glance.
 * When `onClick` is provided it becomes a button that opens a full-size view. */
export function PageCover({
  bookLabel,
  pageId,
  onClick,
}: {
  bookLabel: string
  pageId: string
  onClick?: () => void
}) {
  const { t } = useLingui()
  const [requested, setRequested] = useState(false)
  const ref = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (requested) return
    if (typeof IntersectionObserver === "undefined") {
      setRequested(true)
      return
    }
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRequested(true)
          observer.disconnect()
        }
      },
      { rootMargin: "300px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [requested])

  const { data } = usePageImage(bookLabel, pageId, { enabled: requested })
  const src = data?.imageBase64 ? `data:image/png;base64,${data.imageBase64}` : null

  const inner = src ? (
    <img src={src} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
      <FileText className="h-4 w-4" />
    </div>
  )

  const boxClass =
    "h-14 w-10 shrink-0 overflow-hidden rounded-md border border-border/70 bg-muted/40 shadow-sm"

  if (onClick) {
    return (
      <button
        ref={(el) => {
          ref.current = el
        }}
        type="button"
        onClick={onClick}
        title={t`View page`}
        className={`${boxClass} cursor-pointer transition-all hover:border-fuchsia-300 hover:ring-2 hover:ring-fuchsia-200`}
      >
        {inner}
      </button>
    )
  }

  return (
    <div
      ref={(el) => {
        ref.current = el
      }}
      className={boxClass}
    >
      {inner}
    </div>
  )
}
