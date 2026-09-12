import { Trans } from "@lingui/react/macro"
import { ArrowRight, Cloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WizardStepShell } from "./WizardStepShell"

interface IntroStepProps {
  onBack: () => void
  onContinue: () => void
}

export function IntroStep({ onBack, onContinue }: IntroStepProps) {
  return (
    <WizardStepShell
      title={<Trans>Choose Cloudflare for hosting</Trans>}
      description={<Trans>Your finished books will live in your own Cloudflare account.</Trans>}
      footer={
        <>
          <Button variant="ghost" onClick={onBack}><Trans>Back</Trans></Button>
          <Button className="group ml-auto" onClick={onContinue}>
            <Trans>Continue</Trans><ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </>
      }
    >
      <div className="flex flex-1 flex-col gap-4 pt-1">
        <div className="flex items-start gap-3 rounded-xl border border-indigo-300 bg-indigo-50/50 p-4 shadow-sm ring-1 ring-indigo-200">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-[#f6821f] shadow-sm ring-1 ring-zinc-200">
            <Cloud className="size-5" aria-hidden="true" />
          </span>
          <span className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-foreground"><Trans>Cloudflare</Trans></span>
            <span className="text-xs leading-5 text-muted-foreground"><Trans>The free plan covers normal classroom use and keeps your books in an account you control.</Trans></span>
          </span>
        </div>
      </div>
    </WizardStepShell>
  )
}
