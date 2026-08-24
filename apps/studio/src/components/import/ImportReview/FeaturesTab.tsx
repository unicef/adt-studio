import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown } from "lucide-react"
import type { AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview } from "@/api/client"
import { cn } from "@/lib/utils"
import { FEATURES, featureStatus } from "./helpers"

export function FeaturesTab({ preview }: { preview: AnyImportPreview }) {
  const { i18n } = useLingui()
  const [hasMoreBelow, setHasMoreBelow] = useState(false)
  const scrollArea = useRef<HTMLDivElement>(null)
  const needsRegeneration = FEATURES.some((feature) => (
    featureStatus(preview, feature.slug) === "needs-regeneration"
  ))

  // The grid reflows from one column to three across the breakpoints, so
  // whether anything is actually cut off depends on the rendered height rather
  // than the feature count. Measure it, and keep measuring as the card resizes,
  // so the hint never invites a scroll that does nothing.
  useEffect(() => {
    const area = scrollArea.current
    if (!area) return
    const measure = () => {
      setHasMoreBelow(area.scrollHeight - area.scrollTop - area.clientHeight > 4)
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    for (const child of Array.from(area.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="relative h-full">
      <div
        ref={scrollArea}
        role="region"
        aria-labelledby="import-review-tab-features"
        tabIndex={0}
        className="h-full overflow-y-auto pb-10 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
        onScroll={(event) => {
          const area = event.currentTarget
          setHasMoreBelow(area.scrollHeight - area.scrollTop - area.clientHeight > 4)
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-4">
          <p className="text-xs leading-relaxed text-slate-600">
            {needsRegeneration ? (
              <Trans>Included features carry over to the imported book. The others need generating in Studio.</Trans>
            ) : (
              <Trans>Included features carry over to the imported book. Missing features can be generated in Studio.</Trans>
            )}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {FEATURES.map((feature) => {
            const status = featureStatus(preview, feature.slug)
            const Icon = feature.icon
            return (
              <div key={feature.slug} className="flex min-h-[96px] items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", feature.bgLight, feature.borderColor, feature.textColor)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-col items-start gap-1.5">
                    <p className="min-w-0 break-words text-sm font-semibold leading-tight text-slate-900">{i18n._(feature.label)}</p>
                    <span className={cn(
                      "inline-flex max-w-full whitespace-normal break-words rounded-full px-2 py-0.5 text-left text-[10px] font-semibold leading-tight transition-colors duration-200",
                      status === "recovered"
                        ? `${feature.bgLight} ${feature.textColor}`
                        : status === "needs-regeneration"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-500",
                    )}>
                      {status === "recovered" ? (
                        <Trans>Included</Trans>
                      ) : status === "needs-regeneration" ? (
                        <Trans>Needs regenerating</Trans>
                      ) : (
                        <Trans>Available</Trans>
                      )}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                    {status === "needs-regeneration"
                      ? <Trans>The source publication uses this, but its editable data is not in the archive.</Trans>
                      : i18n._(feature.description)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {hasMoreBelow ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-gradient-to-t from-white via-white/95 to-transparent pb-1.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
            <Trans>Scroll to see all features</Trans>
            <ChevronDown className="h-3 w-3" />
          </span>
        </div>
      ) : null}
    </div>
  )
}

