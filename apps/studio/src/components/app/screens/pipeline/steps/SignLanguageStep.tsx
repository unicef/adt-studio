import { useCallback, useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { TriangleAlert } from "lucide-react"
import type { SignLanguageVideo } from "@/api/client"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { useDeleteSignLanguageVideo, useAssignSignLanguageVideo } from "@/hooks/use-sign-language-videos"
import { useStageStatus } from "@/hooks/use-stage-status"
import { StepEmpty, StepLoading, StepShell, useStepLoading } from "./shared/StepShell"
import { StepBody, StepRail } from "./shared/ui"
import { ProblemNotice } from "./shared/problems/ProblemNotice"
import { useStageSurface } from "./shared/useStageSurface"
import { RemoveAllDialog } from "./sign-language/RemoveAllDialog"
import { SectionTools } from "./sign-language/SectionTools"
import { SignLanguageHeaderActions } from "./sign-language/SignLanguageHeaderActions"
import { SignLanguageManage } from "./sign-language/SignLanguageManage"
import { VideoFilterEmpty } from "./sign-language/VideoFilterEmpty"
import { VideoGrid } from "./sign-language/VideoGrid"
import { VideoPlayerDialog } from "./sign-language/VideoPlayerDialog"
import { ALL_VIDEOS, NOT_PLACED, useSignLanguageModel, type VideoFilter } from "./sign-language/useSignLanguageModel"
import { useSignLanguageNotes } from "./sign-language/useSignLanguageNotes"
import { useSignLanguageRail } from "./sign-language/useSignLanguageRail"
import { VIDEO_ACCEPT, useVideoUploads, type PendingUpload } from "./sign-language/useVideoUploads"
import type { StepProps } from "./shared/types"

export function SignLanguageStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t } = useLingui()
  const model = useSignLanguageModel(label, pages)
  const { videos, sections, covered, total } = model
  const remove = useDeleteSignLanguageVideo(label)
  const assign = useAssignSignLanguageVideo(label)
  const uploads = useVideoUploads(label, videos)
  const storyboardReady = useStageStatus("storyboard").isCompleted
  const fileInput = useRef<HTMLInputElement>(null)
  const target = useRef<string | null>(null)

  const [filter, setFilter] = useState<VideoFilter>(ALL_VIDEOS)
  const [manageOpen, setManageOpen] = useState(false)
  const [removeAllOpen, setRemoveAllOpen] = useState(false)
  const [playing, setPlaying] = useState<SignLanguageVideo | null>(null)

  const canUpload = storyboardReady && sections.length > 0
  const uploadReason = !storyboardReady ? (
    <Trans>Run {getStageLabelI18n("storyboard")} first. Videos go on the sections it makes.</Trans>
  ) : sections.length === 0 ? (
    <Trans>This book has no sections to put videos on yet.</Trans>
  ) : null

  const pick = useCallback((sectionId: string | null) => {
    target.current = sectionId
    fileInput.current?.click()
  }, [])

  const pendingMatches = useCallback(
    (item: PendingUpload, value: VideoFilter) => {
      if (value === ALL_VIDEOS) return true
      const page = item.target ? model.sectionById.get(item.target)?.pageNumber : undefined
      if (value === NOT_PLACED) return page === undefined
      return page !== undefined && String(page) === value
    },
    [model.sectionById],
  )

  const onFiles = (files: File[]) => {
    const sectionId = target.current
    target.current = null
    if (files.length === 0) return
    const page = sectionId ? model.sectionById.get(sectionId)?.pageNumber : undefined
    const shows = filter === ALL_VIDEOS || (filter === NOT_PLACED ? !sectionId : page !== undefined && String(page) === filter)
    if (!shows) setFilter(ALL_VIDEOS)
    uploads.add(files, sectionId)
  }

  const assignVideo = useCallback((videoId: string, sectionId: string | null) => assign.mutate({ videoId, sectionId }), [assign])
  const deleteVideo = useCallback((videoId: string) => remove.mutate(videoId), [remove])
  const showUnplaced = useCallback(() => setFilter(NOT_PLACED), [])
  const openPage = useCallback(
    (pageId: string) => {
      const page = pages.find((candidate) => candidate.pageId === pageId)
      if (page) setFilter(String(page.pageNumber))
    },
    [pages],
  )

  const notes = useSignLanguageNotes(model, showUnplaced)
  const railEntries = useSignLanguageRail(model)
  const surface = useStageSurface({
    label,
    slug: plugin.slug,
    hex: plugin.hex,
    pages,
    ready: covered > 0,
    outcome: null,
    hint: {
      title: t`How sign language works`,
      body: t`Each section of the book can have one sign language video. Upload your videos, then choose the page each one belongs to. Readers see it in a small player beside that passage. A video that isn't on a page never reaches the book.`,
    },
    notes,
    onOpenPage: openPage,
    hasOutput: videos.length > 0,
    hintOpen: true,
  })

  const shown = useMemo(() => videos.filter((video) => model.matches(video, filter)), [videos, model, filter])
  const pendingShown = useMemo(() => uploads.pending.filter((item) => pendingMatches(item, filter)), [uploads.pending, pendingMatches, filter])

  const loading = useStepLoading(props, { isLoading: model.isLoading, hasOutput: videos.length > 0 })
  if (loading) return <StepLoading {...props} shape="list" />
  if (videos.length === 0 && uploads.pending.length === 0) return <StepEmpty {...props} prerequisites={[]} onRun={() => pick(null)} onManual={() => pick(null)} />

  const coverage = t`${covered} of ${plural(total, { one: "# section", other: "# sections" })} covered`
  const count =
    filter === ALL_VIDEOS
      ? t`${plural(videos.length, { one: "# video", other: "# videos" })}`
      : t`${shown.length} of ${plural(videos.length, { one: "# video", other: "# videos" })}`
  const deletingId = remove.isPending ? (remove.variables ?? null) : null
  const actionError = assign.error ? { title: t`Couldn't move the video`, error: assign.error } : remove.error ? { title: t`Couldn't remove the video`, error: remove.error } : null

  return (
    <StepShell
      {...props}
      chips={[]}
      rail={
        <StepRail
          heading={<Trans>Videos by page</Trans>}
          hex={plugin.hex}
          entries={railEntries}
          activeKey={filter}
          onSelect={(key) => setFilter(key ?? ALL_VIDEOS)}
          searchPlaceholder={t`Find a page or file`}
          footer={<Trans>Pick a page for a video so it plays alongside that passage.</Trans>}
        />
      }
    >
      <StepBody
        title={getStageLabelI18n("sign-language")}
        meta={`${coverage} · ${count}`}
        titleExtra={surface.help}
        actions={<SignLanguageHeaderActions canUpload={canUpload} uploadReason={uploadReason} onUpload={() => pick(null)} onRemoveAll={() => setRemoveAllOpen(true)} />}
      >
        <input
          ref={fileInput}
          type="file"
          accept={VIDEO_ACCEPT}
          multiple
          aria-label={t`Upload sign language videos`}
          className="hidden"
          onChange={(event) => {
            onFiles(Array.from(event.target.files ?? []))
            event.target.value = ""
          }}
        />

        {surface.top}

        <SectionTools
          hex={plugin.hex}
          covered={covered}
          total={total}
          nextMissing={model.nextMissing}
          nextUploading={model.nextMissing ? uploads.uploadingTarget(model.nextMissing.sectionId) : false}
          canUpload={canUpload}
          uploadReason={uploadReason}
          onAddNext={pick}
          onManage={() => setManageOpen(true)}
        />

        {actionError && <ProblemNotice level="blocked" icon={TriangleAlert} title={actionError.title} body={actionError.error.message} />}

        {shown.length === 0 && pendingShown.length === 0 ? (
          <VideoFilterEmpty filter={filter} onShowAll={() => setFilter(ALL_VIDEOS)} />
        ) : (
          <VideoGrid
            label={label}
            hex={plugin.hex}
            model={model}
            videos={shown}
            pending={pendingShown}
            assigningId={assign.isPending ? (assign.variables?.videoId ?? null) : null}
            deletingId={deletingId}
            onAssign={assignVideo}
            onDelete={deleteVideo}
            onRetry={uploads.retry}
            onDismiss={uploads.dismiss}
          />
        )}
      </StepBody>

      <SignLanguageManage
        label={label}
        hex={plugin.hex}
        model={model}
        open={manageOpen}
        onOpenChange={setManageOpen}
        uploading={uploads.busy}
        deletingId={deletingId}
        onUpload={(sectionId) => pick(sectionId)}
        onAssign={assignVideo}
        onDelete={deleteVideo}
        onPlay={setPlaying}
      />
      <RemoveAllDialog label={label} videos={videos} open={removeAllOpen} onOpenChange={setRemoveAllOpen} />
      <VideoPlayerDialog label={label} video={playing} onClose={() => setPlaying(null)} />
    </StepShell>
  )
}
