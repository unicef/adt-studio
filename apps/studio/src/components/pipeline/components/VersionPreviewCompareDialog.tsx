import { type ReactNode } from "react"
import { type LucideIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { VersionEntry } from "@/api/client"
import { PreviewSkeleton, useReservedHeight } from "./LazyThumb"
import { VersionCompareShell, useSelectedVersion } from "./VersionCompareShell"

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
  icon,
  onRestore,
}: VersionPreviewCompareDialogProps) {
  const { t } = useLingui()
  const [selected, setSelected] = useSelectedVersion(open, initialSelected)
  const isCurrent = selected === currentVersion

  // Measure the current version's rendered height and reserve it for the other
  // versions' skeletons — same page across versions is (almost) the same
  // height, so the skeleton matches the content and doesn't grow on reveal.
  const [currentPaneRef, reservedHeight] = useReservedHeight<HTMLDivElement>(open)

  const dataOf = (v: number) => versions.find((x) => x.version === v)?.data

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
    <VersionCompareShell
      open={open}
      onOpenChange={onOpenChange}
      versions={versions}
      currentVersion={currentVersion}
      selected={selected}
      onSelect={setSelected}
      accentColor={accentColor}
      icon={icon}
      onRestore={onRestore}
      description={t`See the current version and a chosen version rendered side by side.`}
      contentClassName="flex max-h-[92vh] w-[95vw] max-w-6xl flex-col gap-0 p-0"
    >
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
    </VersionCompareShell>
  )
}
