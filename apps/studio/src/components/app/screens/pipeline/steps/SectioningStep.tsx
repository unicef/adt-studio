import { useMemo, useState } from "react"
import { useQueries } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { EyeOff, Undo2 } from "lucide-react"
import { api, type ContentNode, type PageDetail } from "@/api/client"
import { useSaveSectioning } from "@/hooks/use-page-mutations"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useSectioningRun } from "@/components/app/screens/pipeline/runs/useSectioningRun"
import { StepEmpty, StepLoading, StepRunning, StepShell, useStepLoading } from "./shared/StepShell"
import { RowAction, SaveError, StepBody, StepCard, StepGroupLabel, StepRail } from "./shared/ui"
import type { StepProps } from "./shared/types"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"

type SectioningTree = NonNullable<PageDetail["sectioningTree"]>
type Section = SectioningTree["sections"][number]

function flatten(nodes: ContentNode[] | undefined, out: { role: string; text: string }[] = []) {
  for (const node of nodes ?? []) {
    if (node.text?.trim()) out.push({ role: node.role ?? node.structure ?? "", text: node.text })
    if (node.children) flatten(node.children, out)
  }
  return out
}

function PageSections({
  label,
  page,
  tree,
  accent,
}: {
  label: string
  page: PipelinePage
  tree: SectioningTree
  accent: string
}) {
  const { t } = useLingui()
  const save = useSaveSectioning(label, page.pageId)

  const toggle = (sectionId: string, isPruned: boolean) => {
    save.mutate({
      ...tree,
      sections: tree.sections.map((s: Section) =>
        s.sectionId === sectionId ? { ...s, isPruned } : s,
      ),
    })
  }

  return (
    <>
      <StepGroupLabel>{t`Page ${page.pageNumber}`}</StepGroupLabel>
      <SaveError error={save.error} />

      {tree.reasoning && (
        <p
          className="rounded-lg px-3 py-2 text-[11.5px] leading-relaxed text-muted-foreground"
          style={{ background: tint(accent, 0.06) }}
        >
          {tree.reasoning}
        </p>
      )}

      {tree.sections.map((section, index) => {
        const lines = flatten(section.nodes)
        return (
          <StepCard key={section.sectionId} muted={section.isPruned} accent={accent}>
            <div className="flex items-center gap-2">
              <span
                className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]"
                style={{ background: tint(accent, 0.12), color: accent }}
              >
                {index + 1}
              </span>
              <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
                {section.sectionType}
              </span>
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-full border"
                style={{ background: section.backgroundColor }}
                title={section.backgroundColor}
              />
              <span className="ml-auto flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {t`${lines.length} nodes`}
                </span>
                <RowAction
                  icon={section.isPruned ? Undo2 : EyeOff}
                  label={section.isPruned ? t`Keep this section` : t`Drop this section`}
                  onClick={() => toggle(section.sectionId, !section.isPruned)}
                />
              </span>
            </div>

            {lines.length === 0 ? (
              <p className="px-1.5 text-[12px] italic text-muted-foreground">
                <Trans>This section has no text nodes.</Trans>
              </p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-1 overflow-auto px-1.5">
                {lines.map((line, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed">
                    {line.role && (
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {line.role}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">{line.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </StepCard>
        )
      })}
    </>
  )
}

export function SectioningStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const run = useRunActivity()
  const sectioning = useStageActivity("sectioning")
  const extract = useStageActivity("extract")
  const sectioningRun = useSectioningRun(label)

  const details = useQueries({
    queries: pages.map((page) => ({
      queryKey: ["books", label, "pages", page.pageId],
      queryFn: () => api.getPage(label, page.pageId),
    })),
  })

  const [activePageId, setActivePageId] = useState<string | null>(null)

  const entries = useMemo(
    () =>
      pages
        .map((page, i) => ({ page, tree: details[i]?.data?.sectioningTree ?? null }))
        .filter((entry): entry is { page: PipelinePage; tree: SectioningTree } => entry.tree != null),
    [pages, details],
  )

  const loading = useStepLoading(props, {
    isLoading: details.some((d) => d.isLoading),
    hasOutput: entries.length > 0,
  })

  const feeding = sectioning.isActive ? sectioning : extract.isActive ? extract : null
  if (feeding && entries.length === 0) {
    return (
      <StepRunning
        {...props}
        stage={feeding}
        isCancelling={run.isCancelling}
        onCancel={run.cancelRun}
        outcome={t`Sections show up here as each page is structured.`}
      />
    )
  }
  if (loading) return <StepLoading {...props} />
  if (entries.length === 0) {
    return (
      <StepEmpty
        {...props}
        onRun={sectioningRun.run}
        canRun={sectioningRun.canRun}
        runDisabledReason={
          sectioningRun.hasApiKey ? undefined : (
            <Trans>Add an API key in Book settings to run sectioning.</Trans>
          )
        }
        prerequisites={[
          {
            key: "pages",
            met: pages.length > 0,
            label: t`Pages extracted — ${pages.length} pages`,
          },
          {
            key: "api-key",
            met: sectioningRun.hasApiKey,
            label: t`API key set in Book settings`,
          },
        ]}
      />
    )
  }

  const total = entries.reduce((sum, e) => sum + e.tree.sections.length, 0)
  const pruned = entries.reduce(
    (sum, e) => sum + e.tree.sections.filter((s) => s.isPruned).length,
    0,
  )
  const shown = activePageId ? entries.filter((e) => e.page.pageId === activePageId) : entries

  return (
    <StepShell
      {...props}
      chips={[
        t`${total} sections`,
        pruned > 0 ? t`${pruned} dropped` : t`All kept`,
      ]}
      canApply={total - pruned > 0}
      rail={
        <StepRail
          heading={<Trans>Sections by page</Trans>}
          hex={plugin.hex}
          entries={[
            { key: "", title: t`All pages`, count: total },
            ...entries.map((e) => ({
              key: e.page.pageId,
              title: t`Page ${e.page.pageNumber}`,
              count: e.tree.sections.length,
            })),
          ]}
          activeKey={activePageId ?? ""}
          onSelect={(key) => setActivePageId(key ? key : null)}
          footer={<Trans>Dropped sections stay in the book but never reach the reader.</Trans>}
        />
      }
    >
      <StepBody title={<Trans>Sectioning</Trans>} meta={t`${total} sections`}>
        {shown.map((entry) => (
          <PageSections
            key={entry.page.pageId}
            label={label}
            page={entry.page}
            tree={entry.tree}
            accent={plugin.hex}
          />
        ))}
      </StepBody>
    </StepShell>
  )
}
