import type { ComponentType, ReactNode } from "react"
import { Play } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import type { StageName } from "@adt/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getStageLabelI18n } from "../pipeline-i18n"
import { STAGES } from "../stage-config"

/**
 * Confirmation dialog shown before an action that resets completed downstream
 * stages. Lists the affected stages with their stage icons/colors. Reused by
 * the stage re-run flow (LandingPageShell) and by edits that invalidate
 * downstream work (e.g. changing the book language in the Extract metadata
 * panel). The caller computes `affectedStages` (typically via
 * `useDownstreamWithOutput`) so only stages with real output are listed.
 */
export function CascadeResetDialog({
  open,
  onOpenChange,
  affectedStages,
  headerStageSlug,
  title,
  description,
  confirmLabel,
  confirmColorClass,
  confirmDisabledReason,
  confirmIcon: ConfirmIcon = Play,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  affectedStages: StageName[]
  headerStageSlug?: string
  title: ReactNode
  description: ReactNode
  confirmLabel: ReactNode
  confirmColorClass: string
  /**
   * When set, the confirm button is disabled and this text explains why (shown
   * as a tooltip). Use for prerequisites the dialog can't satisfy itself — e.g.
   * a re-run that needs an API key.
   */
  confirmDisabledReason?: string
  /**
   * Icon on the confirm button. Defaults to `Play` for the re-run flows; pass a
   * fitting one for other actions (e.g. `Trash2` for a delete).
   */
  confirmIcon?: ComponentType<{ className?: string }>
  onConfirm: () => void
}) {
  const stages = affectedStages
    .map((slug) => STAGES.find((s) => s.slug === slug))
    .filter((s): s is (typeof STAGES)[number] => Boolean(s))
  const headerStage = headerStageSlug
    ? STAGES.find((s) => s.slug === headerStageSlug)
    : undefined

  const confirmButton = (
    <Button
      onClick={onConfirm}
      disabled={!!confirmDisabledReason}
      className={cn(
        "h-10 px-5 font-medium text-white border-0 shadow-sm disabled:opacity-50",
        confirmColorClass,
      )}
    >
      <ConfirmIcon className="w-4 h-4 mr-2" />
      {confirmLabel}
    </Button>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <DialogHeader className="flex-row items-start gap-3.5 space-y-0 text-left">
          {headerStage && (
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm",
                headerStage.color,
              )}
              aria-hidden
            >
              <headerStage.icon className="h-5 w-5 text-white" strokeWidth={2} />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1 pt-0.5">
            <DialogTitle className="text-[16px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
              {title}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-snug text-[#525252]">
              {description}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Nothing completed downstream — the dialog is then a plain
            confirmation, with no misleading empty "Will be reset · 0" block. */}
        {stages.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#a3a3a3]">
              <Trans>Will be reset</Trans>
              <span className="mx-1.5 text-[#d4d4d4]">·</span>
              <span className="tabular-nums">{stages.length}</span>
            </p>
            <ul className="flex flex-col gap-1.5">
              {stages.map((stage) => {
                const Icon = stage.icon
                return (
                  <li
                    key={stage.slug}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                      stage.borderColor,
                      stage.bgLight,
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white",
                        stage.color,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    </span>
                    <span className={cn("text-[13px] font-medium", stage.textColor)}>
                      {getStageLabelI18n(stage.slug)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="-mx-6 border-t border-[#f1f1f1]" aria-hidden />
        <DialogFooter className="-mt-1 gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-10 px-4 font-medium text-[#525252] hover:text-[#0a0a0a]"
          >
            <Trans>Cancel</Trans>
          </Button>
          {confirmDisabledReason ? (
            <TooltipProvider>
              <Tooltip>
                {/* Disabled buttons swallow pointer events, so the trigger wraps it. */}
                <TooltipTrigger asChild>
                  <span>{confirmButton}</span>
                </TooltipTrigger>
                <TooltipContent>{confirmDisabledReason}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            confirmButton
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
