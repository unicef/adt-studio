import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertTriangle } from "lucide-react"
import { PUBLICATION_SNAPSHOT_MAX_BYTES } from "@adt/types"
import type { PublishFailure } from "@/hooks/use-book-publication"
import { PublishingSettingsLink } from "./PublishingSettingsLink"

const MAX_MEGABYTES = Math.round(PUBLICATION_SNAPSHOT_MAX_BYTES / (1024 * 1024))

function title(failure: PublishFailure): ReactNode {
  switch (failure.code) {
    case "publish_not_connected":
      return <Trans>Publishing isn't connected yet</Trans>
    case "published_already":
      return <Trans>This book already has a live link</Trans>
    case "not_published":
      return <Trans>This book isn't shared right now</Trans>
    case "export_failed":
      return <Trans>The book couldn't be exported</Trans>
    case "package_failed":
      return <Trans>The export couldn't be packed up</Trans>
    case "upload_failed":
      return <Trans>Cloudflare wouldn't accept the upload</Trans>
    case "worker_unreachable":
      return <Trans>Couldn't reach your publishing service</Trans>
    case "snapshot_too_large":
      return <Trans>This book is too big to send in one piece</Trans>
    default:
      return <Trans>Publishing couldn't finish</Trans>
  }
}

function body(failure: PublishFailure): ReactNode {
  switch (failure.code) {
    case "publish_not_connected":
      return (
        <Trans>
          Publishing needs a Cloudflare account connected first. Set that up once in Settings, then
          come back here.
        </Trans>
      )
    case "published_already":
      return (
        <Trans>
          This book was already published — another window may have done it. Use "Update site" to
          push your latest changes to the link you already have.
        </Trans>
      )
    case "not_published":
      return (
        <Trans>
          The link for this book is gone, so there was nothing to change. Publish it again to get a
          new link.
        </Trans>
      )
    case "export_failed":
      return (
        <Trans>
          Publishing starts by exporting the book, and that step didn't finish. Try a normal export
          above first — it will show you what's wrong — then publish again.
        </Trans>
      )
    case "package_failed":
      return (
        <Trans>
          The book exported fine but couldn't be bundled into one file to send. Trying again usually
          works. If it keeps failing, check that this computer has free disk space.
        </Trans>
      )
    case "upload_failed":
      return (
        <Trans>
          Your Cloudflare account refused the upload. Check in Settings that your publishing service
          is up to date, then try again. Nothing was shared.
        </Trans>
      )
    case "worker_unreachable":
      /** No claim about *why* any more. This used to offer "services that haven't been used in a
       *  while can take a moment to wake up", which is not how Workers behave and sent the author
       *  looking in the wrong place; the detail line below now carries the actual reason the
       *  connection failed, so the copy only has to say what is and is not true of their book. */
      return (
        <Trans>
          The Studio couldn't reach the publishing service in your Cloudflare account, so nothing
          was sent. Your link and everything on it are untouched. It already tried a few times —
          check this computer's connection and try again.
        </Trans>
      )
    case "snapshot_too_large":
      return (
        <Trans>
          The whole book is sent as a single file, and Cloudflare accepts at most {MAX_MEGABYTES} MB
          at a time. This book's export is bigger than that. Publishing it will need fewer or
          smaller videos, audio files or images — the sign-language videos are usually the heaviest
          part.
        </Trans>
      )
    default:
      return (
        <Trans>
          Publishing stopped before it finished, and nothing was shared. Trying again is safe.
        </Trans>
      )
  }
}

function action(failure: PublishFailure): ReactNode {
  if (failure.code === "publish_not_connected" || failure.code === "upload_failed") {
    return (
      <PublishingSettingsLink variant="outline" size="sm" className="self-start">
        <Trans>Open publishing settings</Trans>
      </PublishingSettingsLink>
    )
  }
  return null
}

interface PublishErrorNoticeProps {
  failure: PublishFailure
  children?: ReactNode
}

export function PublishErrorNotice({ failure, children }: PublishErrorNoticeProps) {
  return (
    <div
      data-testid={`publish-error-${failure.code}`}
      className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200"
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        {title(failure)}
      </span>
      <p className="text-sm leading-6 text-muted-foreground">{body(failure)}</p>
      {failure.detail && <p className="text-xs leading-5 text-muted-foreground">{failure.detail}</p>}
      {action(failure)}
      {children}
    </div>
  )
}
