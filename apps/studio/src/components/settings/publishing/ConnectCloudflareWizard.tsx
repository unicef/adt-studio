import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  CloudflareConnectionStatus,
  CloudflareCredentials,
  CloudflareVerifyResponse,
} from "@/api/client"
import { useVerifyCloudflareToken } from "@/hooks/use-cloudflare-connection"
import { useCloudflareOAuth } from "@/hooks/use-cloudflare-oauth"
import { cn } from "@/lib/utils"
import { AccountPickerStep } from "./AccountPickerStep"
import { CredentialsStep } from "./CredentialsStep"
import { CreateTokenStep } from "./CreateTokenStep"
import { DoneStep } from "./DoneStep"
import { IntroStep } from "./IntroStep"
import { ProvisionStep } from "./ProvisionStep"
import { WIZARD_STEP_HEADING_ID } from "./WizardStepShell"
import { openExternalUrl } from "./open-external"

const MANUAL_STEPS = ["intro", "token", "credentials", "provision"] as const

type WizardStep = "intro" | "token" | "credentials" | "account" | "provision" | "done"

interface ConnectCloudflareWizardProps {
  storedToken: string
  storedAccountId: string
  connection: CloudflareConnectionStatus | undefined
  isConnectionRefreshing: boolean
  onVerified: (credentials: CloudflareCredentials) => void
  onOAuthConnected: () => void
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
  onOAuthConnected,
  onProvisioned,
  onRefreshConnection,
  onDisconnected,
}: ConnectCloudflareWizardProps) {
  const [tokenDraft, setTokenDraft] = useState(storedToken)
  const [accountIdDraft, setAccountIdDraft] = useState(storedAccountId)
  const [verifyResult, setVerifyResult] = useState<CloudflareVerifyResponse | null>(null)
  const [step, setStep] = useState<WizardStep>("intro")
  const [path, setPath] = useState<"oauth" | "manual">("oauth")
  const [direction, setDirection] = useState<"forward" | "back">("forward")
  const verify = useVerifyCloudflareToken()
  const hasMountedRef = useRef(false)

  const goTo = useCallback((next: WizardStep, nextDirection: "forward" | "back") => {
    setDirection(nextDirection)
    setStep(next)
  }, [])

  const oauth = useCloudflareOAuth({
    onConnected: () => {
      onOAuthConnected()
      goTo("provision", "forward")
    },
  })

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }
    document.getElementById(WIZARD_STEP_HEADING_ID)?.focus()
  }, [step])

  useEffect(() => {
    if (oauth.phase === "choosing-account" && step !== "account") {
      goTo("account", "forward")
    }
  }, [goTo, oauth.phase, step])

  const openedAuthUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (oauth.phase !== "waiting" || !oauth.authUrl) return
    if (openedAuthUrlRef.current === oauth.authUrl) return
    openedAuthUrlRef.current = oauth.authUrl
    openExternalUrl(oauth.authUrl)
  }, [oauth.authUrl, oauth.phase])

  const draftCredentials = useMemo<CloudflareCredentials>(
    () => ({ token: tokenDraft.trim(), accountId: accountIdDraft.trim() }),
    [accountIdDraft, tokenDraft],
  )

  const provisionCredentials = useMemo<Partial<CloudflareCredentials>>(
    () => (path === "oauth" ? {} : draftCredentials),
    [draftCredentials, path],
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

  function useApiTokenInstead() {
    oauth.reset()
    setPath("manual")
    goTo("token", "forward")
  }

  const steps: WizardStep[] =
    path === "manual"
      ? [...MANUAL_STEPS]
      : oauth.accounts.length > 1
        ? ["intro", "account", "provision"]
        : ["intro", "provision"]
  const stepCount = steps.length
  const stepNumber = Math.max(steps.indexOf(step) + 1, 1)

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
          oauthPhase={oauth.phase}
          oauthErrorCode={oauth.errorCode}
          oauthErrorMessage={oauth.errorMessage}
          authUrl={oauth.authUrl}
          onConnectWithCloudflare={() => {
            openedAuthUrlRef.current = null
            oauth.start()
          }}
          onCancelOAuth={oauth.reset}
          onUseApiToken={useApiTokenInstead}
        />
      )}

      {step === "account" && (
        <AccountPickerStep
          stepNumber={stepNumber}
          stepCount={stepCount}
          accounts={oauth.accounts}
          isConfirming={oauth.isPickingAccount}
          onConfirm={oauth.pickAccount}
        />
      )}

      {step === "token" && (
        <CreateTokenStep
          stepNumber={stepNumber}
          stepCount={stepCount}
          onBack={() => {
            setPath("oauth")
            goTo("intro", "back")
          }}
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
          credentials={provisionCredentials}
          onBack={() => goTo(path === "oauth" ? "intro" : "credentials", "back")}
          onProvisioned={() => {
            onProvisioned()
            goTo("done", "forward")
          }}
        />
      )}

      {step === "done" && (
        <DoneStep
          connection={connection}
          credentials={provisionCredentials}
          isRefreshing={isConnectionRefreshing}
          onRefresh={onRefreshConnection}
          onDisconnected={() => {
            setTokenDraft("")
            setAccountIdDraft("")
            setVerifyResult(null)
            oauth.reset()
            setPath("oauth")
            onDisconnected()
            goTo("intro", "back")
          }}
        />
      )}
    </div>
  )
}
