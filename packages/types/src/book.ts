import { z } from "zod"

export const BookLabel = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Label must be filesystem-safe")
export type BookLabel = z.infer<typeof BookLabel>

export function parseBookLabel(label: string): string {
  const parsed = BookLabel.safeParse(label)
  if (parsed.success) {
    return parsed.data
  }

  const details = parsed.error.issues
    .map((issue) => issue.message)
    .filter((message) => message.length > 0)
    .join("; ")
  const suffix = details.length > 0 ? `. Details: ${details}` : ""
  throw new Error(`Invalid book label: label must be filesystem-safe${suffix}`)
}
