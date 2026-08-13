import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PreviewArt } from "./parts"
import { SampleEyebrow } from "./SecondRowShell"

export function SecondRowSampleHero() {
  const navigate = useNavigate()
  return (
    <div className="relative mt-6 overflow-hidden rounded-2xl border bg-card bg-gradient-to-b from-brand-500/[0.07] via-transparent to-transparent">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-56 w-72 -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand-500/15 blur-3xl"
      />

      <div className="relative flex flex-col items-center px-6 py-7 text-center">
        <SampleEyebrow />
        <h3 className="mt-3 max-w-[440px] text-xl font-bold leading-tight tracking-[-0.02em]">
          <Trans>See what a finished, accessible book feels like.</Trans>
        </h3>
        <p className="mt-2 max-w-[440px] text-[13px] leading-relaxed text-muted-foreground">
          <Trans>A real converted textbook — narration, AI captions, translations and a quiz, all in one place. Explore it before converting your own PDF.</Trans>
        </p>

        <div className="my-6 grid scale-90 place-items-center">
          <PreviewArt />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button size="lg" onClick={() => navigate({ to: "/books/new" })}>
            <BookOpen className="size-4" />
            <Trans>Open the sample book</Trans>
          </Button>
          <Button variant="ghost" size="lg" onClick={() => navigate({ to: "/books/new" })}>
            <Trans>or add your own PDF</Trans>
          </Button>
        </div>
      </div>
    </div>
  )
}
