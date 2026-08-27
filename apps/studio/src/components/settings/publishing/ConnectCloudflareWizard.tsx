import { useCallback, useEffect, useRef, useState } from "react"
import type { CloudflareConnectionStatus } from "@/api/client"
import { useCloudflareOAuth } from "@/hooks/use-cloudflare-oauth"
import { cn } from "@/lib/utils"
import { AccountPickerStep } from "./AccountPickerStep"
import { DoneStep } from "./DoneStep"
import { ConnectStep } from "./ConnectStep"
import { IntroStep } from "./IntroStep"
import { WelcomeStep } from "./WelcomeStep"
import { ProvisionStep } from "./ProvisionStep"
import { WIZARD_STEP_HEADING_ID } from "./WizardStepShell"
import { openExternalUrl } from "./open-external"

const WIZARD_STATE_KEY = "adt-studio-publishing-wizard"

type WizardStep = "welcome" | "intro" | "connect" | "account" | "provision" | "done"

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
  const [restored] = useState(() => {
    try {
      const raw = localStorage.getItem(WIZARD_STATE_KEY)
      if (!raw) return null
      return JSON.parse(raw) as { step?: string; withComments?: boolean }
    } catch {
      return null
    }
  })
  const [step, setStep] = useState<WizardStep>(() => {
    switch (restored?.step) {
      case "intro":
      case "connect":
        return restored.step
      case "account":
      case "provision":
        return "connect"
      default:
        return "welcome"
    }
  })
  const [withComments, setWithComments] = useState(restored?.withComments ?? true)
  const [direction, setDirection] = useState<"forward" | "back">("forward")
  const hasMountedRef = useRef(false)

  const goTo = useCallback((next: WizardStep, nextDirection: "forward" | "back") => {
    setDirection(nextDirection)
    setStep(next)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(WIZARD_STATE_KEY, JSON.stringify({ step, withComments }))
    } catch {
      /* private-mode storage failures must never break the wizard */
    }
  }, [step, withComments])

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
      {step === "welcome" && <WelcomeStep onStart={() => goTo("intro", "forward")} />}

      {step === "intro" && (
        <IntroStep
          onBack={() => goTo("welcome", "back")}
          onContinue={({ storage }) => {
            setWithComments(storage === "cloudflare")
            goTo("connect", "forward")
          }}
        />
      )}

      {step === "connect" && (
        <ConnectStep
          withComments={withComments}
          oauthPhase={oauth.phase}
          oauthErrorCode={oauth.errorCode}
          oauthErrorMessage={oauth.errorMessage}
          authUrl={oauth.authUrl}
          onBack={() => {
            oauth.reset()
            goTo("intro", "back")
          }}
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
          onBack={() => goTo("connect", "back")}
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
            goTo("welcome", "back")
          }}
        />
      )}
    </div>
  )
}
