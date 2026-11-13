/** A confirmation read belongs to one explicit action, never the shared status
 * projection. Background refreshes must leave it alone; explicit cancellation
 * can still target it by exact key or book prefix. */
export const runConfirmationQueryKey = (label: string, stage: string, instance: string, request: number) =>
  ["books", label, "step-status", "confirmation", stage, instance, request] as const

export const isRunConfirmationQuery = ({ queryKey }: { queryKey: readonly unknown[] }) =>
  queryKey[0] === "books" && queryKey[2] === "step-status" && queryKey[3] === "confirmation"
