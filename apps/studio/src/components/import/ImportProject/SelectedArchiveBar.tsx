import { Trans } from "@lingui/react/macro"
import { FileArchive, FileUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { formatBytes } from "@/lib/utils"

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
    <div className="mb-3 flex min-h-12 items-center justify-between gap-4 rounded-lg border border-border bg-card px-3 py-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <FileArchive className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-foreground">{file.name}</p>
          <p className="text-[11px] tabular-nums text-muted-foreground">{formatBytes(displaySize)}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onReplace}
        disabled={disabled}
        className="h-8 shrink-0 px-3 text-xs"
      >
        <FileUp className="size-3.5" />
        <Trans>Replace archive</Trans>
      </Button>
    </div>
  )
}
