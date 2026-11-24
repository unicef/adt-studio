import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Check, ChevronDown, Minimize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar } from "../../decide/intro/parts"
import { morphName } from "./morph"

/**
 * A living message. Compact, it is a chat bubble beside the assistant's avatar; expanded, the same
 * object (same morph name) is a wide stage that holds the step. `side` puts the user's own bubbles
 * on the right.
 */
export function Surface({ name, expanded, children, side = "ai", labelledBy, className }: { name: string; expanded: boolean; children: ReactNode; side?: "ai" | "user"; labelledBy?: string; className?: string }) {
  if (expanded)
    return (
      <section
        aria-labelledby={labelledBy}
        style={morphName(name)}
        className={cn("relative w-full overflow-hidden rounded-[28px] bg-card ring-1 ring-border shadow-[0_30px_80px_-40px_rgba(15,23,42,0.55)]", className)}
      >
        {children}
      </section>
    )
  if (side === "user")
    return (
      <div className="flex justify-end pl-16">
        <div style={morphName(name)} className={cn("max-w-[520px] rounded-[20px] rounded-br-[6px] bg-brand-600 px-4 py-2.5 text-[15px] font-medium leading-snug text-primary-foreground shadow-[0_10px_24px_-12px_rgba(43,127,255,0.9)]", className)}>
          <span className="sr-only">
            <Trans>You:</Trans>
          </span>
          {children}
        </div>
      </div>
    )
  return (
    <div className="flex items-end gap-2.5 pr-16">
      <Avatar />
      <section aria-labelledby={labelledBy} style={morphName(name)} className={cn("min-w-0 max-w-[620px] rounded-[20px] rounded-bl-[6px] bg-card px-4 py-2.5 text-[15px] leading-snug ring-1 ring-border shadow-[0_6px_18px_-10px_rgba(15,23,42,0.3)]", className)}>
        <span className="sr-only">
          <Trans>ADT Assistant:</Trans>
        </span>
        {children}
      </section>
    </div>
  )
}

/** The head of an expanded stage: the assistant, a short title, and the way back to a bubble. */
export function StageHead({ id, title, kicker, onCollapse, actions }: { id: string; title: ReactNode; kicker?: ReactNode; onCollapse?: () => void; actions?: ReactNode }) {
  return (
    <header className="flex items-start gap-3">
      <Avatar size="sm" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {kicker && <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-brand-700">{kicker}</span>}
        <h2 id={id} tabIndex={-1} className="text-[22px] font-bold leading-tight tracking-[-0.02em] outline-none">
          {title}
        </h2>
      </div>
      {actions}
      {onCollapse && (
        <button type="button" onClick={onCollapse} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground">
          <Minimize2 className="size-3.5" />
          <Trans>Done</Trans>
        </button>
      )}
    </header>
  )
}

/** A finished step as one line; tapping it grows the step back out. */
export function DoneLine({ children, onOpen, controls, locked }: { children: ReactNode; onOpen: () => void; controls?: string; locked?: boolean }) {
  return (
    <button type="button" onClick={onOpen} aria-expanded={false} aria-controls={controls} className="group inline-flex min-w-0 max-w-full items-center gap-2 text-left">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
        <Check className="size-3 stroke-[3]" />
      </span>
      <span className="min-w-0 truncate">{children}</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-[12.5px] font-semibold text-brand-700 opacity-80 group-hover:opacity-100">
        {locked ? <Trans>Show</Trans> : <Trans>Change</Trans>}
        <ChevronDown className="size-3.5" />
      </span>
    </button>
  )
}
