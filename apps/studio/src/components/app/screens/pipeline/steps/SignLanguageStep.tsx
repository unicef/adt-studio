import { useCallback, useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  useSignLanguageVideos,
  useUploadSignLanguageVideo,
  useDeleteSignLanguageVideo,
  useAssignSignLanguageVideo,
} from "@/hooks/use-sign-language-videos"
import { isGlossaryVideoSectionId } from "@/lib/glossary-video"
import { buildSectionEntries } from "@/components/pipeline/stages/sign-language/components/sectionEntries"
import { StepEmpty, StepLoading, StepShell, useStepLoading } from "./shared/StepShell"
import { SaveError, StepBody, StepEmptyHint, StepRail } from "./shared/ui"
import { SignLanguageVideoCard } from "./sign-language/SignLanguageVideoCard"
import type { StepProps } from "./shared/types"

/** Rail selection: "" = every video, null = the unassigned ones, else a page number. */
type VideoFilter = string | null

export function SignLanguageStep(props: StepProps) {
  const { label, plugin, pages } = props
  const { t, i18n } = useLingui()
  const query = useSignLanguageVideos(label)
  const upload = useUploadSignLanguageVideo(label)
  const remove = useDeleteSignLanguageVideo(label)
  const assign = useAssignSignLanguageVideo(label)
  const fileInput = useRef<HTMLInputElement>(null)

  // Glossary term videos are stored in the same collection but belong to the
  // Glossary step; offering them a page here would silently detach them.
  const videos = useMemo(
    () => (query.data?.videos ?? []).filter((v) => !isGlossaryVideoSectionId(v.sectionId)),
    [query.data],
  )

  const sections = useMemo(() => buildSectionEntries(pages, i18n), [pages, i18n])
  const pageBySection = useMemo(() => {
    const map = new Map<string, number>()
    for (const section of sections) map.set(section.sectionId, section.pageNumber)
    return map
  }, [sections])

  const [filter, setFilter] = useState<VideoFilter>("")

  const assigned = useMemo(() => videos.filter((v) => v.sectionId).length, [videos])

  const railEntries = useMemo(() => {
    const counts = new Map<number, number>()
    for (const video of videos) {
      const pageNumber = video.sectionId ? pageBySection.get(video.sectionId) : undefined
      if (pageNumber === undefined) continue
      counts.set(pageNumber, (counts.get(pageNumber) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a - b)
      .map(([pageNumber, count]) => ({
        key: String(pageNumber),
        title: t`Page ${pageNumber}`,
        count,
      }))
  }, [videos, pageBySection, t])

  const shown = useMemo(() => {
    if (filter === "") return videos
    if (filter === null) return videos.filter((v) => !v.sectionId)
    return videos.filter(
      (v) => v.sectionId != null && String(pageBySection.get(v.sectionId)) === filter,
    )
  }, [videos, filter, pageBySection])

  const assignVideo = useCallback(
    (videoId: string, sectionId: string | null) => assign.mutate({ videoId, sectionId }),
    [assign],
  )
  const deleteVideo = useCallback((videoId: string) => remove.mutate(videoId), [remove])

  const pickFile = useCallback(() => fileInput.current?.click(), [])

  const loading = useStepLoading(props, { isLoading: query.isLoading, hasOutput: videos.length > 0 })
  if (loading) return <StepLoading {...props} />
  if (videos.length === 0) return <StepEmpty {...props} onRun={pickFile} onManual={pickFile} />

  return (
    <StepShell
      {...props}
      chips={[t`${videos.length} videos`, t`${assigned} assigned`]}
      canApply={assigned > 0}
      rail={
        <StepRail
          heading={<Trans>Videos by page</Trans>}
          hex={plugin.hex}
          entries={[
            { key: "", title: t`All videos`, count: videos.length },
            { key: null, title: t`Unassigned`, count: videos.length - assigned },
            ...railEntries,
          ]}
          activeKey={filter}
          onSelect={setFilter}
          footer={<Trans>Pick a page for a video so it plays alongside that passage.</Trans>}
        />
      }
    >
      <StepBody
        title={<Trans>Sign language</Trans>}
        meta={t`${videos.length} videos`}
        actions={
          <Button size="sm" variant="outline" onClick={pickFile} disabled={upload.isPending}>
            <Upload className="size-3.5" />
            <Trans>Upload video</Trans>
          </Button>
        }
      >
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          aria-label={t`Upload a sign language video`}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) upload.mutate(file)
            e.target.value = ""
          }}
        />

        <SaveError error={upload.error ?? remove.error ?? assign.error} />

        {sections.length === 0 ? (
          <StepEmptyHint>
            <Trans>
              Run Storyboard first — videos are placed on the sections it produces.
            </Trans>
          </StepEmptyHint>
        ) : null}

        {shown.length === 0 ? (
          <StepEmptyHint>
            <Trans>No videos for this filter.</Trans>
          </StepEmptyHint>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            {shown.map((video) => (
              <SignLanguageVideoCard
                key={video.videoId}
                video={video}
                label={label}
                hex={plugin.hex}
                sections={sections}
                isAssigning={assign.isPending && assign.variables?.videoId === video.videoId}
                isDeleting={remove.isPending && remove.variables === video.videoId}
                onAssign={assignVideo}
                onDelete={deleteVideo}
              />
            ))}
          </div>
        )}
      </StepBody>
    </StepShell>
  )
}
