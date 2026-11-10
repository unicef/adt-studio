import { ProblemNotice } from "@/components/app/screens/pipeline/steps/shared/problems/ProblemNotice"
import type { PageProblem } from "./usePageProblem"

export function PageProblemNotice({ problem, hex }: { problem: PageProblem; hex: string }) {
  return (
    <ProblemNotice
      level={problem.level}
      hex={hex}
      icon={problem.icon}
      title={problem.title}
      body={problem.body}
      details={problem.details}
      action={problem.action}
    />
  )
}
