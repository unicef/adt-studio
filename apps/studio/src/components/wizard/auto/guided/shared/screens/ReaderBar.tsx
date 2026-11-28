import { Trans } from "@lingui/react/macro"
import { BookOpen, ChevronLeft, ChevronRight, Languages, LayoutGrid, List, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

/** The ADT reader's bottom bar, as it looks in a real exported book (computer vs phone variant). */
export function ReaderBar({ phone }: { phone?: boolean }) {
  const icon = "size-[18px] text-white/90"
  return (
    <div className={cn("flex shrink-0 items-center justify-between bg-[#2f2f2f] text-white", phone ? "h-[52px] px-5" : "h-[44px] px-5")}>
      {phone ? (
        <List className={icon} />
      ) : (
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
          <List className={icon} />
          <Trans>Contents</Trans>
        </span>
      )}
      <span className="inline-flex items-center gap-4 text-[13px] font-semibold tabular-nums">
        <ChevronLeft className={icon} />
        <span>
          3<span className="text-white/50">/12</span>
        </span>
        <ChevronRight className={icon} />
      </span>
      {phone ? (
        <LayoutGrid className={icon} />
      ) : (
        <span className="inline-flex items-center gap-4">
          <BookOpen className={icon} />
          <Languages className={icon} />
          <Settings className={icon} />
        </span>
      )}
    </div>
  )
}
