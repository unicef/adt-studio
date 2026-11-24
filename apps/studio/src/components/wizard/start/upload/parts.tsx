import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileDropOverlay } from "@/components/ui/file-drop-overlay"
import { FlowTopBar } from "@/components/FlowTopBar"
import { cn } from "@/lib/utils"
import type { UploadFlow } from "./useUploadFlow"

/** FlowTopBar + full-window drop overlay + hidden input — the same chrome as develop's upload step. */
export function UploadChrome({ flow, children, className }: { flow: UploadFlow; children: ReactNode; className?: string }) {
  const { t } = useLingui()
  return (
    <div className={cn("relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background", className)}>
      <FlowTopBar title={t`Add Book`} />
      <FileDropOverlay overlay={flow.overlay} dropLabel={<Trans>Drop PDF here</Trans>} errorLabel={<Trans>Only PDF files are supported</Trans>} accent="blue" />
      <input ref={flow.inputRef} type="file" accept="application/pdf" className="hidden" onChange={flow.onInputChange} />
      {children}
    </div>
  )
}
