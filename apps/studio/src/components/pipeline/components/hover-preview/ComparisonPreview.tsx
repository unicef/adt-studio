import { Trans } from "@lingui/react/macro"
import { AlertTriangle, ArrowLeftRight, EyeOff, FileText, Monitor, Puzzle } from "lucide-react"
import { cn } from "@/lib/utils"

export function ComparisonPreview({
  pos,
  pdfThumb,
  renderedThumb,
  pageNumber,
  sectionIndex,
  sectionType,
  isActivity,
  isPruned,
  isStale,
}: {
  pos: { top: number; left: number }
  pdfThumb: string | null
  renderedThumb: string | null
  pageNumber: number
  sectionIndex: number
  sectionType: string
  isActivity: boolean
  isPruned: boolean
  isStale: boolean
}) {
  return (
    <div
      className="fixed z-50 pointer-events-none animate-in fade-in zoom-in-95 duration-150"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="rounded-xl bg-background shadow-2xl ring-1 ring-border overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-muted/30">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold text-foreground">
              <Trans>Page {String(pageNumber)}</Trans>
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">
              <Trans>Section {String(sectionIndex + 1)}</Trans>
            </span>
            {isActivity && (
              <span className="inline-flex items-center gap-1 px-1.5 h-[18px] rounded bg-violet-100 text-violet-700 text-[10px] font-semibold">
                <Puzzle className="w-2.5 h-2.5" />
                <Trans>Activity</Trans>
              </span>
            )}
            {sectionType && (
              <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/80 truncate">
                {sectionType}
              </span>
            )}
          </div>
          {isPruned ? (
            <span className="inline-flex items-center gap-1 px-1.5 h-[18px] rounded bg-zinc-200 text-zinc-700 text-[10px] font-semibold shrink-0">
              <EyeOff className="w-2.5 h-2.5" />
              <Trans>Pruned</Trans>
            </span>
          ) : isStale ? (
            <span className="inline-flex items-center gap-1 px-1.5 h-[18px] rounded bg-amber-100 text-amber-800 text-[10px] font-semibold shrink-0">
              <AlertTriangle className="w-2.5 h-2.5" />
              <Trans>Out of date</Trans>
            </span>
          ) : null}
        </div>
        {/* Comparison */}
        <div className="flex items-stretch p-3 gap-3 bg-background">
          <PreviewPanel
            src={pdfThumb}
            icon={<FileText className="w-3 h-3" />}
            label={<Trans>Source PDF</Trans>}
            fallback={<Trans>No source image</Trans>}
          />
          <div className="flex items-center justify-center px-1">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted/60 text-muted-foreground">
              <ArrowLeftRight className="w-3 h-3" />
            </div>
          </div>
          <PreviewPanel
            src={renderedThumb}
            icon={<Monitor className="w-3 h-3" />}
            label={<Trans>Generated section</Trans>}
            fallback={
              isPruned ? (
                <Trans>This section is pruned and isn't rendered.</Trans>
              ) : (
                <Trans>Not rendered yet</Trans>
              )
            }
            tint={isStale ? "amber" : isPruned ? "zinc" : undefined}
          />
        </div>
      </div>
    </div>
  )
}

function PreviewPanel({
  src,
  icon,
  label,
  fallback,
  tint,
}: {
  src: string | null
  icon: React.ReactNode
  label: React.ReactNode
  fallback?: React.ReactNode
  tint?: "amber" | "zinc"
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "h-[400px] w-[340px] rounded-lg bg-muted/40 ring-1 ring-border overflow-hidden flex items-center justify-center",
          tint === "amber" && "ring-amber-200 bg-amber-50/40",
          tint === "zinc" && "ring-zinc-200 bg-zinc-100/60",
        )}
      >
        {src ? (
          <img src={src} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground px-3 text-center">
            {fallback ?? <Trans>No preview available</Trans>}
          </span>
        )}
      </div>
    </div>
  )
}
