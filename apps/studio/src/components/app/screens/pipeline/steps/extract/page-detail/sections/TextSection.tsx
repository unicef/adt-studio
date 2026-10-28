import { Trans } from "@lingui/react/macro"
import { FileText, Loader2 } from "lucide-react"
import type { PageDetail } from "@/api/client"
import { cn } from "@/lib/utils"
import { ClampedText } from "../ClampedText"
import { noTextLine } from "../emptyCopy"
import { PageSection } from "../PageSection"
import type { SectionMore } from "./types"

export const TEXT_PREVIEW_LINES = 8

export const READING_TEXT = "max-w-[70ch] whitespace-pre-wrap text-pretty text-foreground/90"

export function TextSection({ page, metadataRunning, more }: { page: PageDetail; metadataRunning: boolean; more: SectionMore }) {
  if (!page.text) return <PageSection icon={FileText} title={<Trans>Text</Trans>} empty={noTextLine(page)} />
  return (
    <PageSection icon={FileText} title={<Trans>Text</Trans>}>
      {metadataRunning && (
        <p role="status" className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          <Trans>Processing metadata…</Trans>
        </p>
      )}
      <div className="rounded-xl border bg-card px-4 py-3.5">
        <ClampedText
          text={page.text.trim()}
          lines={TEXT_PREVIEW_LINES}
          className={cn(READING_TEXT, "text-[14px] leading-relaxed")}
          moreLabel={<Trans>See more</Trans>}
          onMore={more.onMore}
          buttonRef={more.buttonRef}
        />
      </div>
    </PageSection>
  )
}
