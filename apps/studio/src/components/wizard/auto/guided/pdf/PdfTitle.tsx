import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { ChevronDown } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Cover, MUTED, PdfDetails, type PdfProps } from "./parts"
import { PdfPages } from "./PdfPages"
import { cn } from "@/lib/utils"

/**
 * The PDF as the document title, after "Add Book" (like a document name in a title bar): a small
 * cover and the name, plain text. It opens a menu like the language one, with the details, its
 * pages, Change PDF and the picks.
 */
export function PdfTitle({ flow, picks, onEdit, locked }: PdfProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [pagesOpen, setPagesOpen] = useState(false)
  if (!flow.file) return null
  return (
    <>
      <span aria-hidden className="text-[13.5px] text-muted-foreground/50 max-sm:hidden">
        /
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t`${flow.title}: details and picks`}
            className="group flex h-8 min-w-0 max-w-[min(40vw,320px)] items-center gap-1.5 rounded-lg px-1.5 text-[13.5px] transition-colors hover:bg-muted data-[state=open]:bg-muted animate-in fade-in slide-in-from-left-1 duration-300 motion-reduce:animate-none"
          >
            <Cover flow={flow} />
            <span className="truncate font-medium">{flow.title}</span>
            <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none", MUTED)} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} className="w-[min(92vw,380px)] rounded-[16px] p-4">
          <PdfDetails flow={flow} picks={picks} onEdit={onEdit} locked={locked} onSeePages={() => setPagesOpen(true)} onDone={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
      <PdfPages file={flow.file} title={flow.title} pageCount={flow.pageCount} open={pagesOpen} onClose={() => setPagesOpen(false)} onChange={() => { setPagesOpen(false); flow.openPicker() }} locked={locked} />
    </>
  )
}
