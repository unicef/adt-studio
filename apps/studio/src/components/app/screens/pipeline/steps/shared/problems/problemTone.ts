import type { NoticeTone } from "@/components/ui/notice-tone"
import type { ProblemLevel } from "./useDescribeProblem"

export type ProblemTone = NoticeTone

export function problemTone(level: ProblemLevel | "resume"): ProblemTone {
  return level === "blocked" ? "critical" : "attention"
}
