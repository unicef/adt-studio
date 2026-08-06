import { useEffect } from "react"
import { Trans } from "@lingui/react/macro"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CloudflareCredentials } from "@/api/client"
import { useCloudflareProvision } from "@/hooks/use-cloudflare-provision"
import { ProvisionCalm } from "./ProvisionCalm"
import { ProvisionErrorNotice } from "./ProvisionErrorNotice"
import { useElapsed } from "./provision-elapsed"
import { WizardStepShell } from "./WizardStepShell"

interface ProvisionStepProps {
  stepNumber: number
  stepCount: number
  credentials?: Partial<CloudflareCredentials>
  onBack: () => void
  onProvisioned: () => void
}

export function ProvisionStep({
  stepNumber,
  stepCount,
  credentials,
  onBack,
  onProvisioned,
}: ProvisionStepProps) {
  const { status, stepStates, activeStep, failure, start } = useCloudflareProvision(
    credentials ?? {},
  )
  const elapsedMs = useElapsed(status)

  useEffect(() => {
    if (status === "done") onProvisioned()
  }, [onProvisioned, status])

  return (
    <WizardStepShell
      stepNumber={stepNumber}
      stepCount={stepCount}
      title={<Trans>Set up publishing</Trans>}
      description={
        <Trans>
          The Studio will now create the few things it needs inside your Cloudflare account: a place
          to store books, a place to keep comments, and the small service that shows them. This takes
          a minute or two and only happens once.
        </Trans>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onBack} disabled={status === "running"}>
            <Trans>Back</Trans>
          </Button>
          <span className="ml-auto flex items-center gap-2">
            {status === "idle" && (
              <Button onClick={() => start()}>
                <Trans>Set up publishing</Trans>
              </Button>
            )}
            {status === "running" && (
              <Button disabled>
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <Trans>Setting up…</Trans>
              </Button>
            )}
            {status === "error" && (
              <Button onClick={() => start(failure?.resumeStep ?? undefined)}>
                <Trans>Try again</Trans>
              </Button>
            )}
            {status === "done" && (
              <Button onClick={onProvisioned}>
                <Trans>Finish</Trans>
              </Button>
            )}
          </span>
        </>
      }
    >
      <div className="flex flex-1 flex-col gap-4">

        <ProvisionCalm
          status={status}
          stepStates={stepStates}
          activeStep={activeStep}
          elapsedMs={elapsedMs}
        />

        {status === "error" && failure && <ProvisionErrorNotice failure={failure} />}
      </div>
    </WizardStepShell>
  )
}
