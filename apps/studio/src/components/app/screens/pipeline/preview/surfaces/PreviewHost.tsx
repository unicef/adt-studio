import { useEffect, useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useRouter } from "@tanstack/react-router"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { MacOSTrafficLightSpacer } from "@/components/title-bar"
import { DRAG_REGION } from "@/constants"
import { cn } from "@/lib/utils"
import { closePreviewSurface, followPreviewPage, useOpenPreviewTarget, type PreviewTarget } from "./previewSurface"
import { usePreviewSession, type PreviewSession } from "./usePreviewSession"
import {
  PreviewBody,
  PreviewBookHeader,
  PreviewBrowserButton,
  PreviewCloseButton,
  PreviewEditButton,
  PreviewExpandButton,
  PreviewRebuildButton,
  PreviewStatus,
  PreviewViewportSwitch,
} from "./PreviewParts"

function Divider() {
  return <span aria-hidden className="mx-1.5 h-5 w-px shrink-0 bg-border" />
}

function HeaderControls({
  session,
  full,
  onToggleFull,
  onClose,
}: {
  session: PreviewSession
  full: boolean
  onToggleFull: () => void
  onClose: () => void
}) {
  const { t } = useLingui()
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="flex items-center rounded-lg bg-muted/60 py-0.5 pl-2.5 pr-0.5">
        <PreviewStatus session={session} />
        <PreviewRebuildButton session={session} />
      </span>
      <Divider />
      <PreviewBrowserButton session={session} />
      <PreviewExpandButton expanded={full} onToggle={onToggleFull} />
      <Divider />
      <PreviewEditButton session={session} />
      <PreviewCloseButton onClose={onClose} hint={full ? t`Close the preview` : t`Close the preview (Esc)`} className="ml-1" />
    </div>
  )
}

function PreviewDialog({ label, target, onClose }: { label: string; target: PreviewTarget; onClose: () => void }) {
  const { t } = useLingui()
  const router = useRouter()
  const [opened] = useState(target)
  const session = usePreviewSession(label, opened)
  const [full, setFull] = useState(false)

  useEffect(() => {
    if (session.liveSectionId) followPreviewPage(router, session.liveSectionId)
  }, [router, session.liveSectionId])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-preview-close]")?.focus({ preventScroll: true })
        }}
        onEscapeKeyDown={(event) => {
          if (!full) return
          event.preventDefault()
          setFull(false)
        }}
        overlayClassName="bg-black/70 backdrop-blur-sm"
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0 outline-none transition-[width,height,max-width,border-radius] duration-300 ease-[cubic-bezier(.22,.61,.36,1)] motion-reduce:transition-none [&>button.absolute]:hidden",
          full ? "h-screen w-screen max-w-[100vw] rounded-none border-0 sm:rounded-none" : "h-[88vh] w-[94vw] max-w-[1280px] sm:rounded-2xl",
        )}
      >
        <DialogTitle className="sr-only">{t`Book preview`}</DialogTitle>
        <DialogDescription className="sr-only">
          <Trans>The book as readers will see it.</Trans>
        </DialogDescription>
        <div
          className={cn(
            "flex shrink-0 items-center gap-4 border-b px-5 transition-[height] duration-300 ease-out motion-reduce:transition-none",
            full ? "drag-region h-14" : "h-16",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {full && <MacOSTrafficLightSpacer style={DRAG_REGION} />}
            <PreviewBookHeader label={label} session={session} compact={full} />
          </div>
          <PreviewViewportSwitch session={session} />
          <HeaderControls session={session} full={full} onToggleFull={() => setFull((value) => !value)} onClose={onClose} />
        </div>
        <div className="relative flex min-h-0 flex-1">
          <PreviewBody session={session} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function PreviewHost({ label }: { label: string }) {
  const router = useRouter()
  const target = useOpenPreviewTarget()
  const close = useMemo(() => () => closePreviewSurface(router), [router])

  useEffect(() => {
    if (!target) return
    document.documentElement.dataset.previewing = "dialog"
    return () => {
      delete document.documentElement.dataset.previewing
    }
  }, [target])

  if (!target) return null
  return <PreviewDialog label={label} target={target} onClose={close} />
}
