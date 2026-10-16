import { z } from "zod"
import { ReasoningEffort } from "./llm-inference.js"

export const REASONING_EFFORT_ORDER: readonly ReasoningEffort[] = ReasoningEffort.options

export const SELECTABLE_REASONING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const satisfies readonly ReasoningEffort[]

export const ReasoningEffortSupport = z.object({
  models: z.string().min(1),
  efforts: z.array(ReasoningEffort).min(1),
  default: ReasoningEffort,
})
export type ReasoningEffortSupport = z.infer<typeof ReasoningEffortSupport>

function bareModelId(modelId: string): string {
  const trimmed = modelId.trim()
  const separator = trimmed.indexOf(":")
  return separator === -1 ? trimmed : trimmed.slice(separator + 1)
}

export function findReasoningEffortSupport(
  supports: readonly ReasoningEffortSupport[] | undefined,
  modelId: string,
): ReasoningEffortSupport | null {
  const bare = bareModelId(modelId)
  return supports?.find((support) => new RegExp(`^(?:${support.models})$`, "i").test(bare)) ?? null
}

export function fitReasoningEffort(
  support: ReasoningEffortSupport | null,
  effort: ReasoningEffort | undefined,
): ReasoningEffort | undefined {
  if (!effort || !support) return undefined
  if (support.efforts.includes(effort)) return effort
  const target = REASONING_EFFORT_ORDER.indexOf(effort)
  return [...support.efforts].sort((a, b) => {
    const distance = Math.abs(REASONING_EFFORT_ORDER.indexOf(a) - target) - Math.abs(REASONING_EFFORT_ORDER.indexOf(b) - target)
    return distance !== 0 ? distance : REASONING_EFFORT_ORDER.indexOf(a) - REASONING_EFFORT_ORDER.indexOf(b)
  })[0]
}
