import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Avatar, Dots } from "../../decide/intro/parts"
import { POP } from "../../../core/ui"

const SHADOW = "shadow-[0_6px_18px_-10px_rgba(15,23,42,0.3)]"

/**
 * One assistant message: the avatar sits beside the last message of a run (the "tail"), like any
 * chat. `card` lets a message hold a wide card (settings, questions) under its words.
 */
export function AssistantRow({ tail, children, card, className }: { tail?: boolean; children?: ReactNode; card?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end gap-2.5", className)}>
      <Avatar hidden={!tail} />
      <div className="flex min-w-0 max-w-[min(560px,calc(100%-46px))] flex-1 flex-col items-start gap-2">
        <AssistantLabel />
        {children && <div className={cn("origin-bottom-left rounded-[20px] bg-card px-4 py-2.5 text-[15.5px] leading-snug text-foreground ring-1 ring-border", SHADOW, tail && !card && "rounded-bl-[6px]", POP)}>{children}</div>}
        {card && <div className={cn("w-full origin-bottom-left", POP)} style={{ animationDelay: children ? "90ms" : undefined }}>{card}</div>}
      </div>
    </div>
  )
}

export function UserRow({ children, className, plain }: { children: ReactNode; className?: string; plain?: boolean }) {
  return (
    <div className={cn("flex justify-end pl-10", className)}>
      <YouLabel />
      {plain ? (
        <div className={cn("flex w-full justify-end origin-bottom-right", POP)}>{children}</div>
      ) : (
        <div className={cn("max-w-[480px] origin-bottom-right rounded-[20px] rounded-br-[6px] bg-brand-600 px-4 py-2.5 text-[15.5px] font-medium leading-snug text-primary-foreground shadow-[0_10px_24px_-12px_rgba(43,127,255,0.9)]", POP)}>{children}</div>
      )}
    </div>
  )
}

/** The assistant is writing. The dots are decoration; the thread's status line says it in words. */
export function TypingRow() {
  return (
    <div className="flex items-end gap-2.5" aria-hidden>
      <Avatar typing />
      <Dots />
    </div>
  )
}

/** A setting named the wizard's way, with its value: "Page Grouping · Spread". */
export function SettingPill({ label, value, tone = "ai" }: { label: ReactNode; value: ReactNode; tone?: "ai" | "asked" | "changed" }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] ring-1",
        tone === "ai" && "bg-brand-50 text-brand-800 ring-brand-200",
        tone === "asked" && "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/30",
        tone === "changed" && "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/30",
      )}
    >
      <span className="truncate opacity-75">{label}</span>
      <span aria-hidden className="opacity-40">
        ·
      </span>
      <span className="truncate font-semibold">{value}</span>
    </span>
  )
}

/** A reply the user can tap, shown under the assistant's message. */
export function Chip({ onClick, children, icon, primary, pressed, disabled, className }: { onClick: () => void; children: ReactNode; icon?: ReactNode; primary?: boolean; pressed?: boolean; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition-[transform,background-color,box-shadow,color] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        primary ? "bg-brand-600 text-primary-foreground shadow-[0_8px_20px_-8px_rgba(43,127,255,0.8)] hover:bg-brand-600/90" : "bg-card text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 hover:ring-brand-300",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/** Small caps line above a card section. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground", className)}>{children}</p>
}

function YouLabel() {
  return (
    <span className="sr-only">
      <Trans>You:</Trans>
    </span>
  )
}

function AssistantLabel() {
  return (
    <span className="sr-only">
      <Trans>ADT Assistant:</Trans>
    </span>
  )
}
