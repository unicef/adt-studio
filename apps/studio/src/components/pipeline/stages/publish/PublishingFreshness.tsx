import { Trans } from "@lingui/react/macro"
import { CheckCircle2, PencilLine } from "lucide-react"
import type { BookPublicationVersionRecord } from "@/api/client"

interface PublishingFreshnessProps {
  /** The book's content revision right now. `null` when it could not be read. */
  contentRevision: number | null
  /** The version currently being served. */
  liveVersion: BookPublicationVersionRecord | null
}

/**
 * Whether what reviewers are reading is still what the author has.
 *
 * This is the question every visit to this page starts with, and until now the page could not
 * answer it: the version number tells you what was published, not whether you have since changed
 * anything. It compares content revisions — the highest `node_data` version, which moves only
 * when a step or an edit writes something — rather than file timestamps, because publishing
 * writes the publication record into the same database and so always *looks* like a fresh edit.
 *
 * Three states, and the third one matters most: a version published before revisions were
 * recorded can only say "unknown". Claiming "up to date" there would be a guess about the one
 * thing the author is relying on.
 */
export function PublishingFreshness({
  contentRevision,
  liveVersion,
}: PublishingFreshnessProps) {
  const published = liveVersion?.content_revision ?? null

  if (contentRevision === null || published === null) {
    return (
      <p
        data-testid="publish-freshness-unknown"
        className="flex items-start gap-2 rounded-xl border bg-muted/30 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground"
      >
        <PencilLine className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <Trans>
          This version was published before the Studio started tracking edits, so it can't tell
          whether your book has changed since. Updating the site makes them match.
        </Trans>
      </p>
    )
  }

  if (contentRevision <= published) {
    return (
      <p
        data-testid="publish-freshness-current"
        className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-xs leading-5 text-emerald-800"
      >
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        <Trans>Readers are seeing your current work — nothing has changed since you published.</Trans>
      </p>
    )
  }

  return (
    <p
      data-testid="publish-freshness-stale"
      className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs leading-5 text-amber-900"
    >
      <PencilLine className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <Trans>
        You have edited this book since it was published, so readers are seeing an older copy.
        Update the site when you want them to catch up.
      </Trans>
    </p>
  )
}
