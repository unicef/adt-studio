import { useState } from "react"
import { Loader2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { SignLanguageVideo } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useDeleteSignLanguageVideo } from "@/hooks/use-sign-language-videos"

export function RemoveAllDialog({
  label,
  videos,
  open,
  onOpenChange,
}: {
  label: string
  videos: SignLanguageVideo[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useLingui()
  const remove = useDeleteSignLanguageVideo(label)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = (next: boolean) => {
    if (deleting) return
    onOpenChange(next)
    if (!next) setError(null)
  }

  const removeAll = async () => {
    setDeleting(true)
    setError(null)
    const total = videos.length
    let failed = 0
    for (const video of videos) {
      try {
        await remove.mutateAsync(video.videoId)
      } catch {
        failed += 1
      }
    }
    setDeleting(false)
    if (failed > 0) {
      setError(t`Could not remove ${failed} of ${total} videos. Please try again.`)
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Trans>Remove all sign language videos?</Trans>
          </DialogTitle>
          <DialogDescription>
            {t`This permanently deletes ${plural(videos.length, { one: "# uploaded video", other: "all # uploaded videos" })} and clears every page they were on. This can't be undone.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none" style={{ gridTemplateRows: error ? "1fr" : "0fr" }}>
          <div className="min-h-0 overflow-hidden">
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {error}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => close(false)} disabled={deleting}>
            <Trans>Cancel</Trans>
          </Button>
          <Button variant="destructive" size="sm" onClick={() => void removeAll()} disabled={deleting}>
            {deleting && <Loader2 className="animate-spin motion-reduce:animate-none" />}
            {error ? <Trans>Retry</Trans> : <Trans>Remove all</Trans>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
