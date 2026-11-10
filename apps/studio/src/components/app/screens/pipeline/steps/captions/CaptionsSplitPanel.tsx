import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowRight, X } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { usePage } from "@/hooks/use-pages"
import { cn } from "@/lib/utils"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { HEADER_BUTTON, HEADER_BUTTON_ICON, HEADER_BUTTON_LABELLED } from "../shared/headerButton"
import { PageLoadError, PageRefreshFailed } from "../shared/page-detail/PageNotices"
import { CaptionList } from "./CaptionList"
import { CaptionsVersionPicker } from "./CaptionsVersionPicker"
import { useCaptionEdits } from "./useCaptionEdits"
import type { ItemFilter } from "./useCaptionFilters"

const DOCK_CLEARANCE = 132
const MIN_PANEL_HEIGHT = 260

const PICKER_TRIGGER = cn("h-6 gap-1 rounded-md border bg-card px-1.5 text-[11.5px]! font-semibold! text-foreground hover:bg-muted")

export function CaptionsSplitPanel({
  label,
  page,
  hex,
  locked,
  filter,
  query,
  onOpenPage,
  onClose,
}: {
  label: string
  page: PipelinePage
  hex: string
  locked: boolean
  filter: ItemFilter
  query: string
  onOpenPage: (pageId: string) => void
  onClose: () => void
}) {
  const { t } = useLingui()
  const detailQuery = usePage(label, page.pageId)
  const detail = detailQuery.data
  const edits = useCaptionEdits(label, page.pageId, detail, locked, undefined, hex)
  const version = detail?.versions.imageCaptioning ?? null
  const panel = useRef<HTMLElement>(null)
  const [maxHeight, setMaxHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      const node = panel.current
      if (!node) return
      const top = Math.max(0, node.getBoundingClientRect().top)
      setMaxHeight(Math.max(MIN_PANEL_HEIGHT, Math.round(window.innerHeight - top - DOCK_CLEARANCE)))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener("scroll", schedule, { capture: true, passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true })
      window.removeEventListener("resize", schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return
      if (event.target instanceof Element && event.target.closest("[role=dialog], textarea, input")) return
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <aside
      ref={panel}
      key={page.pageId}
      style={maxHeight != null ? { maxHeight } : undefined}
      aria-label={t`Page ${page.pageNumber} descriptions`}
      className="sticky top-[68px] flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm animate-in fade-in slide-in-from-right-3 duration-300 motion-reduce:animate-none"
    >
      <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5">
        <PageThumb label={label} pageId={page.pageId} sectionIndex={null} className="h-12 w-9" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-semibold text-foreground">
            <Trans>Page {page.pageNumber}</Trans>
          </span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {t`${plural(page.captionCount, { one: "# image", other: "# images" })}`}
          </span>
        </div>
        {detail?.imageCaptioning && (
          <CaptionsVersionPicker
            label={label}
            pageId={page.pageId}
            currentVersion={version}
            saving={edits.saving}
            dirty={edits.dirty}
            onRestored={edits.discard}
            triggerClassName={PICKER_TRIGGER}
            triggerLabel={version != null ? t`Description version ${version}. Change version` : undefined}
          />
        )}
        <button type="button" onClick={() => onOpenPage(page.pageId)} className={cn(HEADER_BUTTON, HEADER_BUTTON_LABELLED, "pl-3 text-foreground")}>
          <Trans>Open page</Trans>
          <ArrowRight aria-hidden className="size-3.5" />
        </button>
        <button type="button" onClick={onClose} aria-label={t`Close`} title={t`Close`} className={cn(HEADER_BUTTON, HEADER_BUTTON_ICON)}>
          <X className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]">
        {detail ? (
          <div className="flex flex-col gap-3">
            {detailQuery.isError && <PageRefreshFailed pageNumber={page.pageNumber} hex={hex} onRetry={() => void detailQuery.refetch()} />}
            <CaptionList label={label} page={detail} hex={hex} edits={edits} locked={locked} initialFilter={filter} query={query} />
          </div>
        ) : detailQuery.isError ? (
          <PageLoadError pageNumber={page.pageNumber} onRetry={() => void detailQuery.refetch()} />
        ) : (
          <div aria-hidden className="flex flex-col gap-3">
            {[0, 1].map((index) => (
              <div key={index} className="h-56 rounded-xl border bg-muted/30 motion-safe:animate-pulse" />
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
