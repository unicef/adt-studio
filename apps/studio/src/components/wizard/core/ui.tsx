import type { ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { FlowTopBar } from "@/components/FlowTopBar"
import { cn } from "@/lib/utils"

/** Entrance used by every screen's blocks (stagger with `animationDelay`). */
export const ENTER = "animate-[am-fade-up_0.5s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
/** A content swap (preview / panel re-render). */
export const SWAP = "animate-[am-screen-in_0.32s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
/** A chat bubble or chip popping in. */
export const POP = "animate-[am-pop_0.35s_cubic-bezier(0.34,1.56,0.64,1)_both] motion-reduce:animate-none"

/** The faint dot grid behind every screen; `children` adds extra backdrop layers (e.g. a glow). */
export function DotGrid({ children }: { children?: ReactNode }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(var(--brand-200)_1px,transparent_1px)] [background-size:24px_24px] opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      {children}
    </div>
  )
}

/**
 * The frame every auto-mode step shares: the app's "Add Book" top bar, the dot-grid backdrop and a
 * scrolling content area. `backdrop` adds layers behind the content; `overlay` renders after it
 * (dialogs, live regions).
 */
export function ScreenShell({ children, backdrop, overlay, scrollClassName }: { children: ReactNode; backdrop?: ReactNode; overlay?: ReactNode; scrollClassName?: string }) {
  const { t } = useLingui()
  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <FlowTopBar title={t`Add Book`} />
      <DotGrid>{backdrop}</DotGrid>
      <div className={cn("relative flex flex-1 flex-col overflow-y-auto px-6", scrollClassName)}>{children}</div>
      {overlay}
    </div>
  )
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-muted px-4 text-[14px] font-medium transition-[background-color,transform] duration-150 hover:bg-muted/70 active:scale-[0.97]">
      <ArrowLeft className="size-4" />
      <Trans>Back</Trans>
    </button>
  )
}

/** The one filled action on a screen. Arrow by default; pass `icon` to lead with another one. `pulse` rings once when it becomes ready. */
export function PrimaryButton({ onClick, children, disabled, pulse, icon, className }: { onClick: () => void; children: ReactNode; disabled?: boolean; pulse?: boolean; icon?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-brand-600 px-6 text-[14.5px] font-semibold text-primary-foreground shadow-[0_8px_22px_rgba(43,127,255,0.35)] transition-[transform,background-color,box-shadow,opacity] duration-200 ease-out hover:bg-brand-600/90 hover:shadow-[0_10px_28px_rgba(43,127,255,0.45)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        pulse && "animate-[am-cta-ready_0.9s_ease-out_both] motion-reduce:animate-none",
        className,
      )}
    >
      {icon}
      {children}
      {!icon && <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />}
    </button>
  )
}
