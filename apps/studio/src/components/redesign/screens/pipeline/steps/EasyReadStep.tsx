import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { EasyReadSectionBlock } from "@/api/client"
import { tint } from "../plugins"
import { useSaveEasyRead } from "./mutations"
import { useEasyRead } from "./queries"
import { StepEmpty, StepLoading, StepShell } from "./StepShell"
import { EditableText, SaveError, StepBody, StepCard, StepGroupLabel, StepRail } from "./ui"
import type { StepProps } from "./types"

export function EasyReadStep(props: StepProps) {
  const { label, plugin } = props
  const { t } = useLingui()
  const query = useEasyRead(label)
  const save = useSaveEasyRead(label)

  const blocks = useMemo(() => query.data?.blocks ?? [], [query.data])
  const [activePageId, setActivePageId] = useState<string | null>(null)

  const railEntries = useMemo(() => {
    const map = new Map<string, { pageNumber: number; count: number }>()
    for (const block of blocks) {
      const current = map.get(block.pageId) ?? { pageNumber: block.pageNumber, count: 0 }
      current.count += block.entries.length
      map.set(block.pageId, current)
    }
    return [...map.entries()].map(([pageId, value]) => ({
      key: pageId,
      title: t`Page ${value.pageNumber}`,
      count: value.count,
    }))
  }, [blocks, t])

  const patch = (sectionId: string, easyReadId: string, text: string) => {
    if (!query.data) return
    const next: EasyReadSectionBlock[] = blocks.map((block) =>
      block.sectionId === sectionId
        ? {
            ...block,
            entries: block.entries.map((entry) =>
              entry.easyReadId === easyReadId ? { ...entry, text } : entry,
            ),
          }
        : block,
    )
    save.mutate({ blocks: next, generatedAt: query.data.generatedAt })
  }

  if (query.isLoading) return <StepLoading {...props} />
  if (blocks.length === 0) return <StepEmpty {...props} />

  const total = blocks.reduce((sum, b) => sum + b.entries.length, 0)
  const shown = activePageId ? blocks.filter((b) => b.pageId === activePageId) : blocks

  return (
    <StepShell
      {...props}
      chips={[t`${total} blocks`, t`${blocks.length} sections`]}
      canApply={total > 0}
      rail={
        <StepRail
          heading={<Trans>Blocks by page</Trans>}
          hex={plugin.hex}
          entries={railEntries}
          activeKey={activePageId}
          onSelect={(key) => setActivePageId((cur) => (cur === key ? null : key))}
          footer={<Trans>Readers switch between the original text and these blocks.</Trans>}
        />
      }
    >
      <StepBody title={<Trans>Easy Read</Trans>} meta={t`${total} blocks`}>
        <SaveError error={save.error} />

        {shown.map((block) => (
          <div key={block.sectionId} className="flex flex-col gap-2">
            <StepGroupLabel>
              {t`Page ${block.pageNumber} · section ${block.sectionIndex + 1} · ${block.sectionType}`}
            </StepGroupLabel>

            {block.entries.map((entry) => (
              <StepCard key={entry.easyReadId} accent={plugin.hex}>
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      <Trans>Original</Trans>
                    </span>
                    <p className="px-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                      {entry.originalText}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span
                      className="w-fit rounded px-1.5 text-[10px] font-semibold uppercase tracking-[0.1em]"
                      style={{ background: tint(plugin.hex, 0.12), color: plugin.hex }}
                    >
                      <Trans>Easy Read</Trans>
                    </span>
                    <EditableText
                      value={entry.text}
                      ariaLabel={t`Easy Read text`}
                      placeholder={t`Rewrite this passage…`}
                      isSaving={save.isPending}
                      onSave={(text) => patch(block.sectionId, entry.easyReadId, text)}
                      className="text-[12.5px] leading-relaxed"
                    />
                  </div>
                </div>
              </StepCard>
            ))}
          </div>
        ))}
      </StepBody>
    </StepShell>
  )
}
