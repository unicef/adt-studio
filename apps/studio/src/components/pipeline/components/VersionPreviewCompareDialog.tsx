import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { type LucideIcon } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import type { VersionEntry } from "@/api/client"
import { AnimatedHeight, PreviewCrossfade, PreviewSkeleton, useReservedHeight } from "./LazyThumb"
import { PreviewViewportToggle } from "./PreviewViewportToggle"
import type { PreviewViewport } from "./preview-viewport"
import { VersionCompareShell, useSelectedVersion } from "./VersionCompareShell"

// The current page renders at the same height every time this dialog opens, but
// we can't know that height until the iframe lays out — so the first open grows
// from the skeleton to the measured height. Remember it (per item + version, at
// module scope so it survives dialog unmounts) and seed the skeleton with it on
// later opens, so they open at the right size with no grow.
const currentHeightCache = new Map<string, number>()
// Bounded LRU-ish set: evict the oldest entry (Map preserves insertion order)
// once the cache grows past the cap, so a long session can't leak unboundedly.
const HEIGHT_CACHE_CAP = 200
function rememberHeight(key: string, height: number) {
  currentHeightCache.delete(key)
  currentHeightCache.set(key, height)
  if (currentHeightCache.size > HEIGHT_CACHE_CAP) {
    currentHeightCache.delete(currentHeightCache.keys().next().value as string)
  }
}

export interface VersionPreviewRenderOptions {
  lite?: boolean
  viewport?: PreviewViewport
  /** Scale the complete rendered preview to fit within this visible height. */
  maxHeight?: number
}

interface VersionPreviewCompareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  versions: VersionEntry[]
  currentVersion: number
  initialSelected: number
  /** Renders a version's content read-only (`onReady` drives the skeleton). */
  renderPreview: (
    data: unknown,
    onReady?: () => void,
    opts?: VersionPreviewRenderOptions
  ) => ReactNode
  accentColor: string
  icon: LucideIcon
  onRestore: (version: number) => Promise<void> | void
  /** Stable id (book + step + item) used to cache the current pane's height. */
  cacheKey?: string
  /** Enables the synchronized breakpoint control and sets its initial value. */
  initialViewport?: PreviewViewport
  /** Stage-specific classifier for viewport indicators. */
  getChangedViewports?: (
    currentData: unknown,
    selectedData: unknown
  ) => ReadonlySet<PreviewViewport>
}

