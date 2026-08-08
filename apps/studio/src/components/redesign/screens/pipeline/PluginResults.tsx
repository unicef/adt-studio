import { Link } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowUpRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getStageDescriptionI18n, getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { tint, type DockEntry } from "./plugins"

export interface PluginResultsProps {
  label: string
  plugin: DockEntry
}

/**
 * Shown when a plugin has already produced output. The redesigned editor for
 * each plugin is not built yet, so this hands off to the existing stage screen.
 */
export function PluginResults({ label, plugin }: PluginResultsProps) {
  const { t } = useLingui()
  const name = getStageLabelI18n(plugin.slug)

  return (
    <div className="flex w-[520px] flex-col items-center gap-5 py-8 text-center">
      <span
        className="grid size-11 place-items-center rounded-full border"
        style={{ background: tint(plugin.hex, 0.1), borderColor: tint(plugin.hex, 0.3), color: plugin.hex }}
      >
        <Check className="size-5" strokeWidth={2.6} />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">{t`${name} has already run`}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {getStageDescriptionI18n(plugin.slug)}
        </p>
      </div>

      <p className="rounded-xl border border-dashed bg-card px-4 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        <Trans>
          The redesigned editor for this plugin is not ready yet — open the current one to review and edit
          its output.
        </Trans>
      </p>

      <Button asChild variant="outline">
        <Link to="/books/$label/$step" params={{ label, step: plugin.slug }}>
          {t`Open ${name}`}
          <ArrowUpRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  )
}
