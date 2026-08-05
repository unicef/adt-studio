import { Trans } from "@lingui/react/macro"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PublishingHeroPreview } from "./PublishingHeroPreview"

interface WelcomeStepProps {
  onStart: () => void
}

export function WelcomeStep({ onStart }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 px-2 py-4 text-center mh:gap-3 mh:py-1.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
      <div className="flex flex-col items-center gap-3 mh:gap-2">
        <p className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
          <Sparkles className="size-3" aria-hidden="true" />
          <Trans>Publishing</Trans>
        </p>
        <h3 className="max-w-2xl text-balance text-[32px] font-bold leading-[1.1] tracking-tight text-foreground sm:text-[38px] mh:text-[24px] mh:sm:text-[27px]">
          <Trans>Your book, one link away</Trans>
        </h3>
        <p className="max-w-xl text-balance text-[15px] leading-7 text-muted-foreground mh:text-[13px] mh:leading-5">
          <Trans>
            Share a finished book as a private website. Reviewers open it in any browser and leave
            their feedback right on the pages — you stay in charge of the link.
          </Trans>
        </p>
        <Button
          size="lg"
          className="group mt-1 h-11 px-8 text-[15px] shadow-md shadow-indigo-600/15 mh:mt-0 mh:h-9 mh:px-6 mh:text-sm"
          onClick={onStart}
        >
          <Trans>Get started</Trans>
          <ArrowRight
            className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </Button>
      </div>

      <PublishingHeroPreview />
    </div>
  )
}
