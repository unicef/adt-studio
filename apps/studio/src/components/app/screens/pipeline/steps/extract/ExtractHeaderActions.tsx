import { Trans } from "@lingui/react/macro"
import { ArrowUpRight, BookOpen, ChevronDown, FileText, type LucideIcon } from "lucide-react"
import { BASE_URL } from "@/api/client"
import { cn } from "@/lib/utils"
import { BookInfoPopover } from "@/components/app/screens/pipeline/chrome/BookInfoPopover"

const BUTTON =
  "flex h-9 items-center gap-2 rounded-[10px] border bg-card pr-3 pl-1.5 text-[12.5px] font-semibold shadow-sm transition-[background-color,box-shadow,transform,border-color] duration-150 ease-out hover:-translate-y-px hover:border-[color-mix(in_srgb,var(--tint)_40%,transparent)] hover:shadow-md active:translate-y-0 active:scale-[0.98] motion-reduce:transition-none"

const MENU_OPEN =
  "group/bookinfo data-[state=open]:translate-y-0 data-[state=open]:border-[color-mix(in_srgb,var(--tint)_45%,transparent)] data-[state=open]:bg-[color-mix(in_srgb,var(--tint)_6%,var(--card))] data-[state=open]:shadow-sm"

function Tile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[color-mix(in_srgb,var(--tint)_14%,transparent)] text-[var(--tint)]">
      <Icon className="size-3.5" />
    </span>
  )
}

export function ExtractHeaderActions({ label, hex }: { label: string; hex: string }) {
  return (
    <div className="flex items-center gap-2" style={{ ["--tint" as string]: hex }}>
      <BookInfoPopover
        label={label}
        withLabel
        icon={<Tile icon={BookOpen} />}
        trailing={<ChevronDown className="size-3.5 text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]/bookinfo:rotate-180 motion-reduce:transition-none" />}
        triggerClassName={cn(BUTTON, MENU_OPEN)}
      />
      <a href={`${BASE_URL}/books/${label}/source-pdf`} target="_blank" rel="noreferrer" className={BUTTON}>
        <Tile icon={FileText} />
        <Trans>Source PDF</Trans>
        <ArrowUpRight className="size-3.5 text-muted-foreground" />
      </a>
    </div>
  )
}
