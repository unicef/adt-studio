import { Trans, useLingui } from "@lingui/react/macro"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { keepOpenForLab } from "@/components/app/lab/keepOpen"
import { accentStyle } from "../ExportParts"
import { ExportSteps } from "./ExportSteps"
import type { ExportFlow } from "../useExportFlow"

export function ExportOptionsDialog({
  flow,
  label,
  open,
  onOpenChange,
}: {
  flow: ExportFlow
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useLingui()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={accentStyle(flow.format)}
        onInteractOutside={keepOpenForLab}
        className="flex h-[min(640px,88vh)] w-[94vw] max-w-[1080px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl"
      >
        <DialogTitle className="sr-only">{t`Export`}</DialogTitle>
        <DialogDescription className="sr-only">
          <Trans>Choose a format and what goes in, then export.</Trans>
        </DialogDescription>
        <ExportSteps flow={flow} label={label} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
