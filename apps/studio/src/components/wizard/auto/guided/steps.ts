/** Guided's four steps, in order. */
export const STEPS = ["upload", "reading", "check", "create"] as const
export type StepId = (typeof STEPS)[number]
