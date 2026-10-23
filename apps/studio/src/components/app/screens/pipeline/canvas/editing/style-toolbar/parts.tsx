import { createContext, forwardRef, useContext, useRef, type ComponentPropsWithoutRef, type ReactNode } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ComputedTypographyStyles } from "@/components/pipeline/stages/storyboard/components/BookPreviewFrame"
import type { Viewport } from "@/components/app/screens/pipeline/shared/types"
import { cn } from "@/lib/utils"
import type { ClassEdit } from "./classEdits"
import type { FitItem } from "./fit"

export interface StyleTarget {
  dataId: string
  classes: string[]
  typography: ComputedTypographyStyles | null
  device: Viewport
  label: string
  pageId: string | null
  apply: (edits: ClassEdit[]) => void
  setStyle: (property: string, value: string) => void
  remove: () => void
}

export interface ToolbarItem extends FitItem {
  label: string
  node: ReactNode
}

export const ICON_WIDTH = 28

export const FIT_METRICS = { padding: 3, gap: 2, separator: 11, more: 0 }

export type ToolbarSide = "top" | "bottom"

const SideContext = createContext<ToolbarSide>("bottom")

export const ToolbarSideProvider = SideContext.Provider

export function useToolbarSide(): ToolbarSide {
  return useContext(SideContext)
}

export const shellClass =
  "flex h-8 items-center gap-0.5 rounded-lg border bg-card/85 p-0.5 text-foreground shadow-sm backdrop-blur-sm"

export const toolButtonClass = cn(
  "relative grid h-7 min-w-7 shrink-0 place-items-center rounded-md px-1 text-foreground/75 outline-none",
  "transition-[color,background-color,box-shadow,transform] duration-150 ease-out motion-reduce:transition-none",
  "hover:bg-muted hover:text-foreground active:scale-95 motion-reduce:active:scale-100",
  "focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--chrome-hex,#7c3aed)_55%,transparent)]",
  "data-[state=open]:bg-muted data-[state=open]:text-foreground",
  "aria-pressed:bg-[color-mix(in_oklab,var(--chrome-hex,#7c3aed)_15%,transparent)] aria-pressed:text-[color-mix(in_oklab,var(--chrome-hex,#7c3aed)_85%,black)]",
  "dark:aria-pressed:bg-[color-mix(in_oklab,var(--chrome-hex,#7c3aed)_28%,transparent)] dark:aria-pressed:text-[color-mix(in_oklab,var(--chrome-hex,#7c3aed)_45%,white)]",
  "disabled:pointer-events-none disabled:opacity-40",
)

export const popoverClass =
  "w-auto rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg duration-150 motion-reduce:animate-none"

export function ToolTip({ label, children }: { label: ReactNode; children: ReactNode }) {
  const side = useToolbarSide()
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

type ButtonProps = ComponentPropsWithoutRef<"button"> & { label: string; pressed?: boolean }

export const ToolButton = forwardRef<HTMLButtonElement, ButtonProps>(function ToolButton(
  { label, pressed, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      data-toolbar-item=""
      aria-label={label}
      aria-pressed={pressed}
      className={cn(toolButtonClass, className)}
      {...rest}
    >
      {children}
    </button>
  )
})

export function IconTool({
  label,
  pressed,
  disabled,
  onClick,
  className,
  children,
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <ToolTip label={label}>
      <ToolButton
        label={label}
        pressed={pressed}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onClick()
        }}
        className={cn(disabled && "opacity-40 hover:bg-transparent active:scale-100", className)}
      >
        {children}
      </ToolButton>
    </ToolTip>
  )
}

export function PopoverTool({
  label,
  trigger,
  children,
  triggerClassName,
  contentClassName,
}: {
  label: string
  trigger: ReactNode
  children: ReactNode
  triggerClassName?: string
  contentClassName?: string
}) {
  const side = useToolbarSide()
  const pointerDismiss = useRef(false)
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) pointerDismiss.current = false
      }}
    >
      <ToolTip label={label}>
        <PopoverTrigger asChild>
          <ToolButton label={label} aria-haspopup="dialog" className={triggerClassName}>
            {trigger}
          </ToolButton>
        </PopoverTrigger>
      </ToolTip>
      <PopoverContent
        side={side}
        align="center"
        sideOffset={8}
        collisionPadding={12}
        aria-label={label}
        className={cn(popoverClass, contentClassName)}
        onPointerDownOutside={() => {
          pointerDismiss.current = true
        }}
        onCloseAutoFocus={(event) => {
          if (pointerDismiss.current) event.preventDefault()
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  )
}

export function ToolSeparator() {
  return <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-border" />
}

export function PopoverSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-medium text-muted-foreground">{title}</span>
      {children}
    </div>
  )
}

export function ColorBar({ icon, color }: { icon: ReactNode; color: string | null }) {
  return (
    <span className="flex flex-col items-center gap-[2px]">
      {icon}
      <span
        aria-hidden
        className="h-[3px] w-3.5 rounded-full border border-foreground/15 transition-colors duration-150"
        style={{ backgroundColor: color ?? "transparent" }}
      />
    </span>
  )
}
