import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Avatar, Dots } from "../../decide/intro/parts"
import { POP, SWAP } from "../../../core/ui"
import { useLiving } from "./look"

const SHADOW = "shadow-[0_6px_18px_-10px_rgba(15,23,42,0.3)]"

/**
 * One assistant message: the avatar sits beside the last message of a run (the "tail"), like any
 * chat. `card` lets a message hold a wide card (settings, questions) under its words.
 */
export function AssistantRow({ tail, children, card, className }: { tail?: boolean; children?: ReactNode; card?: ReactNode; className?: string }) {
  const living = useLiving()
  return (
    <div className={cn("flex items-end", living ? "gap-3.5" : "gap-2.5", className)}>
      <span className={living && tail ? "lc-avatar flex self-end" : "contents"}>
        <Avatar hidden={!tail} size={living ? "lg" : "md"} />
      </span>
      <div className={cn("flex min-w-0 flex-1 flex-col items-start", living ? "max-w-[min(720px,calc(100%-62px))] gap-3" : "max-w-[min(560px,calc(100%-46px))] gap-2")}>
        <AssistantLabel />
        {children && (
          <div
            className={cn(
              "bg-card text-foreground ring-1 ring-border",
              living ? "lc-ai rounded-[28px] px-6 py-4 text-[19px] leading-[1.4] shadow-[0_14px_34px_-16px_rgba(15,23,42,0.35)]" : cn("origin-bottom-left rounded-[20px] px-4 py-2.5 text-[15.5px] leading-snug", SHADOW, POP),
              tail && !card && (living ? "rounded-bl-[8px]" : "rounded-bl-[6px]"),
            )}
          >
            {children}
          </div>
        )}
        {card && (
          <div className={cn("w-full", living ? "lc-card [zoom:1.12]" : cn("origin-bottom-left", POP))} style={{ animationDelay: !living && children ? "90ms" : undefined }}>
            {card}
          </div>
        )}
      </div>
    </div>
  )
}

export function UserRow({ children, className, plain }: { children: ReactNode; className?: string; plain?: boolean }) {
  const living = useLiving()
  return (
    <div className={cn("flex justify-end pl-10", className)}>
      <YouLabel />
      {plain ? (
        <div className={cn("flex w-full justify-end", living ? "lc-you [zoom:1.12]" : cn("origin-bottom-right", POP))}>{children}</div>
      ) : (
        <div
          className={cn(
            "bg-brand-600 font-medium text-primary-foreground",
            living
              ? "lc-you max-w-[600px] rounded-[28px] rounded-br-[8px] px-6 py-4 text-[19px] leading-[1.4] shadow-[0_16px_36px_-14px_rgba(43,127,255,0.9)]"
              : cn("max-w-[480px] origin-bottom-right rounded-[20px] rounded-br-[6px] px-4 py-2.5 text-[15.5px] leading-snug shadow-[0_10px_24px_-12px_rgba(43,127,255,0.9)]", POP),
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** The assistant is writing. The dots are decoration; the thread's status line says it in words. */
export function TypingRow() {
  const living = useLiving()
  if (!living)
    return (
      <div className="flex items-end gap-2.5" aria-hidden>
        <Avatar typing />
        <Dots />
      </div>
    )
  return (
    <div className="flex items-end gap-3.5" aria-hidden>
      <Avatar typing size="lg" />
      <span className="lc-ai lc-typing flex h-[58px] w-[96px] items-center justify-center gap-2 rounded-[28px] rounded-bl-[8px] bg-card shadow-[0_14px_34px_-16px_rgba(15,23,42,0.35)] ring-1 ring-border">
        {[0, 1, 2].map((i) => (
          <span key={i} className="lc-dot size-2.5 rounded-full bg-brand-500/70" style={{ animationDelay: `${i * 0.16}s` }} />
        ))}
      </span>
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
  const living = useLiving()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-[transform,background-color,box-shadow,color] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
        living ? "h-12 px-5 text-[16px] hover:-translate-y-0.5" : "h-10 px-4 text-[14px]",
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

/** A step the thread has moved past, folded to one line. Tapping it opens the step again, to change it. */
export function Folded({ summary, open, onToggle, locked }: { summary: { text: ReactNode; tone?: "done" | "failed" }; open: boolean; onToggle: () => void; locked?: boolean }) {
  const living = useLiving()
  return (
    <div className={cn("flex", living ? "pl-[62px] [zoom:1.12]" : "pl-[46px]")}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn("group inline-flex min-w-0 max-w-full items-center gap-2 rounded-full bg-muted/60 py-1.5 pl-1.5 pr-3 text-left text-[13.5px] text-muted-foreground ring-1 ring-border/60 transition-colors hover:bg-muted hover:text-foreground", SWAP)}
      >
        <span className={cn("grid size-5 shrink-0 place-items-center rounded-full text-white", summary.tone === "failed" ? "bg-destructive" : "bg-emerald-500")}>{summary.tone === "failed" ? <X className="size-3 stroke-[3]" /> : <Check className="size-3 stroke-[3]" />}</span>
        <span className="min-w-0 truncate">{summary.text}</span>
        <span className="shrink-0 text-[12.5px] font-semibold text-brand-700">{open ? <Trans>Hide</Trans> : locked ? <Trans>Show</Trans> : <Trans>Change</Trans>}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-brand-700 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
      </button>
    </div>
  )
}
