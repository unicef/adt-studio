import { cn } from "@/lib/utils"

export type StatusTone = "done" | "attention" | "failed" | "running" | "idle"

const TONE: Record<StatusTone, string> = {
  done: "bg-emerald-500 dark:bg-emerald-400",
  attention: "bg-amber-500 dark:bg-amber-400",
  failed: "bg-destructive",
  running: "bg-sky-500 motion-safe:animate-pulse dark:bg-sky-400",
  idle: "bg-muted-foreground/40",
}

export function StatusDot({ tone, label, className }: { tone: StatusTone; label: string; className?: string }) {
  return <span role="img" aria-label={label} title={label} className={cn("inline-block size-1.5 shrink-0 rounded-full", TONE[tone], className)} />
}
