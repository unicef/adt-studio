import { useCallback, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { RotateCcw, Search, X } from "lucide-react"
import type { EasyReadEntry, EasyReadSectionBlock } from "@/api/client"
import { PageThumb } from "@/components/app/screens/pipeline/canvas/PageThumb"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { FloatingSaveProvider } from "@/components/pipeline/components/floating-save"
import { UnsavedChangesGuard } from "@/components/pipeline/components/UnsavedChangesGuard"
import { PageLightbox } from "@/components/pipeline/components/PageLightbox"
import { VersionPicker } from "@/components/pipeline/components/VersionPicker"
import { easyReadVersionDiff } from "./shared/versionDiffs"
import { useRunEasyRead } from "@/components/pipeline/stages/easy-read/use-run-easy-read"
import { StepEmpty, StepLoading, StepRunning, StepShell, useStepLoading } from "./shared/StepShell"
import { DetailNavButton, SaveError, StepBody, StepEmptyHint, StepRail } from "./shared/ui"
import { EasyReadPageSection, type EasyReadPageGroup } from "./easy-read/EasyReadPageSection"
import { useEasyReadEdits } from "./easy-read/useEasyReadEdits"
import type { StepProps } from "./shared/types"

export function EasyReadStep(props: StepProps) {
  const { label, plugin } = props
  const { t } = useLingui()
  const run = useRunActivity()
  const stage = useStageActivity("easy-read")
  const { runEasyRead, hasApiKey } = useRunEasyRead(label)
  const edits = useEasyReadEdits(label)

  const [activePageId, setActivePageId] = useState<string | null>(null)
  const [lightboxPageId, setLightboxPageId] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const blocks = edits.blocks
  const versionDiff = useMemo(() => easyReadVersionDiff(t), [t])

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
      thumb: (
        <PageThumb label={label} pageId={pageId} sectionIndex={null} className="h-[52px] w-[38px]" />
      ),
    }))
  }, [blocks, label, t])

  const pageGroups = useMemo(() => {
    const scoped = activePageId ? blocks.filter((block) => block.pageId === activePageId) : blocks
    const query = search.trim().toLowerCase()
    const filtered = query
      ? scoped.filter((block) => {
          if (block.sectionType.toLowerCase().includes(query)) return true
          return block.entries.some(
            (entry) =>
              entry.originalText.toLowerCase().includes(query) ||
              entry.text.toLowerCase().includes(query),
          )
        })
      : scoped

    const groups: EasyReadPageGroup[] = []
    const indexByPage = new Map<string, number>()
    for (const block of filtered) {
      let index = indexByPage.get(block.pageId)
      if (index === undefined) {
        index = groups.length
        indexByPage.set(block.pageId, index)
        groups.push({ pageId: block.pageId, pageNumber: block.pageNumber, blocks: [] })
      }
      groups[index].blocks.push(block)
    }
    return groups
  }, [blocks, activePageId, search])

  const openPage = useCallback((pageId: string) => setLightboxPageId(pageId), [])

  const isRunning = stage.isActive
  const loading = useStepLoading(props, {
    isLoading: edits.isLoading,
    hasOutput: blocks.length > 0,
  })

  if (isRunning && blocks.length === 0) {
    return (
      <StepRunning
        {...props}
        stage={stage}
        isCancelling={run.isCancelling}
        onCancel={run.cancelRun}
        outcome={t`Simplified blocks show up here as each section is rewritten.`}
      />
    )
  }
  if (loading) return <StepLoading {...props} />
  if (blocks.length === 0) {
    return <StepEmpty {...props} onRun={() => void runEasyRead()} canRun={hasApiKey && !isRunning} />
  }

  const total = blocks.reduce((sum, block) => sum + block.entries.length, 0)
  const searchActive = search.trim().length > 0

  const versionPicker = (
    <VersionPicker
      step="easy-read"
      itemId="book"
      currentVersion={edits.version}
      saving={edits.saving}
      dirty={edits.dirty}
      bookLabel={label}
      onRestored={edits.discard}
      onSave={edits.save}
      onDiscard={edits.discard}
      diff={versionDiff}
    />
  )

  return (
    <StepShell
      {...props}
      chips={[t`${total} blocks`, t`${blocks.length} sections`]}
      headerExtra={versionPicker}
      canApply={total > 0}
      rail={
        <StepRail
          heading={<Trans>Blocks by page</Trans>}
          hex={plugin.hex}
          entries={[{ key: "", title: t`All pages`, count: total }, ...railEntries]}
          activeKey={activePageId ?? ""}
          onSelect={(key) => setActivePageId(key ? key : null)}
          footer={<Trans>Readers switch between the original text and these blocks.</Trans>}
        />
      }
    >
      <FloatingSaveProvider barClassName="bottom-27">
        <UnsavedChangesGuard />
        <StepBody
          title={<Trans>Easy Read</Trans>}
          meta={t`${total} blocks`}
          actions={
            <>
              <div className="relative w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t`Search original or Easy Read text…`}
                  aria-label={t`Search original or Easy Read text…`}
                  className="h-8 w-full rounded-lg border bg-background pl-8 pr-8 text-[12px] placeholder:text-muted-foreground/60 focus:border-brand-400 focus:outline-none focus:shadow-[0_0_0_3px_var(--brand-50)]"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label={t`Clear search`}
                    className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
              <DetailNavButton
                icon={RotateCcw}
                label={t`Regenerate Easy Read`}
                onClick={() => void runEasyRead()}
                disabled={!hasApiKey || isRunning || edits.dirty}
              >
                <Trans>Regenerate</Trans>
              </DetailNavButton>
            </>
          }
        >
          <SaveError error={edits.saveError} />

          {pageGroups.length === 0 ? (
            <StepEmptyHint>
              <span className="flex flex-col items-center gap-2">
                <Trans>No matching blocks</Trans>
                {searchActive && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="font-medium underline-offset-2 hover:underline"
                    style={{ color: plugin.hex }}
                  >
                    <Trans>Clear search</Trans>
                  </button>
                )}
              </span>
            </StepEmptyHint>
          ) : (
            pageGroups.map((group) => (
              <EasyReadPageSection
                key={group.pageId}
                label={label}
                group={group}
                accent={plugin.hex}
                disabled={isRunning || edits.saving}
                onUpdateEntry={edits.updateEntry}
                onOpenPage={openPage}
              />
            ))
          )}
        </StepBody>
      </FloatingSaveProvider>

      <PageLightbox
        bookLabel={label}
        pageId={lightboxPageId}
        open={lightboxPageId != null}
        onOpenChange={(open) => {
          if (!open) setLightboxPageId(null)
        }}
      />
    </StepShell>
  )
}
