import { useRef, useState } from "react"
import { Loader2, Video } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { getSignLanguageVideoUrl, type SignLanguageVideo } from "@/api/client"
import {
  useAssignSignLanguageVideo,
  useDeleteSignLanguageVideo,
  useUploadSignLanguageVideo,
} from "@/hooks/use-sign-language-videos"
import { cn } from "@/lib/utils"
import { MUTED_MEDIA } from "../shared/ui"
import { SignVideoPicker } from "./SignVideoPicker"

function message(error: unknown): string | null {
  return error instanceof Error ? error.message : null
}

export function GlossarySignVideo({
  label,
  textId,
  video,
  videos,
  muted = false,
  blockedReason,
}: {
  label: string
  textId: string
  video: SignLanguageVideo | null
  videos: SignLanguageVideo[]
  muted?: boolean
  blockedReason?: string
}) {
  const { t } = useLingui()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const upload = useUploadSignLanguageVideo(label)
  const assign = useAssignSignLanguageVideo(label)
  const remove = useDeleteSignLanguageVideo(label)
  const busy = upload.isPending || assign.isPending || remove.isPending
  const blocked = !!blockedReason
  const unassigned = videos.filter((candidate) => !candidate.sectionId)
  const error = message(upload.error) ?? message(assign.error) ?? message(remove.error)
  const errorLabel = upload.error ? t`Upload failed` : assign.error ? t`Couldn't assign` : t`Couldn't remove`

  const assignVideo = (videoId: string) =>
    assign.mutate({ videoId, sectionId: textId }, { onSuccess: () => setPickerOpen(false) })

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Trans>Sign-language video</Trans>
      </span>
      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          upload.mutate(file, { onSuccess: (data) => data?.videoId && assignVideo(data.videoId) })
        }}
      />
      {video ? (
        <>
          <video
            src={getSignLanguageVideoUrl(label, video.videoId)}
            controls
            preload="metadata"
            className={cn("aspect-video w-full rounded-md bg-black", muted && MUTED_MEDIA)}
          />
          <div className="flex min-w-0 items-center gap-3 text-[12px] font-medium">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 font-normal text-muted-foreground" title={video.originalName}>
              <Video aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{video.originalName}</span>
            </span>
            <button
              type="button"
              disabled={busy || blocked}
              title={blockedReason}
              onClick={() => remove.mutate(video.videoId)}
              className="flex shrink-0 items-center gap-1 text-destructive underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
            >
              {remove.isPending && <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />}
              <Trans>Remove</Trans>
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={busy || blocked}
          title={blockedReason}
          onClick={() => setPickerOpen(true)}
          className="flex aspect-video items-center justify-center gap-1.5 rounded-md border border-dashed text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Video className="size-3.5" />}
          <Trans>Add a video</Trans>
        </button>
      )}
      <p className="text-[11px] leading-snug text-muted-foreground">
        {blockedReason ?? <Trans>Videos are saved as soon as they upload.</Trans>}
      </p>
      {error && (
        <p role="alert" className="text-[11px] leading-snug text-destructive">
          {errorLabel}: {error}
        </p>
      )}

      <SignVideoPicker
        open={!video && pickerOpen}
        onOpenChange={setPickerOpen}
        label={label}
        candidates={unassigned}
        busy={busy}
        uploading={upload.isPending}
        assigningId={assign.isPending ? (assign.variables?.videoId ?? null) : null}
        deletingId={remove.isPending ? (remove.variables ?? null) : null}
        onUpload={() => fileRef.current?.click()}
        onUse={assignVideo}
        onDelete={(videoId) => remove.mutate(videoId)}
      />
    </div>
  )
}
