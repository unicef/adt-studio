import { Trans } from "@lingui/react/macro"
import type { AdtBundleImportPreview, AnyImportPreview } from "@/api/client"
import { isAdtBundleImportPreview, isPartImportPreview } from "@/api/client"
import { CopyTextButton } from "@/components/import/CopyTextButton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export function ValidationDialog({
  preview,
  open,
  onOpenChange,
}: {
  preview: AnyImportPreview
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const issues = isAdtBundleImportPreview(preview) ? preview.compatibility.issues : []
  const projectError = !isPartImportPreview(preview) && !isAdtBundleImportPreview(preview)
    ? preview.validationError
    : null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-2xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <DialogHeader>
          <DialogTitle><Trans>Validation details</Trans></DialogTitle>
          <DialogDescription>
            <Trans>Use these file paths and issue codes when repairing the archive.</Trans>
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto rounded-lg border border-slate-200">
          {projectError ? (
            <p className="break-words p-4 font-mono text-xs leading-relaxed text-slate-700">{projectError}</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {issues.map((issue, index) => (
                <li key={`${issue.code}:${issue.pageHref}:${index}`} className="grid gap-1 p-4 text-xs sm:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)_auto] sm:gap-4">
                  <span className="font-mono font-semibold text-slate-900">{issue.pageHref}</span>
                  <span className="break-words text-slate-600">{issue.detail ?? issue.code}</span>
                  <code className="text-[10px] text-slate-500">{issue.code}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}


export function GuideDialog({
  preview,
  open,
  onOpenChange,
}: {
  preview: AdtBundleImportPreview
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[82vh] max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden">
        <DialogHeader>
          <DialogTitle><Trans>AI repair guide</Trans></DialogTitle>
          <DialogDescription>
            <Trans>Open the unzipped archive in an AI coding assistant and use the current ADT Studio editing rules.</Trans>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <CopyTextButton value={preview.agentGuide.repairPrompt}>
            <Trans>Copy repair request</Trans>
          </CopyTextButton>
          {preview.agentGuide.status !== "current" ? (
            <CopyTextButton value={preview.agentGuide.currentGuide}>
              <Trans>Copy current guide</Trans>
            </CopyTextButton>
          ) : null}
        </div>
        <pre className="min-h-0 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-[11px] leading-relaxed text-slate-100">
          <code>{preview.agentGuide.currentGuide}</code>
        </pre>
      </DialogContent>
    </Dialog>
  )
}

