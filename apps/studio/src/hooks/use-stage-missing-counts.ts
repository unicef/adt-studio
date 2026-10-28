import { useOutputs } from "./use-outputs"

/** Use the same expected-output projection as inline review and the sidebar. */
export function useStageMissingCounts(label: string): { translate: number; speech: number } {
  const { data } = useOutputs(label)
  return { translate: data?.summaries?.stages.translate?.missing ?? 0, speech: data?.summaries?.stages.speech?.missing ?? 0 }
}
