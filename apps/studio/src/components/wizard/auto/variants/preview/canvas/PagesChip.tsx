import { Trans } from "@lingui/react/macro"
import { ChevronDown, FileText, Upload } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { usePdfField } from "@/components/wizard/core/fields/PdfField"
import { ScopeField, useScopeSummary } from "@/components/wizard/core/fields/ScopeField"

/**
 * Which pages to convert: the user's choice, never the AI's. A quiet chip with the current range
 * that opens the wizard's own page choice; changing the PDF lives here too.
 */
export function PagesChip({ onReplace }: { onReplace: () => void }) {
  const { totalPages } = usePdfField()
  const summary = useScopeSummary(totalPages)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-card px-3.5 text-[13px] font-semibold shadow-sm ring-1 ring-border transition-[box-shadow,background-color] duration-150 hover:ring-brand-300 data-[state=open]:ring-brand-400">
          <FileText className="size-3.5 text-brand-600" />
          {totalPages > 0 ? summary : <Trans>Counting pages…</Trans>}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(420px,calc(100vw-24px))] rounded-2xl p-4">
        <p className="mb-3 text-[14px] font-semibold">
          <Trans>Pages to convert</Trans>
        </p>
        <ScopeField />
        <div className="mt-4 border-t pt-3">
          <button type="button" onClick={onReplace} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <Upload className="size-3.5" />
            <Trans>Use another PDF</Trans>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
