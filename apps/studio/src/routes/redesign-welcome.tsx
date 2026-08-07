import { useState } from "react"
import type { ReactNode } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { AddBookDialog } from "@/components/redesign/AddBookDialog"
import { WelcomeHero } from "@/components/redesign/screens/home/WelcomeHero"
import { SecondRowSample } from "@/components/redesign/screens/home/welcome-variants/SecondRowSample"
import { SecondRowSampleHero } from "@/components/redesign/screens/home/welcome-variants/SecondRowSampleHero"
import { SecondRowSampleTransform } from "@/components/redesign/screens/home/welcome-variants/SecondRowSampleTransform"
import { SecondRowSampleWalkthrough } from "@/components/redesign/screens/home/welcome-variants/SecondRowSampleWalkthrough"
import { SecondRowSampleGallery } from "@/components/redesign/screens/home/welcome-variants/SecondRowSampleGallery"

type Option = { id: string; name: ReactNode; desc: ReactNode; Comp: () => ReactNode }

const OPTIONS: Option[] = [
  { id: "A", name: <Trans>Sample book (original)</Trans>, desc: <Trans>Split panel — animated preview beside an "open a sample" CTA.</Trans>, Comp: SecondRowSample },
  { id: "A1", name: <Trans>Before → After</Trans>, desc: <Trans>Plain PDF transforms into the finished accessible edition.</Trans>, Comp: SecondRowSampleTransform },
  { id: "A2", name: <Trans>Sample walkthrough</Trans>, desc: <Trans>One book, four facets (Listen / See / Understand / Check); auto-plays.</Trans>, Comp: SecondRowSampleWalkthrough },
  { id: "A3", name: <Trans>Immersive hero</Trans>, desc: <Trans>Centred, spotlit preview with one prominent CTA.</Trans>, Comp: SecondRowSampleHero },
  { id: "A4", name: <Trans>Sample gallery</Trans>, desc: <Trans>Pick from a few finished books by subject and grade.</Trans>, Comp: SecondRowSampleGallery },
]

function WelcomeSecondRowPreview() {
  const [addOpen, setAddOpen] = useState(false)
  return (
    <div className="min-h-dvh overflow-auto bg-muted/40 p-8 text-foreground">
      <div className="mx-auto max-w-[1120px]">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">
          <Trans>Home welcome — second-row options</Trans>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <Trans>Each frame is a regular screen height — the banner stays the same, only the row beneath it changes. Buttons are live.</Trans>
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
                <div className="h-[720px] overflow-hidden rounded-2xl border bg-background shadow-lg">
                  <div className="h-full overflow-auto px-[34px] py-7">
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
  component: WelcomeSecondRowPreview,
})
