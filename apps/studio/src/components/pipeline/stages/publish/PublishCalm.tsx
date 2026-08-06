import { useLingui } from "@lingui/react/macro"
import { FileText, Link2, Package, UploadCloud } from "lucide-react"
import type { PublishStepId, PublishStepStatus } from "@adt/types"
import { CalmStepLoader, type LoaderStep } from "@/components/publishing/CalmStepLoader"
import { PUBLISH_STEP_COPY } from "@/components/pipeline/stages/export/publish/publish-steps"
import type { PublishRunStatus } from "@/hooks/use-book-publication"

/** One icon per step, so the medallion has something of its own to show at each stage rather
 *  than a spinner that never changes. */
const STEP_ICONS: Record<PublishStepId, LoaderStep["icon"]> = {
  export: FileText,
  package: Package,
  upload: UploadCloud,
  register: Link2,
}

const STEPS: readonly LoaderStep[] = PUBLISH_STEP_COPY.map((step) => ({
  id: step.id,
  number: step.number,
  title: step.title,
  detail: step.detail,
  icon: STEP_ICONS[step.id],
}))

interface PublishCalmProps {
  status: PublishRunStatus
  stepStates: readonly PublishStepStatus[]
  activeStep: number | null
  elapsedMs: number
  /** "Update site" and a first publish run the same four steps, and only the words differ. */
  kind: "first" | "update"
}

/** Publishing's half of the shared loader. The four steps are the ones the server streams, so
 *  what the author watches is what is actually happening, not a guess at a duration. */
export function PublishCalm({
  status,
  stepStates,
  activeStep,
  elapsedMs,
  kind,
}: PublishCalmProps) {
  const { t } = useLingui()

  return (
    <CalmStepLoader
      steps={STEPS}
      status={status === "done" ? "done" : status === "error" ? "error" : "running"}
      stepStates={stepStates}
      activeStep={activeStep}
      elapsedMs={elapsedMs}
      testIdPrefix="publish-step"
      rootTestId="publish-checklist"
      copy={{
        done: kind === "first" ? t`Your book is online` : t`The link now shows your latest version`,
        doneDetail:
          kind === "first"
            ? t`Send the link to anyone who should read or review it.`
            : t`Everyone who already has the link sees the new copy.`,
        error: t`Publishing stopped`,
      }}
    />
  )
}
