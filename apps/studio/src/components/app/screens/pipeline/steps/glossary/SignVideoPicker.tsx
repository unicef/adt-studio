import { Check, Loader2, Plus, Trash2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { getSignLanguageVideoUrl, type SignLanguageVideo } from "@/api/client"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const SPIN = "size-3.5 animate-spin motion-reduce:animate-none"

export function SignVideoPicker({
  open,
  onOpenChange,
  label,
  candidates,
  busy,
  uploading,
  assigningId,
  deletingId,
  onUpload,
  onUse,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  candidates: SignLanguageVideo[]
  busy: boolean
  uploading: boolean
  assigningId: string | null
  deletingId: string | null
  onUpload: () => void
  onUse: (videoId: string) => void
  onDelete: (videoId: string) => void
}) {
  const { t } = useLingui()
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Add a sign-language video</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Play a video you already uploaded to check it, then use it, or upload a new one. It is saved right away.</Trans>
          </DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={onUpload}
          disabled={busy}
          className="flex h-9 w-fit items-center gap-1.5 rounded-[10px] border bg-card px-3 text-[12.5px] font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
        >
          {uploading ? <Loader2 className={SPIN} /> : <Plus className="size-3.5" />}
          <Trans>Upload a new video</Trans>
        </button>
        <div className="flex flex-col gap-2">
          <h3 className="text-[12.5px] font-semibold text-foreground">
            <Trans>Uploaded videos</Trans>
          </h3>
          {candidates.length === 0 ? (
            <p className="rounded-lg border bg-muted/30 px-3 py-6 text-center text-[12px] text-muted-foreground">
              <Trans>No unassigned videos yet.</Trans>
            </p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
              {candidates.map((candidate) => {
                const assigning = assigningId === candidate.videoId
                const deleting = deletingId === candidate.videoId
                return (
                  <li
                    key={candidate.videoId}
                    className={cn("flex items-center gap-3 rounded-xl border bg-card p-2 transition-opacity duration-200", deleting && "opacity-60")}
                  >
                    <video
                      src={getSignLanguageVideoUrl(label, candidate.videoId)}
                      controls
                      preload="metadata"
                      aria-label={t`Preview ${candidate.originalName}`}
                      className="aspect-video w-40 shrink-0 rounded-lg bg-black object-contain"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="truncate text-[12.5px] font-medium text-foreground" title={candidate.originalName}>
                        {candidate.originalName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        <Trans>Not used by any term</Trans>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUse(candidate.videoId)}
                      disabled={busy}
                      className="flex h-8 shrink-0 items-center gap-1 rounded-lg border bg-card px-2.5 text-[12px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      {assigning ? <Loader2 className={SPIN} /> : <Check className="size-3.5" />}
                      <Trans>Use video</Trans>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(candidate.videoId)}
                      disabled={busy}
                      aria-label={t`Delete ${candidate.originalName} from the book`}
                      title={t`Delete video from book`}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      {deleting ? <Loader2 className={SPIN} /> : <Trash2 className="size-3.5" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
