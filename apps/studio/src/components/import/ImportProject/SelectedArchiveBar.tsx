import { Trans } from "@lingui/react/macro"
import { FileArchive, FileUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn, formatBytes } from "@/lib/utils"

export function SelectedArchiveBar({
  file,
  displaySize,
  disabled,
  onReplace,
}: {
  file: File
  displaySize: number
  disabled: boolean
  onReplace: () => void
}) {
  return (
    <div className="mb-3 flex min-h-10 items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <FileArchive className="h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-800">{file.name}</p>
          <p className="text-[11px] text-slate-500">{formatBytes(displaySize)}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onReplace}
        disabled={disabled}
        className="shrink-0 text-slate-600"
      >
        <FileUp className="h-4 w-4" />
        <Trans>Replace archive</Trans>
      </Button>
    </div>
  )
}
