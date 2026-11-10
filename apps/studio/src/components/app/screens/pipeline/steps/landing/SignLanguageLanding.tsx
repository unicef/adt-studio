import { useMemo, useRef, useState, type ReactNode } from "react"
import { Trash2, TriangleAlert, Upload } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { StepLandingShell } from "./StepLandingShell"
import { SettingsCard } from "./ui/SettingsCard"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import { STAGES } from "@/components/pipeline/stage-config"
import { useStageStatus } from "@/hooks/use-stage-status"
import { usePages } from "@/hooks/use-pages"
import {
  useUploadSignLanguageVideo,
  useAssignSignLanguageVideo,
  useDeleteSignLanguageVideo,
} from "@/hooks/use-sign-language-videos"
import type { SignLanguageVideo } from "@/api/client"
import { usePipelineNavigation } from "@/components/app/screens/pipeline/shared/usePipelineNavigation"
import { SignLanguageReaderPreview } from "@/components/pipeline/stages/sign-language/components/SignLanguageReaderPreview"
import { ProblemNotice } from "../shared/problems/ProblemNotice"
import { StepActionButton } from "../shared/StepActionButton"
import { RemoveAllDialog } from "../sign-language/RemoveAllDialog"
import { SectionTools } from "../sign-language/SectionTools"
import { SignLanguageManage } from "../sign-language/SignLanguageManage"
import { UnassignedPool } from "../sign-language/UnassignedPool"
import { VideoPlayerDialog } from "../sign-language/VideoPlayerDialog"
import { useSignLanguageModel } from "../sign-language/useSignLanguageModel"
import { VIDEO_ACCEPT } from "../sign-language/useVideoUploads"

const FALLBACK_HEX = "#0891b2"

export function SignLanguageLanding({ bookLabel, beforeRun }: { bookLabel: string; beforeRun?: ReactNode }) {
  const { t } = useLingui()
  const hex = STAGES.find((stage) => stage.slug === "sign-language")?.hex ?? FALLBACK_HEX
  const storyboardReady = useStageStatus("storyboard").isCompleted
  const nav = usePipelineNavigation(bookLabel)

  const { data: pages } = usePages(bookLabel)
  const uploadMutation = useUploadSignLanguageVideo(bookLabel)
  const assignMutation = useAssignSignLanguageVideo(bookLabel)
  const deleteMutation = useDeleteSignLanguageVideo(bookLabel)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const targetSectionRef = useRef<string | null>(null)
  const [playingVideo, setPlayingVideo] = useState<SignLanguageVideo | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)

  const model = useSignLanguageModel(bookLabel, pages)
  const { videos, sections: sectionEntries } = model
  const unassignedVideos = useMemo(() => videos.filter((v) => !v.sectionId), [videos])

  const canUpload = storyboardReady && !uploadMutation.isPending
  const uploadReason = !storyboardReady ? <Trans>Run {getStageLabelI18n("storyboard")} first. Videos go on the sections it makes.</Trans> : null

  const handleUploadForSection = (sectionId: string | null) => {
    targetSectionRef.current = sectionId
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const target = targetSectionRef.current
    targetSectionRef.current = null

    const fileList = target ? [files[0]] : Array.from(files)
    for (const file of fileList) {
      uploadMutation.mutate(file, {
        onSuccess: (data) => {
          if (target && data?.videoId) {
            assignMutation.mutate({ videoId: data.videoId, sectionId: target })
          }
        },
      })
    }
    e.target.value = ""
  }

  const handleAssign = (videoId: string, sectionId: string | null) => {
    assignMutation.mutate({ videoId, sectionId })
  }

  const handleDelete = (videoId: string) => {
    setPendingDeleteId(videoId)
    deleteMutation.mutate(videoId, {
      onSettled: () => setPendingDeleteId(null),
    })
  }

  return (
    <StepLandingShell
      title={getStageLabelI18n("sign-language")}
      description={<Trans> Upload sign-language videos for each section of the book. The reader shows the matching video in a small player as the user scrolls through the page. </Trans>}
      beforeRun={beforeRun}
      bookLabel={bookLabel}
      stageSlug="sign-language"
      isRunning={false}
      isCompleted={false}
      hasError={false}
      canRun={false}
      hideRunButton
      runLabel={null}
      rerunLabel={null}
      previewLabel={t`Sign Language Preview`}
      onRun={() => {}}
      preview={<SignLanguageReaderPreview hasAnyVideo={videos.length > 0} accent={hex} />}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={VIDEO_ACCEPT}
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {!storyboardReady && (
        <ProblemNotice
          level="partial"
          hex={hex}
          icon={TriangleAlert}
          title={<Trans>Run {getStageLabelI18n("storyboard")} first</Trans>}
          body={<Trans>Each sign language video goes on one Storyboard section, so there's nothing to match videos to yet.</Trans>}
          action={{ label: <Trans>Go to {getStageLabelI18n("storyboard")}</Trans>, onClick: nav.openWorkspace }}
        />
      )}

      {(storyboardReady || sectionEntries.length > 0) && (
        <SettingsCard className="gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">
              <Trans>Videos</Trans>
            </span>
            <div className="flex items-center gap-1.5">
              {videos.length > 0 && (
                <StepActionButton icon={Trash2} tone="danger" onClick={() => setConfirmDeleteAll(true)}>
                  <Trans>Remove all</Trans>
                </StepActionButton>
              )}
              <StepActionButton look="header" icon={Upload} onClick={() => handleUploadForSection(null)} disabled={!canUpload} disabledReason={uploadReason}>
                <Trans>Add videos</Trans>
              </StepActionButton>
            </div>
          </div>

          <UnassignedPool
            label={bookLabel}
            hex={hex}
            videos={unassignedVideos}
            sections={sectionEntries}
            assigning={assignMutation.isPending}
            deletingId={pendingDeleteId}
            onPlay={setPlayingVideo}
            onAssign={handleAssign}
            onDelete={handleDelete}
          />

          {sectionEntries.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[12px] text-muted-foreground">
              <Trans>This book has no sections to put videos on yet.</Trans>
            </p>
          ) : (
            <SectionTools
              hex={hex}
              covered={model.covered}
              total={model.total}
              nextMissing={model.nextMissing}
              nextUploading={uploadMutation.isPending}
              canUpload={canUpload}
              uploadReason={uploadReason}
              onAddNext={handleUploadForSection}
              onManage={() => setManageOpen(true)}
            />
          )}
        </SettingsCard>
      )}

      <VideoPlayerDialog label={bookLabel} video={playingVideo} onClose={() => setPlayingVideo(null)} />
      <RemoveAllDialog label={bookLabel} videos={videos} open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll} />
      <SignLanguageManage
        label={bookLabel}
        hex={hex}
        model={model}
        open={manageOpen}
        onOpenChange={setManageOpen}
        uploading={uploadMutation.isPending}
        deletingId={pendingDeleteId}
        onUpload={handleUploadForSection}
        onAssign={handleAssign}
        onDelete={handleDelete}
        onPlay={setPlayingVideo}
      />
    </StepLandingShell>
  )
}
