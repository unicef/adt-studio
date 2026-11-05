import { useEffect } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ExportOptionsDialog } from "./options/ExportOptionsDialog"
import { cancelExportPopover, useExportPopoverOpen } from "./exportPopover"
import { useExportFlow } from "./useExportFlow"

export interface ExportLauncherProps {
  label: string
  ready: boolean
  settled: boolean
  className: string
  describedBy?: string
}

function ExportDialogEntry({ label, className }: { label: string; className: string }) {
  const flow = useExportFlow(label)
  const [open, setOpen] = useExportPopoverOpen(label)
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Trans>Export</Trans>
      </button>
      <ExportOptionsDialog flow={flow} label={label} open={open} onOpenChange={setOpen} />
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
      </button>
    )
  }
  return <ExportDialogEntry label={label} className={className} />
}
