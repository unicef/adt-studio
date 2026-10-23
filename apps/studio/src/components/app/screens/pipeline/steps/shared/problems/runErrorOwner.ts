import { PIPELINE } from "@adt/types"

export function runErrorOwner(stageState: (stage: string) => string): string | null {
  const failed = PIPELINE.filter((def) => stageState(def.name) === "error")
  return failed.length === 1 ? failed[0].name : null
}
