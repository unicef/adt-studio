import { useState } from "react"
import type { ReactNode } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { AddBookDialog } from "@/components/redesign/AddBookDialog"
import { WelcomeHero } from "@/components/redesign/screens/home/WelcomeHero"
import { FeatureTour } from "@/components/redesign/screens/home/FeatureTour"
import { PipelineStrip } from "@/components/redesign/screens/home/PipelineStrip"
import { SecondRowChecklist } from "@/components/redesign/screens/home/welcome-variants/SecondRowChecklist"
import { SecondRowGrouped } from "@/components/redesign/screens/home/welcome-variants/SecondRowGrouped"

type Option = { id: string; name: ReactNode; desc: ReactNode; Comp: () => ReactNode }

const OPTIONS: Option[] = [
  { id: "1", name: <Trans>Feature cards (current)</Trans>, desc: <Trans>Four-card "What ADT Studio does" grid.</Trans>, Comp: FeatureTour },
  { id: "2", name: <Trans>Pipeline strip</Trans>, desc: <Trans>The PDF→bundle pipeline as one horizontal strip.</Trans>, Comp: PipelineStrip },
  { id: "3", name: <Trans>Get-started checklist</Trans>, desc: <Trans>Four numbered steps with the first-book CTA inline.</Trans>, Comp: SecondRowChecklist },
  { id: "4", name: <Trans>Capabilities by phase</Trans>, desc: <Trans>Convert / Enhance / Localize / Validate columns.</Trans>, Comp: SecondRowGrouped },
]

function WelcomeBottomPreview() {
  const [addOpen, setAddOpen] = useState(false)
  return (
    <div className="min-h-dvh overflow-auto bg-muted/40 p-8 text-foreground">
      <div className="mx-auto max-w-[1120px]">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">
          <Trans>Home welcome — bottom-row options</Trans>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <Trans>The banner stays the same; only the row beneath it changes. Buttons are live.</Trans>
        </p>

        <div className="mt-6 flex flex-col gap-8">
          {OPTIONS.map((o) => {
            const Second = o.Comp
            return (
              <section key={o.id}>
                <div className="mb-2.5 flex items-baseline gap-3">
                  <span className="rounded-md bg-foreground px-2 py-0.5 font-mono text-[11px] font-semibold text-background">{o.id}</span>
                  <span className="text-[15px] font-semibold">{o.name}</span>
                  <span className="text-[12.5px] text-muted-foreground">{o.desc}</span>
                </div>
                <div className="overflow-hidden rounded-2xl border bg-background shadow-lg">
                  <div className="px-[34px] py-7">
                    <WelcomeHero onOpenAdd={() => setAddOpen(true)} />
                    <Second />
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </div>
      <AddBookDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

export const Route = createFileRoute("/redesign-welcome")({
  component: WelcomeBottomPreview,
})
