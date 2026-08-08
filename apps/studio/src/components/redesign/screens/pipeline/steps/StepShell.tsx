import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { PluginEmptyState, type Prerequisite, type ScopeKey } from "../PluginEmptyState"
import { PluginRailEmpty } from "../PluginRailEmpty"
import { PluginWorkspace } from "../PluginWorkspace"
import type { StepProps } from "./types"

export interface StepShellProps extends StepProps {
  chips: string[]
  canApply: boolean
  rail: React.ReactNode
  children: React.ReactNode
}

/** The workspace frame with a step's own rail and body plugged in. */
export function StepShell({ plugin, frame, chips, canApply, rail, children }: StepShellProps) {
  return (
    <PluginWorkspace
      plugin={plugin}
      chips={chips}
      canApply={canApply}
      rail={rail}
      foundations={frame.foundations}
      plugins={frame.plugins}
      onBack={frame.onBack}
      onOpenPlugin={frame.onOpenPlugin}
    >
      {children}
    </PluginWorkspace>
  )
}

export interface StepEmptyProps extends StepProps {
  onRun?: () => void
  onManual?: () => void
  onImport?: () => void
  /** Overrides the default "sections exist, text is normalized" checklist. */
  prerequisites?: Prerequisite[]
}

/** The never-run frame every step falls back to (design 4a). */
export function StepEmpty({
  onRun,
  onManual,
  onImport,
  prerequisites,
  ...props
}: StepEmptyProps) {
  const { t } = useLingui()
  const { plugin, pages, frame } = props
  const [scope, setScope] = useState<ScopeKey>("book")

  return (
    <StepShell
      {...props}
      chips={[t`Never run`, t`${pages.length} pages ready`]}
      canApply={false}
      rail={
        <PluginRailEmpty
          hex={plugin.hex}
          title={getStageLabelI18n(plugin.slug)}
          pageCount={pages.length}
          sectionCount={frame.sectionCount}
        />
      }
    >
      <PluginEmptyState
        plugin={plugin}
        scope={scope}
        onScopeChange={setScope}
        onRun={onRun ?? (() => {})}
        onManual={onManual ?? (() => {})}
        onImport={onImport}
        prerequisites={
          prerequisites ?? [
            {
              key: "sections",
              met: frame.hasSections,
              label: t`Sections generated — ${frame.sectionCount} sections across ${pages.length} pages`,
            },
            { key: "extract", met: frame.extractDone, label: t`Text normalized by extraction` },
          ]
        }
      />
    </StepShell>
  )
}

/** Loading frame shown while a step's output is being fetched. */
export function StepLoading(props: StepProps) {
  const { t } = useLingui()
  const { plugin, pages, frame } = props
  return (
    <StepShell
      {...props}
      chips={[t`Loading…`]}
      canApply={false}
      rail={
        <PluginRailEmpty
          hex={plugin.hex}
          title={getStageLabelI18n(plugin.slug)}
          pageCount={pages.length}
          sectionCount={frame.sectionCount}
        />
      }
    >
      <span className="text-sm text-muted-foreground">{t`Loading…`}</span>
    </StepShell>
  )
}
