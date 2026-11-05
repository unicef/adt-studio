import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { getDisplayName } from "@/lib/languages"
import { useFormatMeta } from "../ExportParts"
import { useOptionText } from "./optionMeta"
import type { ExportOptions } from "./useExportOptions"
import type { StepKey } from "./useExportSteps"
import type { ExportFlow } from "../useExportFlow"

export function ReviewRows({ flow, options, goTo }: { flow: ExportFlow; options: ExportOptions; goTo: (step: StepKey) => void }) {
  const { t } = useLingui()
  const text = useOptionText()
  const meta = useFormatMeta(flow, flow.format)
  const on = options.features.filter((feature) => feature.on).map((feature) => text.name[feature.slug])
  const { included, opensIn, all } = options.languages
  const rows: { label: string; value: ReactNode; step: StepKey }[] = [
    { label: t`Format`, value: <>{meta.label} <span className="font-mono text-[11px] font-normal text-muted-foreground">{meta.ext}</span></>, step: "format" },
  ]
  if (!options.isProject) {
    rows.push({ label: t`What goes in`, value: on.length > 0 ? on.join(", ") : t`Text and images`, step: "content" })
    if (all.length > 1 && opensIn) {
      rows.push({
        label: t`Languages`,
        value:
          included.length > 1
            ? t`Opens in ${getDisplayName(opensIn)} · also ${included.filter((lang) => lang !== opensIn).map(getDisplayName).join(", ")}`
            : t`Only ${getDisplayName(opensIn)}`,
        step: "content",
      })
    }
  }
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {rows.map((row) => (
        <div key={row.label} className="flex h-[54px] items-center gap-3 px-4">
          <span className="w-28 shrink-0 text-[12px] text-muted-foreground">{row.label}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{row.value}</span>
          <button
            type="button"
            onClick={() => goTo(row.step)}
            className="shrink-0 rounded-md px-2 py-1 text-[12px] font-medium text-(--accent-solid) transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] dark:text-[color-mix(in_oklab,var(--accent)_60%,white)]"
          >
            <Trans>Change</Trans>
          </button>
        </div>
      ))}
    </div>
  )
}

