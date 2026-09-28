import { Trans } from "@lingui/react/macro"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAppVersion } from "@/hooks/use-app-version"
import { useUpdateStatus, type UpdateStatus } from "@/hooks/use-update-status"
import { UpdateStateSurface } from "./UpdateStateSurface"

export interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  statusOverride?: UpdateStatus
  modal?: boolean
  onShowWhatsNew?: () => void
  onSeeDetails?: (payload: { version: string; releaseNotes?: string }) => void
}

export function UpdateDialog({
  open,
  onOpenChange,
  statusOverride,
  modal,
  onShowWhatsNew,
  onSeeDetails,
}: UpdateDialogProps) {
  const currentVersion = useAppVersion()
  const live = useUpdateStatus()
  const status = statusOverride ?? live.status
  const { check, download, cancel, install, installOnQuit } = live
  const detailsPayload =
    status.phase === "available" || status.phase === "downloaded"
      ? { version: status.version, releaseNotes: status.releaseNotes }
      : null
  const close = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogContent
        overlayClassName="bg-black/55 backdrop-blur-[1px] data-[state=closed]:duration-150 data-[state=open]:duration-200 motion-reduce:animate-none"
        className="gap-0 overflow-hidden border-0 p-0 shadow-2xl ring-1 ring-black/5 data-[state=closed]:duration-150 data-[state=open]:duration-200 motion-reduce:animate-none sm:max-w-125 sm:rounded-xl dark:ring-white/10 [&>button]:top-2 [&>button]:right-2"
      >
        <DialogDescription className="sr-only">
          <Trans>Software update status</Trans>
        </DialogDescription>
        <UpdateStateSurface
          status={status}
          currentVersion={currentVersion}
          TitleTag={DialogTitle}
          onCheck={check}
          onDownload={download}
          onCancel={cancel}
          onInstallNow={install}
          onInstallLater={async () => {
            await installOnQuit()
            close()
          }}
          onClose={close}
          onShowWhatsNew={onShowWhatsNew}
          onSeeDetails={
            onSeeDetails && detailsPayload
              ? () => onSeeDetails(detailsPayload)
              : undefined
          }
        />
      </DialogContent>
    </Dialog>
  )
}
