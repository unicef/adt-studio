import { Trans } from "@lingui/react/macro"
import { FileText, Image as ImageIcon } from "lucide-react"
import type { PageSummaryItem } from "@/api/client"
import { INSPECTOR_PANEL, INSPECTOR_PANEL_BODY } from "../../shared/page-inspector/layout"
import { SkeletonBar, SkeletonLine } from "../../shared/page-inspector/loading/SkeletonBar"
import { CAPTION_PREVIEW } from "./CaptionImagesSection"

function SectionHeader({ icon: Icon, children }: { icon: typeof ImageIcon; children: React.ReactNode }) {
  return (
    <header className="flex min-h-7 items-center gap-2">
      <Icon className="size-3.5 text-muted-foreground" />
      {children}
    </header>
  )
}

export function CaptionsPlaceholderPanel({ summary }: { summary: PageSummaryItem | null }) {
  const count = summary?.captionCount ?? null
  const rows = count != null ? Math.min(Math.max(count, 1), CAPTION_PREVIEW) : 2
  const preview = summary?.textPreview.trim()
  return (
    <aside className={INSPECTOR_PANEL}>
      <div className={INSPECTOR_PANEL_BODY}>
        <section className="flex flex-col gap-2.5">
          <SectionHeader icon={ImageIcon}>
            {count != null ? (
              <h2 className="text-[13px] font-semibold text-foreground">
                <Trans>Images · {count}</Trans>
              </h2>
            ) : (
              <SkeletonBar className="h-3 w-20" />
            )}
          </SectionHeader>
          <div className="flex flex-col gap-2">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="flex flex-col gap-2 rounded-xl border p-2.5">
                <div className="flex items-start gap-2.5">
                  <SkeletonBar className="size-14 rounded-lg" />
                  <div className="flex flex-1 flex-col gap-2 pt-1">
                    <SkeletonBar className="h-2.5 w-32" />
                    <SkeletonBar className="h-2.5 w-20" />
                  </div>
                </div>
                <SkeletonBar className="h-14 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-2.5">
          <SectionHeader icon={FileText}>
            <h2 className="text-[13px] font-semibold text-foreground">
              <Trans>Text</Trans>
            </h2>
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
