import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import type { ReactNode } from "react"
import type { ProvisionStepStatus } from "@/api/client"
import type { ProvisionStatus } from "@/hooks/use-cloudflare-provision"
import { ProvisionPipeline } from "@/components/settings/publishing/ProvisionPipeline"
import { PROVISION_STEP_COPY } from "./provision-steps"

interface ProvisionCalmProps {
  status: ProvisionStatus
  stepStates: readonly ProvisionStepStatus[]
  activeStep: number | null
  elapsedMs: number
  onStart?: () => void
  errorContent?: ReactNode
}

/** Provisioning's half of the pipeline view — the steps and the words that belong to them.
 *
 *  It no longer shares `CalmStepLoader` with publishing, and the divergence is deliberate:
 *  publishing runs often and nearly always succeeds, so one calm medallion is the right amount
 *  of screen for it. Setup runs once, creates seven things in somebody's own account, and when
 *  it stops the only useful question is which step it stopped on. */
export function ProvisionCalm({
  status,
  stepStates,
  activeStep,
  elapsedMs,
  onStart,
  errorContent,
}: ProvisionCalmProps) {
  const { t } = useLingui()

  return (
    <ProvisionPipeline
      steps={PROVISION_STEP_COPY}
      status={status}
      stepStates={stepStates}
      activeStep={activeStep}
      elapsedMs={elapsedMs}
      testIdPrefix="provision-step"
      copy={{
        done: t`Sharing is ready`,
        doneDetail: t`Everything is in place in your Cloudflare account.`,
        error: t`Setup stopped`,
        errorDetail: t`Nothing after this step ran. Setup picks up where it left off when you try again.`,
        idle: t`Ready when you are`,
        idleDetail: t`${PROVISION_STEP_COPY.length} small things get created in your account. Nothing is charged.`,
      }}
      idleAction={onStart ? (
        <Button className="min-w-52 shadow-sm" size="lg" onClick={onStart}>
          <Trans>Set up sharing</Trans>
        </Button>
      ) : undefined}
      errorContent={errorContent}
    />
  )
}
