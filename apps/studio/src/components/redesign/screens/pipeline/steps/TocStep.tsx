import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { TocEntry } from "@/api/client"
import { useToc } from "@/hooks/use-toc"
import { tint } from "@/components/redesign/screens/pipeline/shared/plugins"
import { useSaveToc } from "./shared/mutations"
import { StepEmpty, StepLoading, StepShell } from "./shared/StepShell"
import { EditableText, SaveError, StepBody, StepEmptyHint, StepRail } from "./shared/ui"
import type { StepProps } from "./shared/types"

export function TocStep(props: StepProps) {
  const { label, plugin } = props
  const { t } = useLingui()
  const query = useToc(label)
  const save = useSaveToc(label)

  const entries = useMemo(() => query.data?.entries ?? [], [query.data])
  const [activeLevel, setActiveLevel] = useState<string>("")

  const levels = useMemo(() => {
    const counts = new Map<number, number>()
    for (const entry of entries) counts.set(entry.level, (counts.get(entry.level) ?? 0) + 1)
    return [...counts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([level, count]) => ({ key: String(level), title: t`Level ${level}`, count }))
  }, [entries, t])

  const patch = (id: string, changes: Partial<TocEntry>) => {
    if (!query.data) return
    save.mutate({
      ...query.data,
      entries: entries.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)),
    })
  }

  if (query.isLoading) return <StepLoading {...props} />
  if (entries.length === 0) return <StepEmpty {...props} />

  const shown =
    activeLevel === "" ? entries : entries.filter((e) => String(e.level) === activeLevel)
  const deepest = Math.max(...entries.map((e) => e.level))

  return (
    <StepShell
      {...props}
      chips={[t`${entries.length} entries`, t`${deepest} levels`]}
      canApply={entries.length > 0}
      rail={
        <StepRail
          heading={<Trans>Outline depth</Trans>}
          hex={plugin.hex}
          entries={[{ key: "", title: t`Whole outline`, count: entries.length }, ...levels]}
          activeKey={activeLevel}
          onSelect={(key) => setActiveLevel(key ?? "")}
          footer={<Trans>Titles are what the reader sees in the navigation menu.</Trans>}
        />
      }
    >
      <StepBody title={<Trans>Table of contents</Trans>} meta={t`${entries.length} entries`}>
        <SaveError error={save.error} />

        {shown.length === 0 ? (
          <StepEmptyHint>
            <Trans>No entries at this level.</Trans>
          </StepEmptyHint>
        ) : (
          <div className="flex flex-col rounded-xl border bg-card p-2">
            {shown.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-2 rounded-lg py-0.5"
                style={{ paddingLeft: `${(entry.level - 1) * 22}px` }}
              >
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]"
                  style={{ background: tint(plugin.hex, 0.12), color: plugin.hex }}
                >
                  H{entry.level}
                </span>
                <EditableText
                  value={entry.title}
                  ariaLabel={t`entry title`}
                  multiline={false}
                  isSaving={save.isPending}
                  onSave={(title) => patch(entry.id, { title })}
                  className="text-[12.5px]"
                />
              </div>
            ))}
          </div>
        )}
      </StepBody>
    </StepShell>
  )
}
