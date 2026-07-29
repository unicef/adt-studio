import { useState } from "react"
import { MoreHorizontal, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Trans, useLingui } from "@lingui/react/macro"

type PromptFolderActionsProps = {
  modelId: string
  isActive: boolean
  isDeleting: boolean
  onDelete: () => Promise<unknown>
}

export function PromptFolderActions({
  modelId,
  isActive,
  isDeleting,
  onDelete,
}: PromptFolderActionsProps) {
  const { t } = useLingui()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleDelete = async () => {
    await onDelete()
    setConfirmOpen(false)
  }

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={[
              "h-7 w-7 shrink-0 text-muted-foreground transition-opacity hover:text-foreground",
              isActive
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
            ].join(" ")}
            aria-label={t`Folder actions`}
            title={t`Folder actions`}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-36 rounded-md p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start px-2 text-xs text-destructive hover:text-destructive"
            disabled={isDeleting}
            onClick={() => {
              setPopoverOpen(false)
              setConfirmOpen(true)
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <Trans>Delete folder</Trans>
          </Button>
        </PopoverContent>
      </Popover>

      <Dialog open={confirmOpen} onOpenChange={(open) => !isDeleting && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Delete prompt folder?</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                This removes all model-specific global prompt versions in this folder. Shipped fallback files remain available.
              </Trans>
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border bg-muted/20 px-3 py-2 font-mono text-xs">
            {modelId}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={isDeleting}
            >
              <Trans>Cancel</Trans>
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Trans>Deleting...</Trans> : <Trans>Delete</Trans>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
