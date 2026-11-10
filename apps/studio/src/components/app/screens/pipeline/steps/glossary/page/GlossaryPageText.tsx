import { Trans } from "@lingui/react/macro"
import { FileText } from "lucide-react"
import type { PageDetail } from "@/api/client"
import { cn } from "@/lib/utils"
import { needsClamp } from "../../shared/page-inspector/ClampedText"
import { PageSection } from "../../shared/page-inspector/PageSection"
import { SEE_MORE } from "../../shared/page-inspector/SeeMoreButton"
import type { SectionMore } from "../../shared/page-inspector/useInspectorSheet"
import { READING_TEXT } from "../../extract/page-detail/sections/TextSection"
import { noTextLine } from "../../extract/page-detail/emptyCopy"
import type { GlossaryRow } from "../glossaryRows"
import { HighlightedText } from "./HighlightedText"

const LINES = 8

export function GlossaryPageText({
  page,
  rows,
  activeKey,
  onHover,
  onSelect,
  more,
}: {
  page: PageDetail
  rows: readonly GlossaryRow[]
  activeKey: string | null
  onHover: (key: string | null) => void
  onSelect: (key: string) => void
  more: SectionMore
}) {
  const text = page.text?.trim()
  if (!text) return <PageSection icon={FileText} title={<Trans>Text</Trans>} empty={noTextLine(page)} />
  const clamp = needsClamp(text, LINES)
  return (
    <PageSection
      icon={FileText}
      title={<Trans>Text</Trans>}
      aside={
        rows.length > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            <Trans>Terms are highlighted</Trans>
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3.5">
        <div className="relative">
          <div className={cn(clamp && "overflow-hidden")} style={clamp ? { maxHeight: `calc(${LINES} * 1.625em)` } : undefined}>
            <HighlightedText
              text={text}
              rows={rows}
              activeKey={activeKey}
              onHover={onHover}
              onSelect={onSelect}
              className={cn(READING_TEXT, "text-[14px] leading-relaxed")}
            />
          </div>
          {clamp && <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />}
        </div>
        {clamp && (
          <button ref={more.buttonRef} type="button" aria-haspopup="dialog" aria-expanded={more.open} onClick={more.onMore} className={SEE_MORE}>
            <Trans>See more</Trans>
          </button>
        )}
      </div>
    </PageSection>
  )
}
