import { z } from "zod"
import { LLMErrorClass } from "./llm-error.js"

/** How a run reacts when a page fails inside a per-page step.
 *  - "stop" (default): accumulate failures and fail the step at the end
 *    (the historical behavior — safe for headless/CLI clients).
 *  - "ask": pause and ask the user to skip the page or stop the step. */
export const PageErrorPolicy = z.enum(["ask", "stop"])
export type PageErrorPolicy = z.infer<typeof PageErrorPolicy>

/** What to do with a single failed page once the user (or a fallback) decides. */
export const PageErrorAction = z.enum(["retry", "skip", "stop"])
export type PageErrorAction = z.infer<typeof PageErrorAction>

/** A page failure awaiting the user's decision. Surfaced both via the ephemeral
 *  `decision-required` SSE event and the polled step-status response. */
export const PendingDecision = z.object({
  decisionId: z.string(),
  runId: z.string().optional(),
  errorClass: LLMErrorClass.optional(),
  attemptCount: z.number().int().nonnegative().optional(),
  canRetry: z.boolean().optional(),
  step: z.string(),
  pageId: z.string(),
  error: z.string(),
})
export type PendingDecision = z.infer<typeof PendingDecision>

/** Body of POST /books/:label/stages/decision. */
export const DecisionBody = z
  .object({
    decisionId: z.string().min(1),
    runId: z.string().min(1).optional(),
    step: z.string().min(1).optional(),
    pageId: z.string().min(1).optional(),
    action: PageErrorAction,
    applyToAll: z.boolean().optional(),
  })
  .strict()
  .refine((body) => !(body.action === "retry" && body.applyToAll), {
    message: "Retry is page-scoped",
  })
export type DecisionBody = z.infer<typeof DecisionBody>

/** Durable qualified outcome projected from committed recovery control records. */
export const PageRecoverySummary = z.object({
  step: z.string(), pageId: z.string(), outcome: z.literal("skipped-with-error"),
  errorClass: LLMErrorClass, attemptCount: z.number().int().nonnegative().optional(),
})
export type PageRecoverySummary = z.infer<typeof PageRecoverySummary>
