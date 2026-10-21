import { useQuery } from "@tanstack/react-query"
import { Trans } from "@lingui/react/macro"
import { api } from "@/api/client"
import { usePage } from "@/hooks/use-pages"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FigureCleanupDialog } from "./FigureCleanupDialog"

/** Resolve the original PDF page even when a figure was reused on another Storyboard page. */
export function FigureCleanupFromBook({ bookLabel, imageId, onClose }: {
  bookLabel: string; imageId: string; onClose: () => void
}) {
  const images = useQuery({ queryKey: ["books", bookLabel, "images"], queryFn: () => api.listBookImages(bookLabel) })
  const source = images.data?.images.find((image) => image.imageId === imageId && image.source !== "page")
  const page = usePage(bookLabel, source?.pageId ?? "")
  if (source && page.data) return (
    <FigureCleanupDialog bookLabel={bookLabel} imageId={imageId} pageId={source.pageId}
      expectedVersion={page.data.versions.imageClassification}
      bounds={page.data.imagesMeta.find((image) => image.imageId === imageId)?.bounds} onClose={onClose} />
  )
  const failed = images.isError || page.isError || (images.isSuccess && !source)
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle><Trans>Clean up figure</Trans></DialogTitle>
        <p role={failed ? "alert" : "status"}>{failed
          ? <Trans>Could not load the original page.</Trans> : <Trans>Loading page…</Trans>}</p>
        <Button variant="outline" onClick={onClose}><Trans>Cancel</Trans></Button>
      </DialogContent>
    </Dialog>
  )
}
