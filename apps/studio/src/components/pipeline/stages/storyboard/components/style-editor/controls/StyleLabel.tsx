import { createContext, useId, useState, type MouseEvent, type ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Monitor, RotateCcw, Smartphone, Tablet } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { DeviceView } from "../device-breakpoint"
import type { OverrideInfo } from "../use-element-styles"

export const StyleLabelContext = createContext<string | undefined>(undefined)

interface StyleLabelProps {
  label: ReactNode
  htmlFor?: string
  children: ReactNode
  override?: OverrideInfo | null
  /** True when the displayed value isn't set by any class on this element
   *  (i.e., inherited from a parent). Adds a subtle italic + muted treatment so
   *  the user knows the value isn't theirs. Ignored when `override` is set. */
  inherited?: boolean
  className?: string
}

const DEVICE_ICONS: Record<DeviceView, typeof Monitor> = {
  desktop: Monitor,
  tablet: Tablet,
  mobile: Smartphone,
}

const DEVICE_LABELS: Record<DeviceView, ReactNode> = {
  desktop: <Trans>Desktop</Trans>,
  tablet: <Trans>Tablet</Trans>,
  mobile: <Trans>Mobile</Trans>,
}

function isResetShortcut(e: MouseEvent): boolean {
  return e.metaKey || e.ctrlKey || e.altKey
}

/* eslint-disable lingui/no-unlocalized-strings -- platform key glyphs/abbreviations, not translatable copy */
const MODIFIER_LABEL = (() => {
  if (typeof navigator === "undefined") return "Ctrl"
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"
})()
/* eslint-enable lingui/no-unlocalized-strings */

interface BreakpointRowProps {
  device: DeviceView
  classes: string[]
  muted?: boolean
}

function BreakpointRow({ device, classes, muted }: BreakpointRowProps) {
  const Icon = DEVICE_ICONS[device]
  return (
    <div
      className={cn(
        "flex items-start gap-2",
        muted ? "text-muted-foreground" : "text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium leading-tight">
          {DEVICE_LABELS[device]}
        </div>
        <div className="text-[10.5px] font-mono break-all leading-snug mt-0.5">
          {classes.length > 0 ? classes.join(" ") : <Trans>(default)</Trans>}
        </div>
      </div>
    </div>
  )
}

export function StyleLabel({
  label,
  htmlFor,
  children,
  override,
  inherited,
  className,
}: StyleLabelProps) {
  const [resetOpen, setResetOpen] = useState(false)
  const labelId = useId()

  const handleLabelClick = (e: MouseEvent<HTMLLabelElement>) => {
    if (!override) return
    if (isResetShortcut(e)) {
      e.preventDefault()
      e.stopPropagation()
      override.reset()
      setResetOpen(false)
      return
    }
    e.preventDefault()
    setResetOpen(true)
  }

  const showInherited = !!inherited && !override
  const labelEl = (
    <label
      id={labelId}
      htmlFor={override ? undefined : htmlFor}
      onClick={handleLabelClick}
      className={cn(
        "h-8 self-start flex items-center gap-1.5 pl-3 text-[11px] font-normal select-none truncate",
        override
          ? "rounded text-violet-700 bg-violet-100/70 hover:bg-violet-100 cursor-pointer"
          : "text-muted-foreground",
        showInherited && "cursor-help"
      )}
    >
      {showInherited ? (
        <span
          aria-hidden="true"
          className="inline-block w-1.5 h-1.5 shrink-0 rounded-full bg-violet-500"
        />
      ) : null}
      <span className="truncate">{label}</span>
    </label>
  )

  return (
    <div className={cn("grid grid-cols-[5.5rem_1fr] gap-2", className)}>
      {override ? (
        <Popover open={resetOpen} onOpenChange={setResetOpen}>
          <PopoverAnchor asChild>{labelEl}</PopoverAnchor>
          <PopoverContent
            side="bottom"
            align="start"
            sideOffset={6}
            className="w-72 p-0 overflow-hidden"
          >
            <div className="px-3 pt-3 pb-2.5 border-b">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-violet-700/80 font-medium">
                <Trans>Breakpoint override</Trans>
              </div>
              <div className="mt-2.5">
                <BreakpointRow
                  device={override.currentDevice}
                  classes={override.currentClasses}
                />
              </div>
              <div className="mt-2.5 pl-[18px] text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                <Trans>Falls back to</Trans>
              </div>
              <div className="mt-1.5">
                <BreakpointRow
                  device={override.inheritedDevice}
                  classes={override.inheritedClasses}
                  muted
                />
              </div>
            </div>
            <div className="p-2">
              <button
                type="button"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-medium px-2 py-1.5 transition-colors"
                onClick={() => {
                  override.reset()
                  setResetOpen(false)
                }}
              >
                <RotateCcw className="h-3 w-3" />
                <Trans>Reset to inherited</Trans>
              </button>
              <p className="mt-2 text-[10px] text-muted-foreground/70 text-center">
                <Trans>Tip: {MODIFIER_LABEL}+Click the label to reset.</Trans>
              </p>
            </div>
          </PopoverContent>
        </Popover>
      ) : showInherited ? (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>{labelEl}</TooltipTrigger>
            <TooltipContent side="left" sideOffset={12} variant="light">
              <Trans>
                Inherited from a parent element. Choose a value here to override
                on this element.
              </Trans>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        labelEl
      )}
      <div className="min-w-0 min-h-8 flex items-center gap-1.5">
        <StyleLabelContext value={labelId}>{children}</StyleLabelContext>
      </div>
    </div>
  )
}
