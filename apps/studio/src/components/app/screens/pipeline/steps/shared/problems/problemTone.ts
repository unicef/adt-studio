import type { ProblemLevel } from "./useDescribeProblem"

export type ProblemTone = "attention" | "critical"

export function problemTone(level: ProblemLevel | "resume"): ProblemTone {
  return level === "blocked" ? "critical" : "attention"
}

export const TONE_BORDER: Record<ProblemTone, string> = {
  attention: "border-amber-300 dark:border-amber-500/40",
  critical: "border-destructive/40",
}

export const TONE_BUTTON: Record<ProblemTone, string> = {
  attention: "bg-amber-700 text-white hover:bg-amber-800 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300",
  critical: "bg-destructive text-white hover:bg-destructive/90",
}

export const TONE_TEXT: Record<ProblemTone, string> = {
  attention: "text-amber-800 dark:text-amber-300",
  critical: "text-destructive",
}
