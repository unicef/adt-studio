import { createPortal } from "react-dom"
import type { ReactNode } from "react"
import { Loader2, Play, RotateCcw, Save, X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface FloatingSaveBarProps {
  onDiscard?: () => void
  onSave?: () => void
  onSaveAndRerun?: () => void
  onReset?: () => void
  saving?: boolean
  saveDisabledReason?: string
  rerunDisabledReason?: string
  resetDisabledReason?: string
  /** Status content next to the pulse dot. Defaults to "Unsaved changes". */
  label?: ReactNode
  /** Play the exit animation (the host keeps it mounted until it finishes). */
  closing?: boolean
}

export function FloatingSaveBar({
  onDiscard,
  onSave,
  onSaveAndRerun,
  onReset,
  saving = false,
  saveDisabledReason,
  rerunDisabledReason,
  resetDisabledReason,
  label,
  closing = false,
}: FloatingSaveBarProps) {
  const { t } = useLingui()
  const saveDisabled = !!saveDisabledReason || saving
  const rerunDisabled = !!rerunDisabledReason || saving
  const resetDisabled = !!resetDisabledReason || saving

  const saveButton = onSave && (
    <button
      type="button"
      onClick={onSave}
      disabled={saveDisabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        onSaveAndRerun
          ? "bg-muted text-foreground hover:bg-muted-foreground/20"
          : "bg-green-600 hover:bg-green-500 text-white shadow-sm shadow-green-600/20",
      )}
    >
      {saving ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Save className="h-3 w-3" />
      )}
      {t`Save`}
    </button>
  )

  const rerunButton = onSaveAndRerun && (
    <button
      type="button"
      onClick={onSaveAndRerun}
      disabled={rerunDisabled}
      className="inline-flex items-center gap-1.5 rounded px-3 py-1 text-[11px] font-medium bg-green-600 hover:bg-green-500 text-white shadow-sm shadow-green-600/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {saving ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Play className="h-3 w-3" />
      )}
      {t`Save & Re-run`}
    </button>
  )

  const resetButton = onReset && (
    <button
      type="button"
      onClick={onReset}
      disabled={resetDisabled}
      className="inline-flex items-center gap-1.5 rounded px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {saving ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <RotateCcw className="h-3 w-3" />
      )}
      {t`Reset`}
    </button>
  )

  return createPortal(
    <div
      className={cn(
        "fixed bottom-4 left-1/2 z-50 -translate-x-1/2",
        closing
          ? "animate-out fill-mode-forwards slide-out-to-bottom-4 fade-out-0 zoom-out-95 duration-200 ease-in"
          : "animate-in slide-in-from-bottom-4 fade-in zoom-in-95 duration-300 ease-out",
      )}
    >
      <div className="flex items-center gap-3 rounded-md border border-border/60 bg-background/95 backdrop-blur px-2 py-1.5 shadow-xl shadow-black/5">
        {/* Status indicator */}
        <div className="flex items-center gap-2 pl-2">
          <span className="relative inline-flex h-2 w-2 shrink-0" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-amber-500/40 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          {label ?? (
            <span className="text-[11px] font-medium text-foreground">
              {t`Unsaved changes`}
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-border/80" aria-hidden />

        {/* Actions */}
        <div className="flex items-center gap-1 pr-1">
          {onDiscard && (
            <button
              type="button"
              onClick={onDiscard}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded px-3 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="h-3 w-3" />
              {t`Discard`}
            </button>
          )}
          {resetButton && resetDisabledReason ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{resetButton}</span>
                </TooltipTrigger>
                <TooltipContent>{resetDisabledReason}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            resetButton
          )}
          {saveButton && saveDisabledReason ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{saveButton}</span>
                </TooltipTrigger>
                <TooltipContent>{saveDisabledReason}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            saveButton
          )}
          {rerunButton && rerunDisabledReason ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{rerunButton}</span>
                </TooltipTrigger>
                <TooltipContent>{rerunDisabledReason}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            rerunButton
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
