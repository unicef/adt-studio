import { KeyRound } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { ApiKeyDialog } from "@/components/settings/ApiKeyDialog"
import type { OnboardingStepProps } from "../steps"

export function ApiKeyStep(_props: OnboardingStepProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center p-8">
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <div className="animate-onboarding-icon-float flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
          <KeyRound className="size-8" />
        </div>

        <div className="flex flex-col items-center gap-3">
          <h2 className="animate-onboarding-fade-up text-4xl font-semibold tracking-tight text-foreground md:text-5xl [animation-delay:100ms]">
            <Trans>Connect an AI provider</Trans>
          </h2>
          <p className="animate-onboarding-fade-up max-w-lg text-base leading-relaxed text-muted-foreground [animation-delay:220ms]">
            <Trans>
              ADT Studio uses your own API keys to run the pipeline. Keys are
              stored locally on this device and never sent anywhere else.
            </Trans>
          </p>
        </div>

        <div className="animate-onboarding-fade-up w-full text-left [animation-delay:340ms]">
          <ApiKeyDialog embedded open onOpenChange={() => {}} />
        </div>
      </div>
    </div>
  )
}
