import { memo } from "react"
import { plural } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import { Layers, Sparkles } from "lucide-react"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { CANVAS_GAP, useCanvasFit } from "../landing/book-canvas/useCanvasFit"

export type SectioningWallMode = "dynamic" | "page"

export interface WallPage {
  pageId: string
  pageNumber: number
  pageWidth?: number | null
  pageHeight?: number | null
}

const SHEET = "relative overflow-hidden rounded-lg bg-card shadow-[0_8px_24px_-14px_rgba(15,23,42,0.4)] ring-1 ring-black/5 dark:ring-white/10"

function ModeBadge({ mode, hex }: { mode: SectioningWallMode; hex: string }) {
  const { t } = useLingui()
  const Icon = mode === "page" ? Layers : Sparkles
  return (
    <span
      key={mode}
      className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-full bg-card/95 px-1.5 py-0.5 text-[10.5px] font-semibold text-foreground shadow-sm ring-1 ring-black/5 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none dark:ring-white/10"
    >
      <Icon className="size-3" strokeWidth={2.4} style={{ color: hex }} />
      {mode === "page" ? t`1 section` : t`AI decides`}
    </span>
  )
}

const WallSheet = memo(function WallSheet({
  bookLabel,
  page,
  ratio,
  fit,
  mode,
  hex,
}: {
  bookLabel: string
  page: WallPage
  ratio: number
  fit: "cover" | "contain"
  mode: SectioningWallMode
  hex: string
}) {
  return (
    <div className={SHEET} style={{ aspectRatio: ratio }}>
      <PageThumb label={bookLabel} pageId={page.pageId} sectionIndex={null} fit={fit} className="absolute inset-0 size-full rounded-none border-0" />
      <div
        className="pointer-events-none absolute inset-0 rounded-lg transition-[box-shadow,background-color] duration-300 ease-out motion-reduce:transition-none"
        style={
          mode === "page"
            ? { boxShadow: `inset 0 0 0 2px ${hex}`, backgroundColor: tint(hex, 0.06) }
            : { boxShadow: `inset 0 0 0 0 ${hex}`, backgroundColor: "transparent" }
        }
      />
      <ModeBadge mode={mode} hex={hex} />
      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[10.5px] font-medium tabular-nums text-white backdrop-blur-sm">
        {page.pageNumber}
      </span>
    </div>
  )
})

export function SectioningPagesWall({
  bookLabel,
  pages,
  mode,
  hex,
}: {
  bookLabel: string
  pages: readonly WallPage[]
  mode: SectioningWallMode
  hex: string
}) {
  const { t } = useLingui()
  const { ref, cols } = useCanvasFit<HTMLDivElement>()
  const aspect = usePageAspect(bookLabel, pages)
  const columns = aspect.landscape ? Math.max(1, Math.round(cols / 2)) : cols

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-muted/40">
      <div ref={ref} className="absolute inset-y-0 right-0 left-[min(480px,42%)]">
        <div className="size-full overflow-y-auto overscroll-contain px-8 pt-8 pb-40 [scrollbar-width:thin]!">
          <div
            className="grid items-start animate-in fade-in duration-300 motion-reduce:animate-none"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: CANVAS_GAP }}
          >
            {pages.map((page, index) => (
              <div
                key={page.pageId}
                className="animate-in fade-in zoom-in-95 fill-mode-both duration-500 motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(index, 16) * 30}ms` }}
              >
                <WallSheet bookLabel={bookLabel} page={page} ratio={aspect.ratio} fit={aspect.fitOf(page)} mode={mode} hex={hex} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="pointer-events-none absolute right-8 bottom-24 flex max-w-[min(560px,calc(58%-4rem))] items-center gap-2 rounded-full bg-card/90 px-3 py-1.5 text-[12px] text-muted-foreground shadow-sm ring-1 ring-black/5 backdrop-blur dark:ring-white/10">
        <span className="shrink-0 font-semibold text-foreground tabular-nums">
          {t`${plural(pages.length, { one: "# extracted page", other: "# extracted pages" })}`}
        </span>
        <span key={mode} className="truncate animate-in fade-in duration-300 motion-reduce:animate-none">
          {mode === "page" ? t`Each page becomes one section.` : t`AI keeps each page whole unless it finds separate activities.`}
        </span>
      </p>
    </div>
  )
}
