import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Check, Plus, Sparkles, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getStageDescriptionI18n } from "@/components/pipeline/pipeline-i18n"
import { cn } from "@/lib/utils"
import { PLUGIN_COPY } from "./pluginCopy"
import { tint, type DockEntry, type PluginSlug } from "./plugins"

export type ScopeKey = "book" | "page" | "selection"

const SCOPE_LABEL: Record<ScopeKey, MessageDescriptor> = {
  book: msg`Whole book`,
  page: msg`Current page`,
  selection: msg`Selection`,
}

export interface Prerequisite {
  key: string
  label: string
  met: boolean
}

export interface PluginEmptyStateProps {
  plugin: DockEntry & { slug: PluginSlug }
  prerequisites: Prerequisite[]
  scope: ScopeKey
  onScopeChange: (scope: ScopeKey) => void
  onRun: () => void
  onManual: () => void
  onImport?: () => void
}

/** Never-run state for a plugin: what it does, a real sample, and two ways in (design 4a). */
export function PluginEmptyState({
  plugin,
  prerequisites,
  scope,
  onScopeChange,
  onRun,
  onManual,
  onImport,
}: PluginEmptyStateProps) {
  const { i18n } = useLingui()
  const copy = PLUGIN_COPY[plugin.slug]

  return (
    <div className="flex w-[820px] flex-col items-center gap-6 py-8">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span
          className="grid size-11 place-items-center rounded-full border"
          style={{ background: tint(plugin.hex, 0.1), borderColor: tint(plugin.hex, 0.3), color: plugin.hex }}
        >
          <plugin.icon className="size-5" strokeWidth={2.2} />
        </span>
        <h1 className="text-2xl font-bold tracking-[-0.02em]">{i18n._(copy.emptyTitle)}</h1>
        <p className="max-w-[520px] text-sm leading-relaxed text-muted-foreground">
          {getStageDescriptionI18n(plugin.slug)}
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <Button onClick={onRun} style={{ background: plugin.hex }} className="text-white hover:opacity-90">
          <Sparkles className="size-3.5" />
          {i18n._(copy.runVerb)}
        </Button>
        <Button variant="outline" onClick={onManual}>
          <Plus className="size-3.5" />
          {i18n._(copy.manualVerb)}
        </Button>
        {onImport && (
          <Button variant="outline" onClick={onImport}>
            <Upload className="size-3.5" />
            <Trans>Import a list</Trans>
          </Button>
        )}
      </div>

      <div className="grid w-full grid-cols-2 gap-3.5">
        <section className="flex flex-col gap-2.5 rounded-xl border border-dashed bg-card p-3.5">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {copy.sampleTitle ? i18n._(copy.sampleTitle) : <Trans>Sample of what the AI returns</Trans>}
          </h2>
          {copy.sample}
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">{copy.sampleNote}</p>
        </section>

        <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-3.5">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Trans>Before running</Trans>
          </h2>
          <ul className="flex flex-col gap-2">
            {prerequisites.map((item) => (
              <li
                key={item.key}
                className={cn(
                  "flex items-center gap-2.5 text-[12.5px]",
                  item.met ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full",
                    item.met ? "bg-emerald-500 text-white" : "border-[1.5px] border-border",
                  )}
                >
                  {item.met && <Check className="size-2.5" strokeWidth={4} />}
                </span>
                {item.label}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 border-t pt-2.5">
            <span className="text-[11px] text-muted-foreground">
              <Trans>Scan scope</Trans>
            </span>
            <div className="flex gap-1.5">
              {(Object.keys(SCOPE_LABEL) as ScopeKey[]).map((key) => {
                const on = scope === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onScopeChange(key)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                      on ? "font-semibold" : "text-muted-foreground hover:bg-muted",
                    )}
                    style={
                      on
                        ? { background: tint(plugin.hex, 0.1), borderColor: tint(plugin.hex, 0.3), color: plugin.hex }
                        : undefined
                    }
                  >
                    {i18n._(SCOPE_LABEL[key])}
                  </button>
                )
              })}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <Trans>Runs in the background — you can keep working in the storyboard.</Trans>
          </p>
        </section>
      </div>
    </div>
  )
}
