import type { ReactNode } from "react"
import { Play, TriangleAlert } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * Confirmation modal shown before running a stage when the current settings are
 * likely to produce poor results (e.g. running a feature that doesn't support
 * the book's fixed-layout rendering mode). Purely advisory — the user can
 * always proceed. The caller supplies the warning copy; the confirm button
 * reuses the stage accent color so it reads as "run this stage anyway".
 */
export function RunWarningDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmColorClass,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  confirmColorClass: string
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader className="flex-row items-start gap-3.5 space-y-0 text-left">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 shadow-sm"
            aria-hidden
          >
            <TriangleAlert className="h-5 w-5 text-amber-600" strokeWidth={2} />
          </span>
          <div className="flex min-w-0 flex-col gap-1 pt-0.5">
            <DialogTitle className="text-[16px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
              {title}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-snug text-[#525252]">
              {description}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="-mx-6 border-t border-[#f1f1f1]" aria-hidden />
        <DialogFooter className="-mt-1 gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-10 px-4 font-medium text-[#525252] hover:text-[#0a0a0a]"
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={onConfirm}
            className={cn(
              "h-10 px-5 font-medium text-white border-0 shadow-sm",
              confirmColorClass,
            )}
          >
            <Play className="w-4 h-4 mr-2" />
            <Trans>Run anyway</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
