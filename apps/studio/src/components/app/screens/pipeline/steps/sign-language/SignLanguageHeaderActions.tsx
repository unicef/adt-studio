import type { ReactNode } from "react"
import { MoreHorizontal, Trash2, Upload } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ActionMenu } from "@/components/ui/action-menu"
import { cn } from "@/lib/utils"
import { HEADER_BUTTON, HEADER_BUTTON_ICON, HEADER_MENU_OPEN } from "../shared/headerButton"
import { StepActionButton } from "../shared/StepActionButton"

export function SignLanguageHeaderActions({
  canUpload,
  uploadReason,
  onUpload,
  onRemoveAll,
}: {
  canUpload: boolean
  uploadReason: ReactNode
  onUpload: () => void
  onRemoveAll: () => void
}) {
  const { t } = useLingui()
  return (
    <div className="flex items-center gap-2">
      <StepActionButton look="header" icon={Upload} onClick={onUpload} disabled={!canUpload} disabledReason={uploadReason}>
        <Trans>Upload videos</Trans>
      </StepActionButton>
      <ActionMenu
        trigger={<MoreHorizontal className="size-4" />}
        triggerAriaLabel={t`More actions`}
        triggerClassName={cn(HEADER_BUTTON, HEADER_BUTTON_ICON, HEADER_MENU_OPEN)}
        menuClassName="min-w-[200px] rounded-[10px] p-1 [&_[role=menuitem]]:rounded-md [&_[role=menuitem]]:text-[12.5px]"
        items={[{ icon: Trash2, label: <Trans>Remove all videos…</Trans>, onClick: onRemoveAll, danger: true }]}
      />
    </div>
  )
}
