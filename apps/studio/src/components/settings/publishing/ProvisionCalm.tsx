import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import type { ProvisionStepStatus } from "@/api/client"
import type { ProvisionStatus } from "@/hooks/use-cloudflare-provision"
import { CalmStepLoader } from "@/components/settings/publishing/CalmStepLoader"
import { PROVISION_STEP_COPY } from "./provision-steps"

interface ProvisionCalmProps {
  status: ProvisionStatus
  stepStates: readonly ProvisionStepStatus[]
  activeStep: number | null
  elapsedMs: number
  onStart?: () => void
}

/** Provisioning's half of the shared loader — the eight steps and the words that belong to
 *  them. Everything that moves lives in `CalmStepLoader`, which publishing uses too. */
export function ProvisionCalm({
  status,
  stepStates,
  activeStep,
  elapsedMs,
  onStart,
}: ProvisionCalmProps) {
  const { t } = useLingui()

  return (
    <CalmStepLoader
      steps={PROVISION_STEP_COPY}
      status={status}
      stepStates={stepStates}
      activeStep={activeStep}
      elapsedMs={elapsedMs}
      testIdPrefix="provision-step"
      copy={{
        done: t`Publishing is ready`,
        doneDetail: t`Everything is in place in your Cloudflare account.`,
        error: t`Setup stopped`,
        idle: t`Ready when you are`,
        idleDetail: t`Eight small things get created in your account. Nothing is charged.`,
      }}
      idleAction={onStart ? (
        <Button className="min-w-52 shadow-sm" size="lg" onClick={onStart}>
          <Trans>Set up publishing</Trans>
        </Button>
      ) : undefined}
    />
  )
}
