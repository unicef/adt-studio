import { Trans, useLingui } from "@lingui/react/macro"
import type { TermOccurrence } from "@/components/pipeline/stages/glossary/lib/occurrences"
import { cn } from "@/lib/utils"

export interface OccurrencePage {
  pageId: string
  pageNumber: number
}

function PageChip({ page, onOpen, muted }: { page: OccurrencePage; onOpen: (pageId: string) => void; muted?: boolean }) {
  const { t } = useLingui()
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpen(page.pageId)
      }}
      aria-label={t`Open page ${page.pageNumber}`}
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-1.5 font-mono text-[10.5px] tabular-nums transition-colors hover:bg-muted hover:text-foreground",
        muted ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {t`p${page.pageNumber}`}
    </button>
  )
}

export function OccurrenceSummary({
  occurrence,
  pages,
  loading,
  onOpenPage,
}: {
  occurrence: TermOccurrence | undefined
  pages: OccurrencePage[]
  loading: boolean
  onOpenPage: (pageId: string) => void
}) {
  const { t } = useLingui()
  if (loading) return <span aria-hidden className="block h-3 w-10 rounded bg-muted motion-safe:animate-pulse" />
  const count = occurrence?.count ?? 0
  if (count === 0) {
    return (
      <span className="text-[11px] italic text-muted-foreground">
        <Trans>Not found in the text</Trans>
      </span>
    )
  }
  const shown = pages.slice(0, 2)
  const more = pages.length - shown.length
  return (
    <span className="flex items-center gap-1">
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{t`${count}×`}</span>
      {shown.map((page) => (
        <PageChip key={page.pageId} page={page} onOpen={onOpenPage} muted />
      ))}
      {more > 0 && <span className="font-mono text-[10.5px] text-muted-foreground">{t`+${more}`}</span>}
    </span>
  )
}

export function OccurrenceList({
  occurrence,
  pages,
  onOpenPage,
}: {
  occurrence: TermOccurrence | undefined
  pages: OccurrencePage[]
  onOpenPage: (pageId: string) => void
}) {
  const count = occurrence?.count ?? 0
  if (count === 0) {
    return (
      <p className="text-[12px] italic text-muted-foreground">
        <Trans>Not found in the text</Trans>
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
      <Trans>
        Appears {count}× · on pages
      </Trans>
      {pages.map((page) => (
        <PageChip key={page.pageId} page={page} onOpen={onOpenPage} />
      ))}
    </div>
  )
}
