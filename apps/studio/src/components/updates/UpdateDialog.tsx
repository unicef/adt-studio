import { Trans } from "@lingui/react/macro"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAppVersion } from "@/hooks/use-app-version"
import { useUpdateStatus, type UpdateStatus } from "@/hooks/use-update-status"
import { cn } from "@/lib/utils"
import { BetaVersionsView } from "./beta/BetaVersionsView"
import { getReleaseChannel } from "./release-banner-utils"
import { UpdateStateSurface } from "./UpdateStateSurface"

export interface UpdateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  statusOverride?: UpdateStatus
  modal?: boolean
  onShowWhatsNew?: () => void
}

export function UpdateDialog({
  open,
  onOpenChange,
  statusOverride,
  modal,
  onShowWhatsNew,
}: UpdateDialogProps) {
  const currentVersion = useAppVersion()
  const live = useUpdateStatus()
  const status = statusOverride ?? live.status
  const { check, download, cancel, install, installOnQuit } = live
  const showBetaVersions =
    currentVersion != null &&
    getReleaseChannel(currentVersion) === "beta" &&
    status.phase !== "downloading" &&
    status.phase !== "downloaded" &&
    status.phase !== "installing"

  const close = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={modal}>
      <DialogContent
        overlayClassName="bg-black/55 backdrop-blur-[1px] data-[state=closed]:duration-150 data-[state=open]:duration-200 motion-reduce:animate-none"
        className={cn(
          "gap-0 overflow-hidden p-0 data-[state=closed]:duration-150 data-[state=open]:duration-200 motion-reduce:animate-none sm:rounded-xl [&>button]:top-2 [&>button]:right-2",
          showBetaVersions
            ? "border shadow-none sm:max-w-5xl"
            : "border-0 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 sm:max-w-125",
        )}
      >
        <DialogDescription className="sr-only">
          <Trans>Software update status</Trans>
        </DialogDescription>
        {showBetaVersions ? (
          <BetaVersionsView
            status={status}
            currentVersion={currentVersion}
            onClose={close}
          />
        ) : (
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
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
