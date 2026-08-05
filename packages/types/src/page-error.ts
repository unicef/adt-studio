import { z } from "zod"

/** How a run reacts when a page fails inside a per-page step.
 *  - "stop" (default): accumulate failures and fail the step at the end
 *    (the historical behavior — safe for headless/CLI clients).
 *  - "ask": pause and ask the user to skip the page or stop the step. */
export const PageErrorPolicy = z.enum(["ask", "stop"])
export type PageErrorPolicy = z.infer<typeof PageErrorPolicy>

/** What to do with a single failed page once the user (or a fallback) decides. */
export const PageErrorAction = z.enum(["skip", "stop"])
export type PageErrorAction = z.infer<typeof PageErrorAction>

/** A page failure awaiting the user's decision. Surfaced both via the ephemeral
 *  `decision-required` SSE event and the polled step-status response. */
export const PendingDecision = z.object({
  decisionId: z.string(),
  step: z.string(),
  pageId: z.string(),
  error: z.string(),
})
export type PendingDecision = z.infer<typeof PendingDecision>

/** Body of POST /books/:label/stages/decision. */
export const DecisionBody = z
  .object({
    decisionId: z.string(),
    action: PageErrorAction,
    applyToAll: z.boolean().optional(),
  })
  .strict()
export type DecisionBody = z.infer<typeof DecisionBody>
