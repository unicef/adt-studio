import { useEffect } from "react"
import { Trans } from "@lingui/react/macro"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CloudflareCredentials } from "@/api/client"
import { useCloudflareProvision } from "@/hooks/use-cloudflare-provision"
import { ProvisionChecklist } from "./ProvisionChecklist"
import { ProvisionErrorNotice } from "./ProvisionErrorNotice"
import { WizardStepShell } from "./WizardStepShell"

interface ProvisionStepProps {
  stepNumber: number
  stepCount: number
  credentials: Partial<CloudflareCredentials>
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
  const { status, stepStates, activeStep, failure, start } = useCloudflareProvision(credentials)

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
          <Button variant="outline" onClick={onBack} disabled={status === "running"}>
            <Trans>Back</Trans>
          </Button>
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
        </>
      }
    >
      {status !== "idle" && (
        <ProvisionChecklist status={status} stepStates={stepStates} activeStep={activeStep} />
      )}
      {status === "error" && failure && <ProvisionErrorNotice failure={failure} />}
      {status === "running" && (
        <p className="text-sm leading-6 text-muted-foreground">
          <Trans>You can leave this page open — it's safe to wait here.</Trans>
        </p>
      )}
    </WizardStepShell>
  )
}