/**
 * Side-by-side comparison of two versions' *rendered* content — the current
 * version on the left, a chosen version on the right. For visual steps
 * (storyboard) where the diff is best seen as the rendered output rather than
 * an item list. Applying restores the chosen version.
 *
 * The dialog fits its content height (no fixed-height void for short landscape
 * pages). The current pane defines the row height; the selected pane stretches
 * to fill it, so the compared version always matches the current page's height
 * (empty space below shorter versions, internal scroll for taller ones). The
 * current pane's height is cached per item so re-opens skip the load grow, and
 * `AnimatedHeight` eases any remaining change. A tall portrait page scrolls
 * inside its pane rather than pushing the dialog past the viewport.
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
  cacheKey,
  initialViewport,
  getChangedViewports,
}: VersionPreviewCompareDialogProps) {
  const { t } = useLingui()
  const [selected, setSelected] = useSelectedVersion(open, initialSelected)
  const isCurrent = selected === currentVersion
  const viewportEnabled = initialViewport != null
  const [viewport, setViewport] = useState<PreviewViewport>(initialViewport ?? "desktop")
  const viewportWasOpen = useRef(false)
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1280,
    height: typeof window !== "undefined" ? window.innerHeight : 800,
  }))

  useEffect(() => {
    if (open && !viewportWasOpen.current && initialViewport) {
      setViewport(initialViewport)
    }
    viewportWasOpen.current = open
  }, [open, initialViewport])

  useEffect(() => {
    const updateWindowSize = () =>
      setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener("resize", updateWindowSize)
    return () => window.removeEventListener("resize", updateWindowSize)
  }, [])

  const dataOf = (v: number) => versions.find((x) => x.version === v)?.data
  const changedViewports = useMemo(
    () =>
      !isCurrent && getChangedViewports
        ? getChangedViewports(dataOf(currentVersion), dataOf(selected))
        : new Set<PreviewViewport>(),
    [currentVersion, getChangedViewports, isCurrent, selected, versions]
  )
  const comparePreviewMaxHeight = viewportEnabled
    ? Math.max(
        220,
        Math.min(
          560,
          Math.round(windowSize.height * (windowSize.width < 768 ? 0.38 : 0.56))
        )
      )
    : undefined
  const renderOptions = viewportEnabled
    ? { viewport, maxHeight: comparePreviewMaxHeight }
    : undefined

  // Measure each pane's rendered height and cache it per version, so a loader
  // is sized to the page that's coming (no pop when a shorter page reveals, no
  // grow when a taller one does). Unmeasured versions fall back to the current
  // page's height — a close guess, corrected after the first view.
  const keyFor = (v: number) =>
    cacheKey ? `${cacheKey}:${viewportEnabled ? `${viewport}:` : ""}${v}` : null
  const seededFor = (v: number): number | undefined => {
    const own = keyFor(v)
    const ownHeight = own ? currentHeightCache.get(own) : undefined
    if (ownHeight != null) return ownHeight
    const cur = keyFor(currentVersion)
    return cur ? currentHeightCache.get(cur) : undefined
  }

  const measurementKey = viewportEnabled ? viewport : undefined
  const [currentPaneRef, currentMeasured] = useReservedHeight<HTMLDivElement>(
    open,
    measurementKey
  )
  useEffect(() => {
    const k = keyFor(currentVersion)
    if (k && currentMeasured) rememberHeight(k, currentMeasured)
  }, [cacheKey, currentVersion, currentMeasured, viewport, viewportEnabled])

  // The selected pane is pinned to the current pane's measured height (the
  // current pane caps itself at the dialog's available space — viewport minus
  // header/chips/footer chrome). This keeps both panes equal, stops a tall
  // selected page from stretching the row past the dialog, and means switching
  // versions never resizes anything. Falls back to a fraction of the viewport
  // for the first frame before the measurement lands.
  const fallbackHeight = typeof window !== "undefined" ? Math.round(window.innerHeight * 0.4) : 320
  const paneHeight = currentMeasured ?? seededFor(currentVersion) ?? fallbackHeight

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
      description={t`Compare the current version with a chosen version at the same screen size.`}
      contentClassName="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[92vh] sm:w-[95vw]"
      controls={
        viewportEnabled ? (
          <PreviewViewportToggle
            value={viewport}
            onChange={setViewport}
            changedViewports={changedViewports}
            variant="surface"
          />
        ) : undefined
      }
    >
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-muted/30">
        <AnimatedHeight>
          <div className="p-2 sm:p-3">
            {isCurrent ? (
              <div className="flex flex-col overflow-hidden rounded-lg border bg-background">
                {paneLabel(t`Current version (v${currentVersion})`, true)}
                <div
                  ref={currentPaneRef}
                  className={
                    viewportEnabled
                      ? "overflow-hidden bg-muted/20 p-3 sm:p-4"
                      : "max-h-[calc(90vh-15rem)] overflow-auto"
                  }
                >
                  <PreviewSkeleton
                    key={viewportEnabled ? `${currentVersion}:${viewport}` : currentVersion}
                    reservedClassName="h-[40vh]"
                    reservedHeight={seededFor(currentVersion)}
                    render={(onReady) =>
                      renderPreview(dataOf(currentVersion), onReady, renderOptions)
                    }
                  />
                </div>
                <p className="border-t px-3 py-2 text-center text-[11px] text-muted-foreground">
                  {t`Pick another version above to compare it with the current one.`}
                </p>
              </div>
            ) : (
              // The current pane defines the row height (its own page, capped so
              // a very tall page scrolls). Both panes stretch to it, and the
              // selected pane fills that height — so it always matches the
              // current page, with empty space below shorter versions or an
              // internal scroll for taller ones.
              <div className="grid grid-cols-1 items-stretch gap-2 md:grid-cols-2 md:gap-3">
                <div className="flex flex-col overflow-hidden rounded-lg border bg-background">
                  {paneLabel(t`Current (v${currentVersion})`, false)}
                  <div
                    ref={currentPaneRef}
                    className={
                      viewportEnabled
                        ? "overflow-hidden bg-muted/20 p-3 sm:p-4"
                        : "max-h-[42vh] overflow-auto md:max-h-[calc(90vh-15rem)]"
                    }
                  >
                    <PreviewSkeleton
                      key={
                        viewportEnabled
                          ? `cur-${currentVersion}:${viewport}`
                          : `cur-${currentVersion}`
                      }
                      reservedClassName="h-[40vh]"
                      reservedHeight={seededFor(currentVersion)}
                      render={(onReady) =>
                        renderPreview(dataOf(currentVersion), onReady, renderOptions)
                      }
                    />
                  </div>
                </div>
                <div
                  className="flex flex-col overflow-hidden rounded-lg border bg-background"
                  style={{ borderColor: accentColor, boxShadow: `0 0 0 1px ${accentColor}` }}
                >
                  {paneLabel(t`Version ${selected}`, true)}
                  <div
                    className={
                      viewportEnabled
                        ? "overflow-hidden bg-muted/20 p-3 sm:p-4"
                        : "relative overflow-hidden"
                    }
                    style={{ height: paneHeight }}
                  >
                    <div className="relative h-full overflow-hidden">
                      <PreviewCrossfade
                        key={viewportEnabled ? viewport : "default"}
                        value={selected}
                        render={(v, onReady) =>
                          renderPreview(dataOf(v), onReady, renderOptions)
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </AnimatedHeight>
      </div>
    </VersionCompareShell>
  )
}
