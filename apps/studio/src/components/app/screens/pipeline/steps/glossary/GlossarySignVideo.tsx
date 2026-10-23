import { useRef, useState } from "react"
import { Check, Loader2, Plus, Trash2, Video } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { getSignLanguageVideoUrl, type SignLanguageVideo } from "@/api/client"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  useAssignSignLanguageVideo,
  useDeleteSignLanguageVideo,
  useUploadSignLanguageVideo,
} from "@/hooks/use-sign-language-videos"
import { cn } from "@/lib/utils"
import { MUTED_MEDIA } from "../shared/ui"

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
          <div className="flex items-center gap-3 text-[12px] font-medium">
            <button
              type="button"
              disabled={busy || blocked}
              title={blockedReason}
              onClick={() => remove.mutate(video.videoId)}
              className="flex items-center gap-1 text-destructive underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
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

      <Dialog open={!video && pickerOpen} onOpenChange={(open) => !busy && setPickerOpen(open)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              <Trans>Add a sign-language video</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>Choose a video you already uploaded, or upload a new one. It is saved right away.</Trans>
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex h-9 w-fit items-center gap-1.5 rounded-md border px-3 text-[12px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {upload.isPending ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> : <Plus className="size-3.5" />}
            <Trans>Upload a new video</Trans>
          </button>
          {unassigned.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-[12px] text-muted-foreground">
              <Trans>No unassigned videos yet.</Trans>
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {unassigned.map((candidate) => (
                <li key={candidate.videoId} className="flex items-center gap-3 rounded-lg border bg-card p-2">
                  <video
                    src={getSignLanguageVideoUrl(label, candidate.videoId)}
                    className="h-16 w-24 shrink-0 rounded bg-black object-contain"
                    muted
                    preload="metadata"
                  />
                  <p className="min-w-0 flex-1 truncate text-[12px] font-medium" title={candidate.originalName}>
                    {candidate.originalName}
                  </p>
                  <button
                    type="button"
                    onClick={() => assignVideo(candidate.videoId)}
                    disabled={busy}
                    className="flex h-8 items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <Check className="size-3" />
                    <Trans>Use video</Trans>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove.mutate(candidate.videoId)}
                    disabled={busy}
                    aria-label={t`Delete video from book`}
                    className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
