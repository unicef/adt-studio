import { useLingui } from "@lingui/react/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"

export function StepMap({ items, activeSlug }: { items: DockItem[]; activeSlug: string }) {
  const { t } = useLingui()
  const index = items.findIndex((item) => item.slug === activeSlug)
  if (index === -1) return null
  return (
    <span
      role="img"
      aria-label={t`Step ${index + 1} of ${items.length}: ${getStageLabelI18n(activeSlug)}`}
      className="ml-2 flex shrink-0 items-center gap-1"
    >
      {items.map((item) => {
        const active = item.slug === activeSlug
        const done = item.state === "done"
        return (
          <span
            key={item.slug}
            title={getStageLabelI18n(item.slug)}
            className={cn(
              "h-1.5 rounded-full transition-[width,background-color,opacity] duration-300 ease-out",
              active ? "w-5" : "w-1.5",
              !active && !done && "opacity-35",
            )}
            style={{ background: active || done ? item.hex : "currentColor" }}
          />
        )
      })}
      <span className="ml-1.5 font-mono text-[10.5px] tabular-nums opacity-60">
        {index + 1}/{items.length}
      </span>
    </span>
  )
}
