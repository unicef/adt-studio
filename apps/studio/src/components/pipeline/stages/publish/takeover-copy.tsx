import { Trans } from "@lingui/react/macro"
import type { ReactNode } from "react"
import type { BookPublishRunController } from "@/hooks/use-book-publication"

/**
 * What the run screen says, kept apart from how any one of them lays it out.
 *
 * Two runs, three outcomes and one sentence that has to be right in all six: an update has
 * readers already on a version and the reassurance they need is that nothing moves under them; a
 * first publish has no readers yet, so the reassurance is the opposite one — that nothing is
 * shared until this finishes. Getting that wrong in one layout and right in another is how a
 * design review ends up comparing sentences instead of designs.
 */
export interface TakeoverCopyInput {
  run: BookPublishRunController
  title: string
  /** The version readers stay on while an update runs; null on a first publish. */
  fromVersion: number | null
}

export function takeoverHeading({ run }: TakeoverCopyInput): ReactNode {
  const first = run.kind === "publish"

  if (run.status === "error") return <Trans>Publishing stopped</Trans>
  if (run.status === "done") {
    return first ? (
      <Trans>Your book is online</Trans>
    ) : (
      <Trans>The link now shows your latest version</Trans>
    )
  }
  return first ? <Trans>Putting your book online</Trans> : <Trans>Updating the shared copy</Trans>
}

export function takeoverDetail({ run, title, fromVersion }: TakeoverCopyInput): ReactNode {
  const first = run.kind === "publish"

  if (run.status === "error") {
    return first ? (
      <Trans>Nothing has been shared — your book is exactly as it was.</Trans>
    ) : (
      <Trans>Nothing changed for your readers — they are still reading the copy you had.</Trans>
    )
  }

  if (run.status === "done") {
    return first ? (
      <Trans>Getting your link ready…</Trans>
    ) : (
      <Trans>Everyone who already has the link sees the new copy.</Trans>
    )
  }

  if (first) return <Trans>{title} — nothing is shared until this finishes.</Trans>
  if (fromVersion === null) return <Trans>{title} — your readers keep reading until this finishes.</Trans>
  return (
    <Trans>
      {title} — readers stay on version {fromVersion} until this finishes.
    </Trans>
  )
}
