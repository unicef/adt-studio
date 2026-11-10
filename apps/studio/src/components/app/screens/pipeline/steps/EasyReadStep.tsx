import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { PageLightbox } from "@/components/pipeline/components/PageLightbox"
import { useRunEasyRead } from "@/components/pipeline/stages/easy-read/use-run-easy-read"
import { useRunActivity, useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { usePageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView, useStepRunningView } from "./shared/StepShell"
import { StepVersionPicker } from "./shared/StepVersionPicker"
import { easyReadVersionDiff } from "./shared/versionDiffs"
import { StepRail } from "./shared/ui"
import { usePageNav } from "./shared/usePageNav"
import { useStageSurface } from "./shared/useStageSurface"
import { EasyReadOverview } from "./easy-read/EasyReadOverview"
import { EasyReadPageView } from "./easy-read/page/EasyReadPageView"
import { useEasyReadEdits } from "./easy-read/useEasyReadEdits"
import { useEasyReadPages } from "./easy-read/useEasyReadPages"
import { useEasyReadRail } from "./easy-read/useEasyReadRail"
import type { StepProps } from "./shared/types"

export function EasyReadStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const run = useRunActivity()
  const activity = useStageActivity("easy-read")
  const { runEasyRead, hasStructuredTextProvider } = useRunEasyRead(label)
  const edits = useEasyReadEdits(label, { locked: activity.isActive, accent: plugin.hex })
  const [search, setSearch] = useState("")
  const [lightboxPageId, setLightboxPageId] = useState<string | null>(null)

  const data = useEasyReadPages(pages, edits.blocks, search)
  const aspect = usePageAspect(label, data.navPages)
  const nav = usePageNav({ label, slug: plugin.slug, pages: data.navPages, allPages: pages })
  const hasOutput = edits.blocks.length > 0
  const name = getStageLabelI18n("easy-read")

  const surface = useStageSurface({
    label,
    slug: "easy-read",
    hex: plugin.hex,
    pages,
    ready: hasOutput,
    hasOutput,
    outcome: t`Editing is paused until ${name} finishes.`,
    hint: {
      title: t`How Easy Read works`,
      body: t`Each block was simplified by AI. Edit any Easy Read text to refine it against the original, then Save. Changes are stored as a new version, so you can always roll back or regenerate.`,
    },
    onOpenPage: nav.open,
  })
  const { marks } = surface
  const isFailed = marks.isFailed

  const railEntries = useEasyReadRail(label, data.navPages, { aspect, total: data.total, blocksOn: data.blocksOn, isFailed })
  const versionDiff = useMemo(() => easyReadVersionDiff(t), [t])

  const loading = useStepLoading(props, { isLoading: edits.isLoading, hasOutput })
  const runningView = useStepRunningView({
    ...props,
    stage: activity,
    isCancelling: run.isCancelling,
    onCancel: run.cancelRun,
    outcome: t`Simplified blocks show up here as each section is rewritten.`,
  })
  const loadingView = useStepLoadingView(props, { shape: "list" })
  const emptyView = useStepEmptyView({ ...props, onRun: () => void runEasyRead(), canRun: hasStructuredTextProvider && !activity.isActive })
  const phaseView = activity.isActive && !hasOutput ? runningView : loading ? loadingView : !hasOutput ? emptyView : null
  if (phaseView) return <StepShell {...props} {...phaseView} />

  const selected = nav.selected
  const blocksLabel = t`${plural(data.total, { one: "# block", other: "# blocks" })}`
  const regenerateReason = surface.locked
    ? t`Wait for ${name} to finish.`
    : surface.retry.canRun
      ? null
      : (surface.retry.reason ?? t`Wait for the current run to finish.`)

  return (
    <StepShell
      {...props}
      chips={[blocksLabel]}
      headerExtra={
        <StepVersionPicker
          label={label}
          step="easy-read"
          currentVersion={edits.version}
          isSaving={edits.saving}
          dirty={edits.dirty}
          onRestored={edits.discard}
          diff={versionDiff}
        />
      }
      rail={
        <StepRail
          heading={<Trans>Blocks by page</Trans>}
          hex={plugin.hex}
          entries={railEntries}
          activeKey={selected?.pageId ?? ""}
          onSelect={(key) => (key ? nav.open(key) : nav.close())}
          footer={<Trans>Readers switch between the original text and these blocks.</Trans>}
        />
      }
    >
      {selected ? (
        <EasyReadPageView
          key={selected.pageId}
          label={label}
          pageId={selected.pageId}
          pageNumber={selected.pageNumber}
          hex={plugin.hex}
          blocks={data.blocksOn(selected.pageId)}
          locked={surface.locked}
          saveError={edits.saveError}
          isEdited={edits.isEntryEdited}
          onUpdate={edits.updateEntry}
          prevPageId={nav.prevId}
          nextPageId={nav.nextId}
          onStep={nav.step}
          onClose={nav.close}
          problem={surface.problem}
          retry={surface.retry}
        />
      ) : (
        <EasyReadOverview
          label={label}
          meta={blocksLabel}
          top={surface.top}
          help={surface.help}
          data={data}
          jumpPages={data.navPages}
          aspect={aspect}
          search={search}
          onSearch={setSearch}
          locked={surface.locked}
          saveError={edits.saveError}
          regenerate={{ run: surface.retry.run, disabledReason: regenerateReason }}
          isFailed={isFailed}
          isEdited={edits.isEntryEdited}
          onUpdate={edits.updateEntry}
          onOpenPage={nav.open}
          onPreview={setLightboxPageId}
        />
      )}

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
