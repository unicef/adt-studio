import { cn } from "@/lib/utils"

export const PANEL_WIDTH = 480

export const EASE_SPRING = "ease-[cubic-bezier(0.32,0.72,0,1)]"

export const suggestedRowClassName = "ring-1 ring-inset ring-brand-500/35 bg-brand-500/[0.05] dark:ring-brand-400/40 dark:bg-brand-400/[0.08]"

export const rowEnterClassName = "animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 motion-reduce:animate-none"

export const tabFocusClassName =
  "focus-visible:ring-2 focus-visible:ring-[var(--tint)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--dock-surface)]"

export const SKIN = {
  shell: cn(
    "rounded-[24px] bg-white ring-1 ring-zinc-950/[0.07] shadow-[0_24px_50px_-22px_rgba(15,23,42,0.32),0_2px_6px_-2px_rgba(15,23,42,0.08)]",
    "dark:bg-zinc-950 dark:ring-white/[0.08] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]",
  ),
  tabIdle: "text-zinc-500 hover:bg-zinc-950/[0.05] hover:text-zinc-950 dark:text-white/55 dark:hover:bg-white/[0.08] dark:hover:text-white",
  tabOpen: "bg-zinc-950/[0.05] text-zinc-950 ring-[1.5px] ring-inset ring-zinc-950/30 dark:bg-white/[0.08] dark:text-white dark:ring-white/40",
  muted: "text-zinc-500 dark:text-white/50",
  strong: "text-zinc-950 dark:text-white",
  row: "hover:bg-zinc-950/[0.045] dark:hover:bg-white/[0.07]",
  rowHere: "bg-zinc-950/[0.05] dark:bg-white/[0.1]",
  divider: "bg-zinc-950/[0.08] dark:bg-white/[0.08]",
  cluster: "bg-zinc-950/[0.035] dark:bg-white/[0.05]",
  minimize: "bg-white ring-1 ring-zinc-950/[0.07] text-zinc-500 shadow-[0_6px_16px_-8px_rgba(15,23,42,0.3)] hover:text-zinc-950 dark:bg-zinc-950 dark:ring-white/[0.08] dark:text-white/60 dark:hover:text-white",
  tip: "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950",
  surface: cn("[--dock-surface:#ffffff] [--dock-chip:10%] dark:[--dock-surface:#09090b] dark:[--dock-chip:18%]"),
}

export function stagger(index: number) {
  return { animationDelay: `${60 + index * 28}ms` }
}
