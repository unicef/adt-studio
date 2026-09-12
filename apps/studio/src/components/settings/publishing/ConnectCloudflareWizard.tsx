import { useCallback, useEffect, useRef, useState } from "react"
import type { CloudflareConnectionStatus } from "@/api/client"
import { useCloudflareOAuth } from "@/hooks/use-cloudflare-oauth"
import { cn } from "@/lib/utils"
import { AccountPickerStep } from "./AccountPickerStep"
import { DoneStep } from "./DoneStep"
import { ConnectStep } from "./ConnectStep"
import { ProvisionStep } from "./ProvisionStep"
import { WIZARD_STEP_HEADING_ID } from "./WizardStepShell"
import { openExternalUrl } from "./open-external"

type WizardStep = "connect" | "account" | "provision" | "done"

interface ConnectCloudflareWizardProps {
  connection: CloudflareConnectionStatus | undefined
  isConnectionRefreshing: boolean
  onOAuthConnected: () => void
  onProvisioned: () => void
  onRefreshConnection: () => void
  onDisconnected: () => void
}

export function ConnectCloudflareWizard({
  connection,
  isConnectionRefreshing,
  onOAuthConnected,
  onProvisioned,
  onRefreshConnection,
  onDisconnected,
}: ConnectCloudflareWizardProps) {
  const [step, setStep] = useState<WizardStep>("connect")
  const [direction, setDirection] = useState<"forward" | "back">("forward")
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

  useEffect(() => {
    if (connection?.connected || connection?.auth_method !== "oauth" || step !== "connect") return
    goTo("provision", "forward")
  }, [connection?.auth_method, connection?.connected, goTo, step])

  const openedAuthUrlRef = useRef<string | null>(null)
  useEffect(() => {
    if (oauth.phase !== "waiting" || !oauth.authUrl) return
    if (openedAuthUrlRef.current === oauth.authUrl) return
    openedAuthUrlRef.current = oauth.authUrl
    openExternalUrl(oauth.authUrl)
  }, [oauth.authUrl, oauth.phase])

  const steps: WizardStep[] = oauth.accounts.length > 1 ? ["account", "provision"] : ["provision"]
  const stepCount = steps.length
  const stepNumber = Math.max(steps.indexOf(step) + 1, 1)

  return (
    <div
      key={step}
      className={cn(
        "flex h-[max(430px,calc(100dvh-13.5rem))] flex-col overflow-y-auto rounded-xl border bg-card p-5 mh:h-auto motion-reduce:animate-none",
        direction === "forward" ? "animate-step-enter-forward" : "animate-step-enter-back",
      )}
    >
      {step === "connect" && (
        <ConnectStep
          oauthPhase={oauth.phase}
          oauthErrorCode={oauth.errorCode}
          oauthErrorMessage={oauth.errorMessage}
          authUrl={oauth.authUrl}
          onConnectWithCloudflare={() => {
            openedAuthUrlRef.current = null
            oauth.start()
          }}
          onCancelOAuth={oauth.reset}
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


      {step === "provision" && (
        <ProvisionStep
          stepNumber={stepNumber}
          stepCount={stepCount}
          onSignOut={() => {
            oauth.reset()
            onDisconnected()
            goTo("connect", "back")
          }}
          onProvisioned={() => {
            onProvisioned()
            goTo("done", "forward")
          }}
        />
      )}

      {step === "done" && (
        <DoneStep
          connection={connection}
          isRefreshing={isConnectionRefreshing}
          onRefresh={onRefreshConnection}
          onDisconnected={() => {
            oauth.reset()
            onDisconnected()
            goTo("connect", "back")
          }}
        />
      )}
    </div>
  )
}
