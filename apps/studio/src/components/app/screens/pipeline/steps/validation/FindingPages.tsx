import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FindingPageLabel } from "./report"

const VISIBLE = 6

export interface FindingPage extends FindingPageLabel {
  sectionId: string
  href: string
  count: number
}

const PAGE_CHIP = cn(
  "inline-flex h-7 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-[11.5px] font-medium text-foreground",
  "transition-[background-color,border-color] duration-150 hover:border-[color-mix(in_srgb,var(--chrome-hex)_40%,transparent)] hover:bg-muted motion-reduce:transition-none",
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
)

export function FindingPages({ pages, onOpenPage }: { pages: FindingPage[]; onOpenPage: (href: string) => void }) {
  const { t } = useLingui()
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? pages : pages.slice(0, VISIBLE)
  const labelOf = (page: FindingPage) => {
    const name =
      page.quiz != null ? t`Quiz ${page.quiz}` : page.pageNumber != null ? t`Page ${page.pageNumber}` : page.pageId ? t`Page ${page.pageId}` : page.href
    return page.part != null ? t`${name}, section ${page.part}` : name
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-medium text-muted-foreground">{t`Where it happens`}</span>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((page) => (
          <button
            key={page.sectionId}
            type="button"
            onClick={() => onOpenPage(page.href)}
            className={PAGE_CHIP}
            title={t`Open in Preview`}
          >
            <FileText aria-hidden className="size-3 text-muted-foreground" />
            {labelOf(page)}
            {page.count > 1 && <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">×{page.count}</span>}
          </button>
        ))}
        {pages.length > VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="h-7 rounded-lg px-2 text-[11.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {expanded ? t`Show fewer` : t`Show all ${pages.length}`}
          </button>
        )}
      </div>
    </div>
  )
}
