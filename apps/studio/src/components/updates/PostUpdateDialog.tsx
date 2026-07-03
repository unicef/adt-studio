import { Trans } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import type { ElementType } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { ReleaseFallbackBanner } from "./ReleaseFallbackBanner"
import { ReleaseNotesMarkdown } from "./ReleaseNotesMarkdown"
import { formatVersion, releaseNotesHaveImage } from "./release-banner-utils"

export interface PostUpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  version: string
  releaseNotes?: string
  modal?: boolean
}

export function PostUpdateDialog({
  open,
  onOpenChange,
  version,
  releaseNotes,
  modal,
}: PostUpdateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <DialogDescription className="sr-only">
          <Trans>What's new in this release</Trans>
        </DialogDescription>
        <PostUpdateContent
          version={version}
          releaseNotes={releaseNotes}
          onDone={() => onOpenChange(false)}
          TitleTag={DialogTitle}
        />
      </DialogContent>
    </Dialog>
  )
}

export interface PostUpdateContentProps {
  version: string
  releaseNotes?: string
  onDone?: () => void
  TitleTag?: ElementType
}

export function PostUpdateContent({
  version,
  releaseNotes,
  onDone,
  TitleTag = "h2",
}: PostUpdateContentProps) {
  const label = formatVersion(version)
  const showFallbackBanner = !releaseNotesHaveImage(releaseNotes)
  const notes = releaseNotes?.trim()

  return (
    <div className="flex h-[31rem] max-h-[calc(100vh-2rem)] flex-col">
      <div className="flex shrink-0 items-center gap-3 px-6 pb-4 pt-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div className="min-w-0">
          <TitleTag className="text-base font-semibold">
            <Trans>What's new</Trans>
          </TitleTag>
          <p className="text-sm text-muted-foreground">
            <Trans>You're now running ADT Studio {label}</Trans>
          </p>
        </div>
      </div>

      {showFallbackBanner && (
        <div className="shrink-0 px-6 pb-5">
          <ReleaseFallbackBanner version={version} />
        </div>
      )}

      {notes ? (
        <div className="min-h-0 flex-1 overflow-auto border-y px-6 py-4">
          <ReleaseNotesMarkdown>{notes}</ReleaseNotesMarkdown>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-start px-6 pt-1">
          <p className="w-full rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <Trans>This release includes general improvements and fixes.</Trans>
          </p>
        </div>
      )}

      <div className="flex shrink-0 justify-end px-6 pb-6 pt-4">
        <Button onClick={onDone}>
          <Trans>Got it</Trans>
        </Button>
      </div>
    </div>
  )
}
