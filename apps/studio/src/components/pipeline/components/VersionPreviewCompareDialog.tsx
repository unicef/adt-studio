import { useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { Check, type LucideIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { VersionEntry } from "@/api/client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { PreviewSkeleton, useReservedHeight } from "./LazyThumb"

interface VersionPreviewCompareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  versions: VersionEntry[]
  currentVersion: number
  initialSelected: number
  /** Renders a version's content read-only (`onReady` drives the skeleton). */
  renderPreview: (data: unknown, onReady?: () => void) => ReactNode
  accentColor: string
  icon: LucideIcon
  onRestore: (version: number) => Promise<void> | void
}

/**
 * Side-by-side comparison of two versions' *rendered* content — the current
 * version on the left, a chosen version on the right. For visual steps
 * (storyboard) where the diff is best seen as the rendered output rather than
 * an item list. Applying restores the chosen version.
 */
export function VersionPreviewCompareDialog({
  open,
  onOpenChange,
  versions,
  currentVersion,
  initialSelected,
  renderPreview,
  accentColor,
  icon: Icon,
  onRestore,
}: VersionPreviewCompareDialogProps) {
  const { t } = useLingui()
  const [selected, setSelected] = useState(initialSelected)

  useEffect(() => {
    if (open) setSelected(initialSelected)
  }, [open, initialSelected])

  // Measure the current version's rendered height and reserve it for the other
  // versions' skeletons — same page across versions is (almost) the same
  // height, so the skeleton matches the content and doesn't grow on reveal.
  const [currentPaneRef, reservedHeight] = useReservedHeight<HTMLDivElement>(open)

  const dataOf = (v: number) => versions.find((x) => x.version === v)?.data
  const isCurrent = selected === currentVersion

  const paneLabel = (label: string, active: boolean) => (
    <div
      className={`flex items-center justify-center border-b px-3 py-1.5 text-[11px] font-semibold ${
        active ? "" : "text-muted-foreground"
      }`}
      style={active ? { color: accentColor } : undefined}
    >
      {label}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] w-[95vw] max-w-6xl flex-col gap-0 p-0"
        style={{ "--accent-color": accentColor, "--ring": accentColor } as CSSProperties}
      >
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" strokeWidth={2.25} style={{ color: accentColor }} aria-hidden />
            <DialogTitle>{t`Compare versions`}</DialogTitle>
          </div>
          <DialogDescription>
            {t`See the current version and a chosen version rendered side by side.`}
          </DialogDescription>
        </DialogHeader>

        {/* Version chips */}
        <div className="flex flex-wrap items-center gap-1 border-b px-4 py-2.5">
          {versions.map((v) => {
            const chipCurrent = v.version === currentVersion
            const chipSelected = v.version === selected
            return (
              <button
                key={v.version}
                type="button"
                onClick={() => setSelected(v.version)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  chipSelected ? "text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
                style={chipSelected ? { backgroundColor: accentColor } : undefined}
              >
                v{v.version}
                {chipCurrent && (
                  <span
                    className="rounded px-1 py-0.5 text-[9px]"
                    style={chipSelected ? undefined : { backgroundColor: `${accentColor}1a`, color: accentColor }}
                  >
                    {t`current`}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Rendered comparison */}
        <div className="min-w-0 flex-1 overflow-auto bg-muted/30 p-3">
          {isCurrent ? (
            <div className="flex flex-col overflow-hidden rounded-lg border bg-background">
              {paneLabel(t`Current version (v${currentVersion})`, true)}
              <div className="max-h-[74vh] overflow-auto">
                <PreviewSkeleton
                  reservedClassName="h-[55vh]"
                  render={(onReady) => renderPreview(dataOf(currentVersion), onReady)}
                />
              </div>
              <p className="border-t px-3 py-2 text-center text-[11px] text-muted-foreground">
                {t`Pick another version above to compare it with the current one.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 items-start gap-3">
              <div className="flex flex-col overflow-hidden rounded-lg border bg-background">
                {paneLabel(t`Current (v${currentVersion})`, false)}
                <div ref={currentPaneRef} className="max-h-[74vh] overflow-auto">
                  <PreviewSkeleton
                    key={`cur-${currentVersion}`}
                    reservedClassName="h-[55vh]"
                    reservedHeight={reservedHeight ?? undefined}
                    render={(onReady) => renderPreview(dataOf(currentVersion), onReady)}
                  />
                </div>
              </div>
              <div
                className="flex flex-col overflow-hidden rounded-lg border bg-background"
                style={{ borderColor: accentColor, boxShadow: `0 0 0 1px ${accentColor}` }}
              >
                {paneLabel(t`Version ${selected}`, true)}
                <div className="max-h-[74vh] overflow-auto">
                  <PreviewSkeleton
                    key={`sel-${selected}`}
                    reservedClassName="h-[55vh]"
                    reservedHeight={reservedHeight ?? undefined}
                    render={(onReady) => renderPreview(dataOf(selected), onReady)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t p-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted cursor-pointer"
          >
            {t`Cancel`}
          </button>
          <button
            type="button"
            disabled={isCurrent}
            onClick={async () => {
              await onRestore(selected)
              onOpenChange(false)
            }}
            style={{ backgroundColor: accentColor }}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Check className="h-4 w-4" />
            {t`Use version ${selected}`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
