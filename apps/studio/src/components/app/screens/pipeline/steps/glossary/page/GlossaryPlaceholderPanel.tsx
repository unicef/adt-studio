import { Trans } from "@lingui/react/macro"
import { BookOpen, FileText } from "lucide-react"
import type { PageSummaryItem } from "@/api/client"
import { INSPECTOR_PANEL, INSPECTOR_PANEL_BODY } from "../../shared/page-inspector/layout"
import { SkeletonLine } from "../../shared/page-inspector/loading/SkeletonBar"
import { SourceMark } from "../GlossaryRowSummary"
import type { GlossaryRow } from "../glossaryRows"
import { TERM_PREVIEW } from "./GlossaryTermsSection"

function SectionHeader({ icon: Icon, children }: { icon: typeof BookOpen; children: React.ReactNode }) {
  return (
    <header className="flex min-h-7 items-center gap-2">
      <Icon className="size-3.5 text-muted-foreground" />
      <h2 className="text-[13px] font-semibold text-foreground">{children}</h2>
    </header>
  )
}

export function GlossaryPlaceholderPanel({ rows, hex, summary }: { rows: readonly GlossaryRow[]; hex: string; summary: PageSummaryItem | null }) {
  const shown = rows.slice(0, TERM_PREVIEW)
  const preview = summary?.textPreview.trim()
  return (
    <aside className={INSPECTOR_PANEL}>
      <div className={INSPECTOR_PANEL_BODY}>
        {rows.length === 0 ? (
          <p className="flex min-h-7 items-center gap-2 text-[12.5px] text-muted-foreground">
            <BookOpen className="size-3.5 shrink-0" />
            <Trans>No glossary terms appear on this page.</Trans>
          </p>
        ) : (
          <section className="flex flex-col gap-2.5">
            <SectionHeader icon={BookOpen}>
              <Trans>Terms · {rows.length}</Trans>
            </SectionHeader>
            <div className="flex flex-col gap-2">
              {shown.map((row) => (
                <div key={row._key} className="flex flex-col gap-2 rounded-xl border bg-card p-2.5">
                  <div className="flex min-h-7 items-center gap-1.5">
                    <SourceMark row={row} hex={hex} />
                    <span className="truncate text-[13px] font-semibold text-foreground">{row.word}</span>
                    {row.emojis.length > 0 && <span aria-hidden className="text-[13px] tracking-[2px]">{row.emojis.join("")}</span>}
                  </div>
                  <div className="rounded-md border px-2.5 py-1.5">
                    <p className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{row.definition}</p>
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
