import { useEffect, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ChevronDown, SlidersHorizontal } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { BookLine, BookThumb, ExportGoButton, IncludedChips, accentStyle, useExportBook } from "./ExportParts"
import { ExportStepDialog } from "./ExportStepDialog"
import { ExportFormatGroups } from "./ExportFormatGroups"
import { cancelExportPopover, useExportPopoverOpen } from "./exportPopover"
import { useExportFlow } from "./useExportFlow"

export interface ExportLauncherProps {
  label: string
  ready: boolean
  settled: boolean
  className: string
  describedBy?: string
}

function OptionsLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-(--accent) transition-colors duration-200 hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]"
    >
      <SlidersHorizontal className="size-3.5" />
      <Trans>Options…</Trans>
    </button>
  )
}

function ExportPopover({ label, className }: { label: string; className: string }) {
  const flow = useExportFlow(label)
  const book = useExportBook(label)
  const [open, setOpen] = useExportPopoverOpen(label)
  const [options, setOptions] = useState(false)
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={className}>
            <Trans>Export</Trans>
            <ChevronDown className={cn("-mr-1 size-3.5 transition-transform duration-200", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={8} style={accentStyle(flow.format)} className="w-[440px] overflow-hidden p-0">
          <div className="flex items-center gap-3 px-4 pb-3 pt-3.5">
            <BookThumb src={book.cover} className="h-11 w-8" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14px] font-semibold leading-tight">
                <Trans>Export</Trans>
              </span>
              <BookLine label={label} />
            </div>
          </div>
          <div className="border-t px-2 py-2">
            <ExportFormatGroups flow={flow} />
          </div>
          <div className="rounded-b-[inherit] border-t bg-[color-mix(in_oklab,var(--accent)_5%,transparent)] px-4 pb-4 pt-3 transition-[background-color] duration-300">
            <div className="flex h-7 items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Trans>What goes in</Trans>
              </span>
              <OptionsLink
                onClick={() => {
                  setOpen(false)
                  setOptions(true)
                }}
              />
            </div>
            <div className="mt-1 h-[22px]">
              <IncludedChips flow={flow} label={label} />
            </div>
            <ExportGoButton flow={flow} onDone={() => setOpen(false)} className="mt-3.5 w-full" />
          </div>
        </PopoverContent>
      </Popover>
      <ExportStepDialog flow={flow} label={label} open={options} onOpenChange={setOptions} />
    </>
  )
}

export function ExportLauncher({ label, ready, settled, className, describedBy }: ExportLauncherProps) {
  const { t } = useLingui()
  useEffect(() => {
    if (settled && !ready) cancelExportPopover(label)
  }, [settled, ready, label])
  if (!ready) {
    return (
      <button type="button" aria-disabled aria-describedby={describedBy} aria-label={t`Export the book`} className={className}>
        <Trans>Export</Trans>
        <ChevronDown aria-hidden className="-mr-1 size-3.5" />
      </button>
    )
  }
  return <ExportPopover label={label} className={className} />
}
