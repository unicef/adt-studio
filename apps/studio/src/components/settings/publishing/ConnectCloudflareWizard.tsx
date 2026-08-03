import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  CloudflareConnectionStatus,
  CloudflareCredentials,
  CloudflareVerifyResponse,
} from "@/api/client"
import { useVerifyCloudflareToken } from "@/hooks/use-cloudflare-connection"
import { cn } from "@/lib/utils"
import { CredentialsStep } from "./CredentialsStep"
import { CreateTokenStep } from "./CreateTokenStep"
import { DoneStep } from "./DoneStep"
import { IntroStep } from "./IntroStep"
import { ProvisionStep } from "./ProvisionStep"
import { WIZARD_STEP_HEADING_ID } from "./WizardStepShell"

const WIZARD_STEPS = ["intro", "token", "credentials", "provision"] as const

type WizardStep = (typeof WIZARD_STEPS)[number] | "done"

interface ConnectCloudflareWizardProps {
  storedToken: string
  storedAccountId: string
  connection: CloudflareConnectionStatus | undefined
  isConnectionRefreshing: boolean
  onVerified: (credentials: CloudflareCredentials) => void
  onProvisioned: () => void
  onRefreshConnection: () => void
  onDisconnected: () => void
}

export function ConnectCloudflareWizard({
  storedToken,
  storedAccountId,
  connection,
  isConnectionRefreshing,
  onVerified,
  onProvisioned,
  onRefreshConnection,
  onDisconnected,
}: ConnectCloudflareWizardProps) {
  const [tokenDraft, setTokenDraft] = useState(storedToken)
  const [accountIdDraft, setAccountIdDraft] = useState(storedAccountId)
  const [verifyResult, setVerifyResult] = useState<CloudflareVerifyResponse | null>(null)
  const [step, setStep] = useState<WizardStep>("intro")
  const [direction, setDirection] = useState<"forward" | "back">("forward")
  const verify = useVerifyCloudflareToken()
  const hasMountedRef = useRef(false)

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }
    document.getElementById(WIZARD_STEP_HEADING_ID)?.focus()
  }, [step])

  const goTo = useCallback((next: WizardStep, nextDirection: "forward" | "back") => {
    setDirection(nextDirection)
    setStep(next)
  }, [])

  const draftCredentials = useMemo<CloudflareCredentials>(
    () => ({ token: tokenDraft.trim(), accountId: accountIdDraft.trim() }),
    [accountIdDraft, tokenDraft],
  )

  function handleVerify() {
    verify.mutate(draftCredentials, {
      onSuccess: (result) => {
        setVerifyResult(result)
        if (result.ok) onVerified(draftCredentials)
      },
      onError: () => {
        setVerifyResult(null)
      },
    })
  }

  const stepCount = WIZARD_STEPS.length
  const stepNumber = WIZARD_STEPS.indexOf(step as (typeof WIZARD_STEPS)[number]) + 1

  return (
    <div
      key={step}
      className={cn(
        "rounded-xl border bg-card p-5 motion-reduce:animate-none",
        direction === "forward" ? "animate-step-enter-forward" : "animate-step-enter-back",
      )}
    >
      {step === "intro" && (
        <IntroStep
          stepNumber={stepNumber}
          stepCount={stepCount}
          onContinue={() => goTo("token", "forward")}
        />
      )}

      {step === "token" && (
        <CreateTokenStep
          stepNumber={stepNumber}
          stepCount={stepCount}
          onBack={() => goTo("intro", "back")}
          onContinue={() => goTo("credentials", "forward")}
        />
      )}

      {step === "credentials" && (
        <CredentialsStep
          stepNumber={stepNumber}
          stepCount={stepCount}
          token={tokenDraft}
          accountId={accountIdDraft}
          onTokenChange={(value) => {
            setTokenDraft(value)
            setVerifyResult(null)
            verify.reset()
          }}
          onAccountIdChange={(value) => {
            setAccountIdDraft(value)
            setVerifyResult(null)
            verify.reset()
          }}
          onVerify={handleVerify}
          isVerifying={verify.isPending}
          result={verifyResult}
          errorMessage={verify.error?.message ?? null}
          onBack={() => goTo("token", "back")}
          onContinue={() => goTo("provision", "forward")}
        />
      )}

      {step === "provision" && (
        <ProvisionStep
          stepNumber={stepNumber}
          stepCount={stepCount}
          credentials={draftCredentials}
          onBack={() => goTo("credentials", "back")}
          onProvisioned={() => {
            onProvisioned()
            goTo("done", "forward")
          }}
        />
      )}

      {step === "done" && (
        <DoneStep
          connection={connection}
          credentials={draftCredentials}
          isRefreshing={isConnectionRefreshing}
          onRefresh={onRefreshConnection}
          onDisconnected={() => {
            setTokenDraft("")
            setAccountIdDraft("")
            setVerifyResult(null)
            onDisconnected()
            goTo("intro", "back")
          }}
        />
      )}
    </div>
  )
}
