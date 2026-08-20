import type { ReactNode } from "react"
import { CircleCheck, CircleAlert, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

const PILL_TONES = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  warn: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  running: "border-brand-200 bg-brand-50 text-brand-700",
} as const

export interface StatusPillProps {
  tone: keyof typeof PILL_TONES
  children: ReactNode
}

export function StatusPill({ tone, children }: StatusPillProps) {
  const Icon = tone === "ok" ? CircleCheck : tone === "warn" ? CircleAlert : Loader2
  return (
    <span
      className={cn(
        "flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-semibold",
        PILL_TONES[tone],
      )}
    >
      <Icon className={cn("size-3.5", tone === "running" && "animate-spin")} />
      {children}
    </span>
  )
}
