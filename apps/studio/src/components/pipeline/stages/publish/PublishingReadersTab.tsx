import { Trans } from "@lingui/react/macro"
import { Loader2, Users } from "lucide-react"
import { StageEmptyState } from "@/components/pipeline/components/StageEmptyState"
import { PublicationReaders } from "@/components/publications/PublicationReaders"
import { useBookPublication } from "@/hooks/use-book-publication"

/**
 * Who has been through this book's door.
 *
 * The same panel the published-books shelf shows, keyed by this book's token — and with the same
 * caveat, which the panel itself states: it lists readers who gave a name, not everyone who
 * opened the link.
 */
export function PublishingReadersTab({ bookLabel }: { bookLabel: string }) {
  const status = useBookPublication(bookLabel)

  if (status.isPending) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <Trans>Checking whether this book is shared…</Trans>
      </div>
    )
  }

  const token = status.data?.record?.token ?? null

  if (token === null) {
    return (
      <StageEmptyState
        icon={Users}
        color="violet"
        title={<Trans>Nobody can be reading yet</Trans>}
        subtitle={
          <Trans>
            This book has not been published, so there is no link for anyone to open. Publish it
            from the Overview tab and the readers who join will be listed here.
          </Trans>
        }
      />
    )
  }

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <PublicationReaders token={token} />
    </div>
  )
}
