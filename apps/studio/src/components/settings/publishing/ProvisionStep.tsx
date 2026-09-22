import { useEffect } from "react"
import { Trans } from "@lingui/react/macro"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { CloudflareCredentials } from "@/api/client"
import { useDisconnectCloudflare } from "@/hooks/use-cloudflare-connection"
import { useCloudflareProvision } from "@/hooks/use-cloudflare-provision"
import { ProvisionFooterAction } from "./ProvisionFooterAction"
import { ProvisionCalm } from "./ProvisionCalm"
import { ProvisionErrorNotice } from "./ProvisionErrorNotice"
import { useElapsed } from "@/lib/elapsed"
import { WizardStepShell } from "./WizardStepShell"

interface ProvisionStepProps {
  stepNumber: number
  stepCount: number
  credentials?: Partial<CloudflareCredentials>
  onSignOut: () => void
  onProvisioned: () => void
}

export function ProvisionStep({
  stepNumber,
  stepCount,
  credentials,
  onSignOut,
  onProvisioned,
}: ProvisionStepProps) {
  const { status, stepStates, activeStep, failure, start } = useCloudflareProvision(
    credentials ?? {},
  )
  const elapsedMs = useElapsed(status)
  const disconnect = useDisconnectCloudflare()

  useEffect(() => {
    if (status === "done") onProvisioned()
  }, [onProvisioned, status])

  return (
    <div data-provision-state={status} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <WizardStepShell
        stepNumber={stepNumber}
        stepCount={stepCount}
        title={<Trans>Set up sharing</Trans>}
        description={
          <Trans>
            The Studio will create the storage and small web service it needs inside your Cloudflare
            account. This takes a minute or two and only happens once.
          </Trans>
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() =>
                disconnect.mutate(
                  { credentials: credentials ?? {}, deleteResources: false },
                  { onSuccess: onSignOut },
                )
              }
              /** Only a run in flight blocks this. `error` and `done` are both finished states,
               *  and a stopped setup is exactly when someone wants to back out and try a
               *  different account — disabling it there leaves them with a retry that cannot
               *  work and no way off the screen. */
              disabled={status === "running" || disconnect.isPending}
            >
              {disconnect.isPending && (
                <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              )}
              <Trans>Sign out</Trans>
            </Button>
            <ProvisionFooterAction
              status={status}
              onStart={() => start()}
              onRetry={() => start(failure?.resumeStep ?? undefined)}
              onFinish={onProvisioned}
            />
          </>
        }
      >
        <ProvisionCalm
          status={status}
          stepStates={stepStates}
          activeStep={activeStep}
          elapsedMs={elapsedMs}
          errorContent={
            status === "error" && failure ? <ProvisionErrorNotice failure={failure} /> : undefined
          }
        />
      </WizardStepShell>
    </div>
  )
}
