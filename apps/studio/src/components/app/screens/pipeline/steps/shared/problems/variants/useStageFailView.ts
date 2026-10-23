import { useVariant } from "@/components/app/lab/variants"

export interface StageFailView {
  form: "notice" | "strip"
  marks: boolean
}

export function useStageFailView(): StageFailView {
  const view = useVariant("stagefail")
  if (view === "quiet") return { form: "strip", marks: true }
  if (view === "marks") return { form: "notice", marks: true }
  return { form: "notice", marks: false }
}
