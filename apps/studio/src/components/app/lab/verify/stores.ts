import { createPersistentStore } from "@/hooks/create-persistent-store"

export type Verdict = "ok" | "issue"

export interface VerifyRecord {
  verdicts: Record<string, Verdict>
  notes: Record<string, string>
  rechecked?: Record<string, boolean | number>
}

export const verifyModeStore = createPersistentStore<boolean>("adt.lab.verify-mode", false, (value): value is boolean => typeof value === "boolean")

export const filterStore = createPersistentStore<"all" | "recheck">("adt.lab.verify-filter", "all", (value): value is "all" | "recheck" => value === "all" || value === "recheck")

export const recordStore = createPersistentStore<VerifyRecord>(
  "adt.lab.verify.v2",
  { verdicts: {}, notes: {} },
  (value): value is VerifyRecord => typeof value === "object" && value !== null && "verdicts" in value && "notes" in value,
)
