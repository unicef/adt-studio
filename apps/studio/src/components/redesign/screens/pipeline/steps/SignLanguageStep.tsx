import { useMemo, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Trash2, Upload } from "lucide-react"
import { getSignLanguageVideoUrl } from "@/api/client"
import { Button } from "@/components/ui/button"
import {
  useSignLanguageVideos,
  useUploadSignLanguageVideo,
  useDeleteSignLanguageVideo,
} from "@/hooks/use-sign-language-videos"
import { tint } from "../plugins"
import { StepEmpty, StepLoading, StepShell } from "./StepShell"
import { RowAction, SaveError, StepBody, StepCard, StepRail } from "./ui"
import type { StepProps } from "./types"

/** `""` shows every video; `null` shows only the unassigned ones. */
type VideoFilter = string | null

function formatSize(bytes: number, locale: string): string {
  const [value, unit] =
    bytes < 1024
      ? [bytes, "byte" as const]
      : bytes < 1024 * 1024
        ? [bytes / 1024, "kilobyte" as const]
        : [bytes / (1024 * 1024), "megabyte" as const]
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: unit === "byte" ? 0 : 1,
  }).format(value)
}

export function SignLanguageStep(props: StepProps) {
  const { label, plugin } = props
  const { t, i18n } = useLingui()
  const query = useSignLanguageVideos(label)
  const upload = useUploadSignLanguageVideo(label)
  const remove = useDeleteSignLanguageVideo(label)
  const fileInput = useRef<HTMLInputElement>(null)

  const videos = useMemo(() => query.data?.videos ?? [], [query.data])
  const [filter, setFilter] = useState<VideoFilter>("")

  const assigned = videos.filter((v) => v.sectionId).length

  const pickFile = () => fileInput.current?.click()

  if (query.isLoading) return <StepLoading {...props} />
  if (videos.length === 0) return <StepEmpty {...props} onRun={pickFile} onManual={pickFile} />

  const shown =
    filter === "" ? videos : videos.filter((v) => (v.sectionId ?? null) === filter)

  return (
    <StepShell
      {...props}
      chips={[t`${videos.length} videos`, t`${assigned} assigned`]}
      canApply={assigned > 0}
      rail={
        <StepRail
          heading={<Trans>Videos</Trans>}
          hex={plugin.hex}
          entries={[
            { key: "", title: t`All videos`, count: videos.length },
            { key: null, title: t`Unassigned`, count: videos.length - assigned },
          ]}
          activeKey={filter}
          onSelect={setFilter}
          footer={<Trans>Assign a video to a section so it plays alongside that passage.</Trans>}
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

        <SaveError error={upload.error ?? remove.error} />

        <div className="grid grid-cols-2 gap-3.5">
          {shown.map((video) => (
            <StepCard key={video.videoId} accent={plugin.hex} muted={!video.sectionId}>
              <video
                controls
                preload="metadata"
                className="w-full rounded-lg border bg-black"
                src={getSignLanguageVideoUrl(label, video.videoId)}
              >
                <Trans>Your browser cannot play this video.</Trans>
              </video>

              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
                  {video.originalName}
                </span>
                <RowAction
                  icon={Trash2}
                  tone="danger"
                  label={t`Delete ${video.originalName}`}
                  onClick={() => remove.mutate(video.videoId)}
                />
              </div>

              <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                <span>{formatSize(video.sizeBytes, i18n.locale)}</span>
                {video.sectionId ? (
                  <span
                    className="rounded px-1.5 py-0.5"
                    style={{ background: tint(plugin.hex, 0.12), color: plugin.hex }}
                  >
                    {video.sectionId}
                  </span>
                ) : (
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    <Trans>unassigned</Trans>
                  </span>
                )}
              </div>
            </StepCard>
          ))}
        </div>
      </StepBody>
    </StepShell>
  )
}
