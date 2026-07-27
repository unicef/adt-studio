import { useMemo, useRef, useState } from "react"
import {
  CheckCircle2,
  ListTree,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { LandingPageShell } from "@/components/pipeline/components/LandingPageShell"
import { LandingPageWarning } from "@/components/pipeline/components/LandingPageWarning"
import { SettingsCard } from "@/components/pipeline/components/SettingsCard"
import { getStageLabelI18n } from "@/components/pipeline/pipeline-i18n"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStageStatus } from "@/hooks/use-stage-status"
import { usePages } from "@/hooks/use-pages"
import {
  useSignLanguageVideos,
  useUploadSignLanguageVideo,
  useAssignSignLanguageVideo,
  useDeleteSignLanguageVideo,
} from "@/hooks/use-sign-language-videos"
import { getSignLanguageVideoUrl } from "@/api/client"
import type { SignLanguageVideo } from "@/api/client"
import { isGlossaryVideoSectionId } from "@/lib/glossary-video"
import { ManageSectionsDialog } from "./components/ManageSectionsDialog"
import { SignLanguageReaderPreview } from "./components/SignLanguageReaderPreview"
import type { FilterValue, SectionEntry } from "./components/types"

export function SignLanguageLandingPage({ bookLabel }: { bookLabel: string }) {
  const { t, i18n } = useLingui()
  const storyboardStatus = useStageStatus("storyboard")
  const storyboardReady = storyboardStatus.isCompleted

  const { data: videosData } = useSignLanguageVideos(bookLabel)
  const { data: pages } = usePages(bookLabel)
  const uploadMutation = useUploadSignLanguageVideo(bookLabel)
  const assignMutation = useAssignSignLanguageVideo(bookLabel)
  const deleteMutation = useDeleteSignLanguageVideo(bookLabel)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const targetSectionRef = useRef<string | null>(null)
  const [playingVideo, setPlayingVideo] = useState<SignLanguageVideo | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterValue>("missing")
  const [manageOpen, setManageOpen] = useState(false)

  // Videos attached to glossary items (sectionId like `gl001` / `gl_manual_*`)
  // are managed from the Glossary stage — keep them out of the page-section
  // lists and counts here.
  const videos = useMemo(
    () => (videosData?.videos ?? []).filter((v) => !isGlossaryVideoSectionId(v.sectionId)),
    [videosData],
  )

  // Flat list of sections in book order
  const sectionEntries = useMemo<SectionEntry[]>(() => {
    if (!pages) return []
    return pages.flatMap((page) => {
      const sections = (page.sections ?? []).filter((s) => !s.isPruned)
      if (sections.length === 0) return []
      if (sections.length === 1) {
        const s = sections[0]
        return [
          {
            sectionId: s.sectionId,
            sectionIndex: s.sectionIndex,
            pageNumber: page.pageNumber,
            pageLabel: i18n._(msg`Page ${page.pageNumber}`),
            sectionLabel: i18n._(msg`Page ${page.pageNumber}`),
          },
        ]
      }
      return sections.map((s, i) => ({
        sectionId: s.sectionId,
        sectionIndex: s.sectionIndex,
        pageNumber: page.pageNumber,
        pageLabel: i18n._(msg`Page ${page.pageNumber}`),
        sectionLabel: i18n._(msg`Page ${page.pageNumber} — Section ${i + 1}`),
      }))
    })
  }, [pages, i18n])

  const videoBySection = useMemo(() => {
    const map = new Map<string, SignLanguageVideo>()
    for (const v of videos) {
      if (v.sectionId) map.set(v.sectionId, v)
    }
    return map
  }, [videos])

  const unassignedVideos = useMemo(
    () => videos.filter((v) => !v.sectionId),
    [videos],
  )

  const totalSections = sectionEntries.length
  const coveredSections = sectionEntries.filter((s) =>
    videoBySection.has(s.sectionId),
  ).length
  const coveragePct =
    totalSections > 0 ? Math.round((coveredSections / totalSections) * 100) : 0

  const nextMissing = useMemo(
    () => sectionEntries.find((s) => !videoBySection.has(s.sectionId)) ?? null,
    [sectionEntries, videoBySection],
  )

  const filteredEntries = useMemo(() => {
    if (filter === "missing") {
      return sectionEntries.filter((s) => !videoBySection.has(s.sectionId))
    }
    if (filter === "covered") {
      return sectionEntries.filter((s) => videoBySection.has(s.sectionId))
    }
    return sectionEntries
  }, [filter, sectionEntries, videoBySection])

  const missingCount = totalSections - coveredSections

  const handleUploadForSection = (sectionId: string | null) => {
    targetSectionRef.current = sectionId
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    const target = targetSectionRef.current
    targetSectionRef.current = null

    // For single-section upload we just upload the first file; for the
    // top-level "Add videos" button we accept multiple files unassigned.
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
    <LandingPageShell
      bookLabel={bookLabel}
      stageSlug="sign-language"
      settingsTab="general"
      colorClass="bg-cyan-600 hover:bg-cyan-700"
      accentColor="#0891b2"
      accentColorSoft="#cffafe"
      isRunning={false}
      isCompleted={false}
      hasError={false}
      canRun={false}
      hideRunButton
      hideFooter
      runLabel={null}
      rerunLabel={null}
      previewLabel={t`Sign Language Preview`}
      onRun={() => {}}
      preview={<SignLanguageReaderPreview hasAnyVideo={videos.length > 0} />}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/mp4,video/webm,.mp4,.webm"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
          <Trans>Sign Language</Trans>
        </h1>
        <p className="text-[14px] text-[#737373] leading-relaxed">
          <Trans>
            Upload sign-language videos for each section of the book. The
            reader shows the matching video in a small player as the user
            scrolls through the page.
          </Trans>
        </p>
      </div>

      <LandingPageWarning
        show={!storyboardReady}
        variant="prereq"
        title={<Trans>Run {getStageLabelI18n("storyboard")} first</Trans>}
        description={
          <Trans>
            Sign Language assigns one video per Storyboard section. Finish
            Storyboard first so you have sections to match against.
          </Trans>
        }
      />

      <SettingsCard>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  <Trans>Coverage</Trans>
                </span>
                <span className="text-[12px] font-medium text-[#737373]">
                  {totalSections === 0 ? (
                    <Trans>No sections yet</Trans>
                  ) : (
                    <Trans>
                      {coveredSections} of {totalSections} sections
                    </Trans>
                  )}
                </span>
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-cyan-100">
                <span
                  className="absolute left-0 top-0 h-full rounded-full bg-cyan-600 transition-[width] duration-300"
                  style={{ width: `${coveragePct}%` }}
                />
              </div>
            </div>
          </SettingsCard>

          <SettingsCard>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  <Trans>Videos</Trans>
                </span>
                <div className="flex items-center gap-1.5">
                  {videos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAll(true)}
                      disabled={deletingAll}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-medium text-[#737373] transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                      <Trans>Remove all</Trans>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleUploadForSection(null)}
                    disabled={uploadMutation.isPending || !storyboardReady}
                    className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-2.5 py-1 text-[11.5px] font-medium text-white shadow-sm transition-colors hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="h-3 w-3" aria-hidden />
                    )}
                    <Trans>Add videos</Trans>
                  </button>
                </div>
              </div>

              {/* Unassigned pool */}
              {unassignedVideos.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-md border border-cyan-200 bg-cyan-50/60 p-2">
                  <div className="flex items-center gap-1.5 px-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700">
                      <Trans>Unassigned</Trans>
                    </span>
                    <span className="rounded-full bg-cyan-100 px-1.5 py-px text-[9.5px] font-semibold text-cyan-700">
                      {unassignedVideos.length}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {unassignedVideos.map((video) => (
                      <li
                        key={video.videoId}
                        className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 ring-1 ring-cyan-100"
                      >
                        <button
                          type="button"
                          onClick={() => setPlayingVideo(video)}
                          className="flex h-7 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-black/90 transition-opacity hover:opacity-80"
                          aria-label={t`Play video`}
                        >
                          <video
                            src={getSignLanguageVideoUrl(bookLabel, video.videoId)}
                            className="h-full w-full object-cover"
                            muted
                            preload="metadata"
                          />
                        </button>
                        <span
                          className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-[#0a0a0a]"
                          title={video.originalName}
                        >
                          {video.originalName}
                        </span>
                        <Select
                          value="__unassigned__"
                          onValueChange={(val) =>
                            handleAssign(
                              video.videoId,
                              val === "__unassigned__" ? null : val,
                            )
                          }
                          disabled={assignMutation.isPending}
                        >
                          <SelectTrigger className="h-7 w-32 text-[11px]">
                            <SelectValue placeholder={t`Assign...`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__unassigned__">
                              {t`Unassigned`}
                            </SelectItem>
                            {sectionEntries.map((s) => (
                              <SelectItem key={s.sectionId} value={s.sectionId}>
                                {s.sectionLabel}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          type="button"
                          onClick={() => handleDelete(video.videoId)}
                          disabled={pendingDeleteId === video.videoId}
                          aria-label={t`Delete video`}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#a3a3a3] transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        >
                          {pendingDeleteId === video.videoId ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                          ) : (
                            <X className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Section list */}
              {sectionEntries.length === 0 ? (
                <div className="rounded-md border border-dashed border-[#e5e5e5] bg-[#fafafa] px-3 py-4 text-center text-[12px] text-[#737373]">
                  <Trans>
                    No storyboard sections found. Run Storyboard to generate
                    sections you can match videos to.
                  </Trans>
                </div>
              ) : (
                <>
                  {/* Focal "Next missing" slot */}
                  {nextMissing ? (
                    <button
                      type="button"
                      onClick={() => handleUploadForSection(nextMissing.sectionId)}
                      disabled={uploadMutation.isPending}
                      className="group flex w-full items-center gap-3 rounded-lg border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white px-3 py-2.5 text-left transition-all hover:border-cyan-300 hover:from-cyan-100 hover:to-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-50"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-cyan-600 text-white shadow-sm">
                        {uploadMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Upload className="h-4 w-4" aria-hidden />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-700">
                          <Trans>Next missing section</Trans>
                        </span>
                        <span className="truncate text-[13px] font-semibold text-[#0a0a0a]">
                          {nextMissing.sectionLabel}
                        </span>
                      </span>
                      <Plus
                        className="h-4 w-4 shrink-0 text-cyan-600 transition-transform group-hover:rotate-90"
                        strokeWidth={2.25}
                        aria-hidden
                      />
                    </button>
                  ) : (
                    <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-white shadow-sm">
                        <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                          <Trans>All set</Trans>
                        </span>
                        <span className="text-[13px] font-semibold text-emerald-900">
                          <Trans>Every section has a video</Trans>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Manage all sections — opens dialog */}
                  <button
                    type="button"
                    onClick={() => setManageOpen(true)}
                    className="group inline-flex items-center justify-between gap-2 rounded-md border border-[#e5e5e5] bg-white px-3 py-2 text-left transition-colors hover:border-[#d4d4d4] hover:bg-[#fafafa] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                  >
                    <span className="inline-flex items-center gap-2">
                      <ListTree
                        className="h-3.5 w-3.5 text-[#737373]"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span className="text-[12.5px] font-medium text-[#0a0a0a]">
                        <Trans>Manage all sections</Trans>
                      </span>
                    </span>
                    <span className="text-[11px] tabular-nums text-[#737373]">
                      <Trans>
                        {coveredSections} / {totalSections}
                      </Trans>
                    </span>
                  </button>
                </>
              )}
            </div>
          </SettingsCard>

      {/* Player dialog */}
      <Dialog
        open={!!playingVideo}
        onOpenChange={(open) => {
          if (!open) setPlayingVideo(null)
        }}
      >
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <DialogHeader className="px-4 pb-2 pt-4">
            <DialogTitle className="truncate text-sm">
              {playingVideo?.originalName}
            </DialogTitle>
          </DialogHeader>
          {playingVideo && (
            <div className="px-4 pb-4">
              <video
                src={getSignLanguageVideoUrl(bookLabel, playingVideo.videoId)}
                className="w-full rounded"
                controls
                autoPlay
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete-all confirmation */}
      <Dialog
        open={confirmDeleteAll}
        onOpenChange={(open) => {
          if (deletingAll) return
          setConfirmDeleteAll(open)
          if (!open) setDeleteAllError(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Trans>Remove all sign-language videos?</Trans>
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <Trans>
              This permanently deletes every uploaded video and clears all
              section assignments. This can't be undone.
            </Trans>
          </p>
          {deleteAllError && (
            <p
              role="alert"
              className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700"
            >
              {deleteAllError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmDeleteAll(false)
                setDeleteAllError(null)
              }}
              disabled={deletingAll}
              className="rounded-md px-3 py-1.5 text-[12px] font-medium text-[#737373] transition-colors hover:bg-[#f5f5f5] disabled:opacity-50"
            >
              <Trans>Cancel</Trans>
            </button>
            <button
              type="button"
              onClick={async () => {
                // Delete only the page-section videos shown here — videos
                // attached to glossary terms are managed from the Glossary
                // stage and must survive a "remove all" on this page.
                //
                // Every video is attempted even if one fails, so a single bad
                // delete can't strand the rest; failures are reported together
                // and the dialog stays open so the leftovers can be retried
                // (each success refetches the list, so a retry only re-attempts
                // what is still there).
                setDeletingAll(true)
                setDeleteAllError(null)
                const total = videos.length
                let failed = 0
                for (const v of videos) {
                  try {
                    await deleteMutation.mutateAsync(v.videoId)
                  } catch {
                    failed += 1
                  }
                }
                setDeletingAll(false)
                if (failed > 0) {
                  setDeleteAllError(
                    t`Could not remove ${failed} of ${total} videos. Please try again.`,
                  )
                  return
                }
                setConfirmDeleteAll(false)
              }}
              disabled={deletingAll}
              className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
            >
              {deletingAll && (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              )}
              {deleteAllError ? <Trans>Retry</Trans> : <Trans>Remove all</Trans>}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ManageSectionsDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        bookLabel={bookLabel}
        filter={filter}
        onFilterChange={setFilter}
        filteredEntries={filteredEntries}
        videoBySection={videoBySection}
        missingCount={missingCount}
        coveredSections={coveredSections}
        totalSections={totalSections}
        uploadPending={uploadMutation.isPending}
        pendingDeleteId={pendingDeleteId}
        onUploadForSection={handleUploadForSection}
        onAssign={handleAssign}
        onDelete={handleDelete}
        onPlay={setPlayingVideo}
      />
    </LandingPageShell>
  )
}
