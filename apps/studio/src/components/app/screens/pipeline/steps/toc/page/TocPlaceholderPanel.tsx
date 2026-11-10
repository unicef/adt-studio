import { Trans } from "@lingui/react/macro"
import { FileText, ListTree } from "lucide-react"
import type { PageSummaryItem, TocEntry } from "@/api/client"
import { INSPECTOR_PANEL, INSPECTOR_PANEL_BODY } from "../../shared/page-inspector/layout"
import { SkeletonBar, SkeletonLine } from "../../shared/page-inspector/loading/SkeletonBar"
import { TocLevelChip } from "../TocLevelChip"
import { compactIndent } from "./TocCompactEntry"
import { TOC_ENTRY_PREVIEW, TocEntriesTitle } from "./TocEntriesSection"

function SectionHeader({ icon: Icon, children }: { icon: typeof ListTree; children: React.ReactNode }) {
  return (
    <header className="flex min-h-7 items-center gap-2">
      <Icon className="size-3.5 text-muted-foreground" />
      <h2 className="text-[13px] font-semibold text-foreground">{children}</h2>
    </header>
  )
}

export function TocPlaceholderPanel({ summary, entries, hex }: { summary: PageSummaryItem | null; entries: readonly TocEntry[]; hex: string }) {
  const preview = summary?.textPreview.trim()
  return (
    <aside className={INSPECTOR_PANEL}>
      <div className={INSPECTOR_PANEL_BODY}>
        {entries.length === 0 ? (
          <p className="flex min-h-7 items-center gap-2 text-[12.5px] text-muted-foreground">
            <ListTree className="size-3.5 shrink-0" />
            <Trans>No entries link to this page.</Trans>
          </p>
        ) : (
          <section className="flex flex-col gap-2.5">
            <SectionHeader icon={ListTree}>
              <TocEntriesTitle count={entries.length} />
            </SectionHeader>
            <div className="flex flex-col gap-2">
              {entries.slice(0, TOC_ENTRY_PREVIEW).map((entry) => (
                <div key={entry.id} className="flex flex-col gap-2 rounded-xl border bg-card p-2.5" style={{ marginInlineStart: compactIndent(entry.level) }}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <TocLevelChip level={entry.level} hex={hex} />
                    <span className="min-w-0 flex-1 truncate px-1.5 py-1 text-[13px] font-medium">{entry.title}</span>
                  </div>
                  <div className="flex h-6 items-center gap-1">
                    <SkeletonBar className="h-6 w-32 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        <section className="flex flex-col gap-2.5">
          <SectionHeader icon={FileText}>
            <Trans>Text</Trans>
          </SectionHeader>
          <div className="rounded-xl border bg-card px-4 py-3.5 text-[14px] leading-relaxed">
            {preview ? <p className="line-clamp-3 text-foreground/90">{preview}</p> : null}
            {Array.from({ length: preview ? 2 : 4 }, (_, index) => (
              <SkeletonLine key={index} className={index % 2 ? "w-[88%]" : "w-full"} />
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}
