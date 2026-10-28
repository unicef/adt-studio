import { Trans } from "@lingui/react/macro"
import { ArrowUpRight, BookOpen, ChevronDown, FileText } from "lucide-react"
import { BASE_URL } from "@/api/client"
import { cn } from "@/lib/utils"
import { BookInfoPopover } from "@/components/app/screens/pipeline/chrome/BookInfoPopover"
import { HEADER_BUTTON, HEADER_BUTTON_LABELLED, HEADER_MENU_OPEN, HeaderButtonTile } from "../shared/headerButton"

export function ExtractHeaderActions({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <BookInfoPopover
        label={label}
        withLabel
        icon={<HeaderButtonTile icon={BookOpen} />}
        trailing={<ChevronDown className="size-3.5 text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]/headermenu:rotate-180 motion-reduce:transition-none" />}
        triggerClassName={cn(HEADER_BUTTON, HEADER_BUTTON_LABELLED, HEADER_MENU_OPEN)}
      />
      <a href={`${BASE_URL}/books/${label}/source-pdf`} target="_blank" rel="noreferrer" className={cn(HEADER_BUTTON, HEADER_BUTTON_LABELLED)}>
        <HeaderButtonTile icon={FileText} />
        <Trans>Source PDF</Trans>
        <ArrowUpRight className="size-3.5 text-muted-foreground" />
      </a>
    </div>
  )
}
