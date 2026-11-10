import { useCallback, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { WordTimestamp } from "@/api/client"
import { useVariant } from "@/components/app/lab/variants"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { PROVIDER_LABELS } from "@/components/pipeline/stages/languages/lib/provider-labels"
import type { CatalogCategory } from "@/components/pipeline/stages/languages/lib/catalog-entries"
import { useStageActivity } from "@/components/app/screens/pipeline/runs/useRunActivity"
import { useStageRerun } from "@/components/app/screens/pipeline/runs/useStageRerun"
import { useRerunConfirm } from "@/components/app/screens/pipeline/runs/useRerunConfirm"
import { useStepPrereq } from "@/components/app/screens/pipeline/runs/useStepPrereq"
import { useBookRun } from "@/hooks/use-book-run"
import { useBookTasks } from "@/hooks/use-book-tasks"
import { normalizeLocale } from "@/lib/languages"
import { NoMatches } from "./shared/list/NoMatches"
import { StepShell, useStepEmptyView, useStepLoading, useStepLoadingView } from "./shared/StepShell"
import { StepSearch } from "./shared/StepSearch"
import { StepVersionPicker } from "./shared/StepVersionPicker"
import { StepBody, StepEmptyHint, StepRail, STEP_FILL_VIEWPORT_CLASSNAME } from "./shared/ui"
import { useStageSurface } from "./shared/useStageSurface"
import { speechVersionDiff } from "./shared/versionDiffs"
import { SpeechClipList } from "./speech/SpeechClipList"
import type { ClipAbility } from "./speech/SpeechClipRow"
import { SpeechFailedNotice } from "./speech/SpeechFailedNotice"
import { SpeechHeaderActions } from "./speech/SpeechHeaderActions"
import { SpeechToolbar } from "./speech/SpeechToolbar"
import { filterRows, type ClipFilter } from "./speech/speechRows"
import { languageName } from "./speech/languageName"
import { useSpeechModel } from "./speech/useSpeechModel"
import { useSpeechNotes } from "./speech/useSpeechNotes"
import { useSpeechProviders } from "./speech/useSpeechProviders"
import type { StepProps } from "./shared/types"

export function SpeechStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t, i18n } = useLingui()
  const friendly = useVariant("features") === "suggested"
  const stageName = getStageLabelI18n("speech")
  const activity = useStageActivity("speech")
  const { stageState } = useBookRun()
  const { isTaskRunning } = useBookTasks(label)
  const prereq = useStepPrereq(label, "speech")
  const providers = useSpeechProviders(label)
  const model = useSpeechModel(label)
  const { language, baseLanguage, rows, counts, audio, exclusions, slot } = model

  const [clip, setClip] = useState<ClipFilter>("all")
  const [category, setCategory] = useState<CatalogCategory>("all")
  const [pageId, setPageId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [compare, setCompare] = useState(false)

  const pageById = useMemo(() => new Map(pages.map((page) => [page.pageId, page])), [pages])
  const pageNumberOf = useCallback((id: string | null) => (id ? (pageById.get(id)?.pageNumber ?? null) : null), [pageById])
  const pageOptions = useMemo(() => {
    const used = new Set(rows.map((row) => row.pageId))
    return pages.filter((page) => used.has(page.pageId)).map((page) => ({ pageId: page.pageId, pageNumber: page.pageNumber }))
  }, [pages, rows])
  const page = pageId ? (pageOptions.find((option) => option.pageId === pageId) ?? null) : null

  const activeClip: ClipFilter = clip === "failed" && counts.failed === 0 ? "all" : clip
  const shown = useMemo(
    () => filterRows(rows, { clip: activeClip, category, pageId: page?.pageId ?? null, search }),
    [rows, activeClip, category, page, search],
  )

  const state = stageState("speech")
  const rerun = useStageRerun(label, "speech")
  const confirm = useRerunConfirm("speech", rerun)
  const missingProvider = model.languages.map((code) => providers.providerFor(code, "primary")).find((id) => !providers.isProviderReady(id))
  const providerName = (id: string) => PROVIDER_LABELS[id] ?? id
  const voiceReason = missingProvider ? t`Add a ${providerName(missingProvider)} key in AI access to create audio.` : null
  const lockReason = t`Editing is paused until ${stageName} finishes.`
  const locked = activity.isActive
  const toCreate = counts.missing + counts.failed
  const runAction = {
    label: toCreate > 0 ? t`Create missing audio` : t`Create audio again`,
    missing: toCreate > 0,
    onClick: confirm.request,
    disabled: locked || !confirm.canRun || !!voiceReason,
    reason: locked ? lockReason : (confirm.disabledReason ?? voiceReason),
  }

  const missingTiming = useMemo(() => rows.filter((row) => row.state === "ready" && !audio.timestampsById[row.id]).length, [rows, audio.timestampsById])
  const showMissing = useCallback(() => setClip("missing"), [])
  const notes = useSpeechNotes({
    label,
    rows,
    counts,
    settled: (state === "done" || state === "error") && !locked,
    locked,
    lockReason,
    hasTranscriber: providers.hasTranscriber,
    wantsTiming: model.wordHighlighting || Object.keys(audio.timestampsById).length > 0,
    missingTiming,
    run: runAction,
    onMute: exclusions.muteMany,
    onShowMissing: showMissing,
  })

  const surface = useStageSurface({
    label,
    slug: "speech",
    hex: plugin.hex,
    pages,
    ready: counts.ready > 0,
    outcome: lockReason,
    hint: {
      title: t`How read aloud works`,
      body: t`Every text in the book was turned into speech in each language. Play a clip to check it, replace it with your own recording, or mute it so it isn't read aloud. Edit what is read when a word is said wrong, then create that clip again.`,
    },
    notes,
    onOpenPage: setPageId,
    onShowFailed: () => setClip("failed"),
    hasOutput: model.hasAudio,
    hintOpen: true,
  })

  const ability: ClipAbility = useMemo(
    () => ({
      canGenerate: providers.canSynthesize(language, slot),
      generateReason: providers.canSynthesize(language, slot)
        ? null
        : t`Add a ${providerName(providers.providerFor(language, slot))} key in AI access to create audio.`,
      hasTranscriber: providers.hasTranscriber,
      locked,
      lockReason,
    }),
    [providers, language, slot, locked, lockReason, t],
  )

  const busy = useMemo(
    () => ({
      generating: audio.generate.isPending ? audio.generate.variables : undefined,
      uploading: audio.upload.isPending ? audio.upload.variables?.textId : undefined,
      transcribing: audio.transcribe.isPending ? audio.transcribe.variables : undefined,
      savingTimestamps: audio.saveTimestamps.isPending ? audio.saveTimestamps.variables?.textId : undefined,
    }),
    [
      audio.generate.isPending, audio.generate.variables,
      audio.upload.isPending, audio.upload.variables,
      audio.transcribe.isPending, audio.transcribe.variables,
      audio.saveTimestamps.isPending, audio.saveTimestamps.variables,
    ],
  )

  const uploadOne = audio.upload.mutate
  const saveTimestampsOne = audio.saveTimestamps.mutate
  const handleUpload = useCallback((textId: string, file: File) => uploadOne({ textId, file }), [uploadOne])
  const handleSaveTimestamps = useCallback(
    (textId: string, words: WordTimestamp[], duration: number) => saveTimestampsOne({ textId, words, duration }),
    [saveTimestampsOne],
  )
  const versionDiff = useMemo(() => speechVersionDiff(t), [t])

  const loading = useStepLoading(props, { isLoading: model.isLoading, hasOutput: model.hasAudio })
  const loadingView = useStepLoadingView(props, { shape: "list" })
  const ttsReady = providers.isProviderReady(providers.defaultProvider)
  const emptyView = useStepEmptyView({
    ...props,
    canRun: prereq.isMet && ttsReady,
    runDisabledReason: ttsReady ? undefined : <Trans>Add a {providerName(providers.defaultProvider)} key in AI access to create the audio.</Trans>,
    prerequisites: [
      ...(prereq.upstream
        ? [
            {
              key: "upstream",
              met: prereq.isMet,
              label: prereq.upstreamInFlight
                ? t`${prereq.upstreamLabel} in progress — this stage waits its turn`
                : t`${prereq.upstreamLabel} finished`,
            },
          ]
        : []),
      {
        key: "api-key",
        met: ttsReady,
        label: ttsReady
          ? t`Voice provider ready — ${providerName(providers.defaultProvider)}`
          : t`Voice provider needs a key — ${providerName(providers.defaultProvider)}`,
      },
    ],
  })

  const notRun = !model.hasAudio && state !== "done" && state !== "error"
  const phaseView = activity.isActive && !model.hasAudio ? emptyView : loading ? loadingView : notRun || rows.length === 0 ? emptyView : null
  if (phaseView) return <StepShell {...props} {...phaseView} />

  const currentName = languageName(language, i18n.locale)
  const baseName = languageName(baseLanguage, i18n.locale)
  const meta = [
    t`${plural(counts.total, { one: "# clip", other: "# clips" })}`,
    counts.missing + counts.waiting > 0 ? t`${counts.missing + counts.waiting} without audio` : null,
    counts.failed > 0 ? t`${counts.failed} failed` : null,
    counts.muted > 0 ? t`${counts.muted} not read aloud` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const filtered = activeClip !== "all" || category !== "all" || !!page
  const clearFilters = () => {
    setClip("all")
    setCategory("all")
    setPageId(null)
  }

  return (
    <StepShell
      {...props}
      chips={[]}
      headerExtra={
        <StepVersionPicker
          label={label}
          step="core-tts-catalog"
          itemId={normalizeLocale(language)}
          currentVersion={model.speechVersion}
          diff={versionDiff}
        />
      }
      bodyViewportClassName={STEP_FILL_VIEWPORT_CLASSNAME}
      rail={
        <StepRail
          heading={friendly ? <Trans>Read-aloud languages</Trans> : <Trans>Narration languages</Trans>}
          hex={plugin.hex}
          searchPlaceholder={t`Find a language`}
          entries={model.languages.map((code) => ({
            key: code,
            title: languageName(code, i18n.locale),
            subtitle: code === baseLanguage ? t`${code} · Book language` : code,
            count: model.audioCount(code),
            emptySubtitle: null,
          }))}
          activeKey={language}
          onSelect={(key) => key && model.setLanguage(key)}
          footer={<Trans>Counts show how many clips have audio in each language.</Trans>}
        />
      }
    >
      <StepBody
        title={stageName}
        meta={meta}
        titleExtra={surface.help}
        actions={
          <SpeechHeaderActions
            hex={plugin.hex}
            languageName={currentName}
            search={
              <StepSearch
                value={search}
                onChange={setSearch}
                placeholder={t`Search spoken text…`}
                ariaLabel={t`Search spoken text and clip IDs`}
                matches={{ shown: shown.length, total: rows.length }}
                className="w-[200px] xl:w-[260px]"
              />
            }
            run={runAction}
            transcribeAll={{
              onConfirm: () => audio.transcribeAll.mutate(),
              disabled: !providers.hasTranscriber || counts.ready === 0 || locked || audio.transcribeAll.isPending || isTaskRunning("transcribe-timestamps"),
              reason: !providers.hasTranscriber
                ? t`Word timing needs an OpenAI key in AI access.`
                : isTaskRunning("transcribe-timestamps") || audio.transcribeAll.isPending
                  ? t`Word timing is already being added.`
                  : locked
                    ? lockReason
                    : null,
            }}
            deleteAll={{
              onConfirm: () => audio.deleteAll.mutate(),
              disabled: !model.hasAudio || locked || audio.deleteAll.isPending,
              reason: locked ? lockReason : null,
            }}
          />
        }
      >
        {!locked && !surface.problem && (
          <SpeechFailedNotice hex={plugin.hex} count={counts.failed} onShow={() => setClip("failed")} retry={runAction} />
        )}
        {surface.top}
        {confirm.dialogs}
        <SpeechToolbar
          hex={plugin.hex}
          counts={counts}
          categories={model.categories}
          clip={activeClip}
          onClip={setClip}
          category={category}
          onCategory={setCategory}
          voices={model.voices}
          slot={slot}
          onSlot={model.setSlot}
          compare={compare}
          onCompare={setCompare}
          baseLanguageName={baseName}
          showCompare={!model.isBase}
          pages={pageOptions}
          page={page}
          onPage={setPageId}
          shown={shown.length}
        />
        {shown.length === 0 ? (
          search.trim() ? (
            <NoMatches query={search} noun={t`clips`} onClear={() => setSearch("")} />
          ) : (
            <StepEmptyHint>
              <span className="flex flex-col items-center gap-2">
                {filtered ? t`No clips match these filters.` : t`Nothing to read aloud in ${currentName} yet.`}
                {filtered && (
                  <button type="button" onClick={clearFilters} className="font-medium text-foreground underline-offset-4 transition-colors hover:underline">
                    {t`Clear filters`}
                  </button>
                )}
              </span>
            </StepEmptyHint>
          )
        ) : (
          <SpeechClipList
            key={`${language}:${slot}`}
            rows={shown}
            label={label}
            language={language}
            baseLanguage={baseLanguage}
            baseLanguageName={baseName}
            hex={plugin.hex}
            compare={compare && !model.isBase}
            pageNumberOf={pageNumberOf}
            speechById={model.speechById}
            timestampsById={audio.timestampsById}
            errorFor={audio.errorFor}
            exclusionFor={exclusions.exclusionFor}
            mutedIdSet={exclusions.excludedIdSet}
            ability={ability}
            busy={busy}
            onToggleMute={exclusions.toggle}
            onGenerate={audio.generate.mutate}
            onUpload={handleUpload}
            onTranscribe={audio.transcribe.mutate}
            onSaveTimestamps={handleSaveTimestamps}
          />
        )}
      </StepBody>
    </StepShell>
  )
}
