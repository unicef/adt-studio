import { getSignLanguageVideoUrl, type SignLanguageVideo } from "@/api/client"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function VideoPlayerDialog({ label, video, onClose }: { label: string; video: SignLanguageVideo | null; onClose: () => void }) {
  return (
    <Dialog open={!!video} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl overflow-hidden p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="truncate text-sm">{video?.originalName}</DialogTitle>
        </DialogHeader>
        {video && (
          <div className="px-4 pb-4">
            <video src={getSignLanguageVideoUrl(label, video.videoId)} className="aspect-video w-full rounded-lg bg-black object-contain" controls autoPlay />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
