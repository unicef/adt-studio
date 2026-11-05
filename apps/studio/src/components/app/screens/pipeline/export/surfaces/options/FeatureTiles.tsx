import { Trans } from "@lingui/react/macro"
import { FileText } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { EpubGlossaryOptions } from "@/components/pipeline/stages/export/EpubGlossaryOptions"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { ACCENT_SWITCH, stageLook, useOptionText } from "./optionMeta"
import type { ExportOptions, FeatureOption } from "./useExportOptions"
import type { ExportFlow } from "../useExportFlow"

function FeatureTile({
  feature,
  options,
  label,
  stacked,
  wide,
  disabled,
}: {
  feature: FeatureOption
  options: ExportOptions
  label: string
  stacked: boolean
  wide: boolean
  disabled: boolean
}) {
  const text = useOptionText()
  const look = stageLook(feature.slug)
  const Icon = look.icon
  const id = `${label}-${feature.key}`
  const toggle = (
    <Switch id={id} checked={feature.on} disabled={disabled} onCheckedChange={(on) => options.setFeature(feature.key, on)} />
  )
  return (
    <div className={cn("flex rounded-2xl border bg-card p-3.5", stacked ? "flex-col justify-between gap-3" : "items-center gap-3", wide && "col-span-2")}>
      <span className={cn("flex gap-3", stacked ? "items-start justify-between" : "contents")}>
        <span
          className={cn("grid shrink-0 place-items-center rounded-xl transition-[filter] duration-200", stacked ? "size-11" : "size-9")}
          style={{ backgroundColor: tint(look.hex, 0.14), color: look.hex, filter: feature.on ? undefined : "grayscale(1)" }}
        >
          <Icon className={stacked ? "size-5" : "size-4"} aria-hidden />
        </span>
        {stacked && toggle}
      </span>
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          {text.name[feature.slug]}
          {feature.large && (
            <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10.5px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
              <Trans>Bigger file</Trans>
            </span>
          )}
        </span>
        <span className={cn("text-[11.5px] leading-snug text-muted-foreground", stacked ? "line-clamp-2" : "truncate")}>{text.hint[feature.slug]}</span>
      </label>
      {!stacked && toggle}
    </div>
  )
}

export function FeatureTiles({ flow, options, label }: { flow: ExportFlow; options: ExportOptions; label: string }) {
  const busy = flow.watcher.isPreparing
  const count = options.features.length
  const three = count === 3
  const glossaryOn = options.features.find((feature) => feature.key === "glossary")?.on ?? false
  const epub = flow.format === "epub" && options.features.some((feature) => feature.key === "glossary")

  if (count === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-dashed bg-muted/30 p-3.5">
        <span className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground">
          <FileText className="size-4" />
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          <Trans>Text and images only. Glossary, read aloud, quizzes and sign language join once their steps run.</Trans>
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={cn("grid gap-3", three ? "grid-cols-3" : "grid-cols-2", ACCENT_SWITCH)}>
        {options.features.map((feature, index) => (
          <FeatureTile
            key={feature.key}
            feature={feature}
            options={options}
            label={label}
            stacked={three}
            wide={count % 2 === 1 && !three && index === count - 1}
            disabled={busy}
          />
        ))}
      </div>
      {epub && (
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
            glossaryOn ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden" inert={!glossaryOn}>
            <EpubGlossaryOptions bookLabel={label} disabled={busy} tone="accent" />
          </div>
        </div>
      )}
    </div>
  )
}
