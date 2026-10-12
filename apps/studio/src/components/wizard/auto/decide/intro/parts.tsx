import { useState, type CSSProperties } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { POP } from "../../../core/ui"

export type IntroCopy = { hello: string; lines: string[] }
export type IntroProps = { copy: IntroCopy; onContinue: () => void; onBack: () => void }

export const SEEN_KEY = "adt.add-book.decide-intro-seen"

/** Whether this is the first time the user meets the assistant here. Read once per mount; marked seen when the intro has fully played. */
export function useFirstTime(key: string) {
  const [first] = useState(() => window.localStorage.getItem(key) !== "1")
  const markSeen = () => window.localStorage.setItem(key, "1")
  return { first, markSeen }
}

export function Avatar({ typing, hidden, size = "md" }: { typing?: boolean; hidden?: boolean; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-primary-foreground shadow-[0_6px_16px_-6px_rgba(43,127,255,0.8)] transition-opacity duration-200",
        size === "lg" ? "size-12" : size === "sm" ? "size-6 shadow-none" : "size-9 self-end",
        hidden && "opacity-0",
      )}
    >
      <Sparkles className={cn(size === "lg" ? "size-5" : size === "sm" ? "size-3" : "size-4", typing && "motion-safe:animate-[am-wiggle_0.6s_ease-in-out_infinite]")} />
      {size !== "sm" && <span className={cn("absolute -bottom-0.5 -right-0.5 rounded-full bg-emerald-400 ring-2 ring-card", size === "lg" ? "size-3" : "size-2.5")} />}
    </span>
  )
}

export function Dots() {
  return (
    <span className={cn("flex h-11 w-[68px] origin-bottom-left items-center justify-center gap-1.5 rounded-[20px] rounded-bl-[6px] bg-card shadow-[0_6px_18px_-10px_rgba(15,23,42,0.3)] ring-1 ring-border", POP)}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-2 rounded-full bg-muted-foreground/40 motion-safe:animate-[am-dot_1s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  )
}

export function ShowOptions({ onClick, className, style }: { onClick: () => void; className?: string; style?: CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={cn(
        "group inline-flex h-11 items-center gap-2 rounded-full bg-brand-600 px-5 text-[14.5px] font-semibold text-primary-foreground shadow-[0_10px_24px_-10px_rgba(43,127,255,0.9)] transition-[transform,background-color] duration-200 ease-out hover:bg-brand-600/90 active:scale-[0.97]",
        className,
      )}
    >
      <Trans>Show me the options</Trans>
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  )
}

export function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-[0.97]">
      <ArrowLeft className="size-4" />
      <Trans>Back</Trans>
    </button>
  )
}
