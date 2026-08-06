import { useState } from "react"
import type { ReactNode } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { AddBookDialog } from "@/components/redesign/AddBookDialog"
import { WelcomeHero } from "@/components/redesign/screens/home/WelcomeHero"
import { SecondRowSample } from "@/components/redesign/screens/home/welcome-variants/SecondRowSample"
import { SecondRowDemo } from "@/components/redesign/screens/home/welcome-variants/SecondRowDemo"
import { SecondRowChecklist } from "@/components/redesign/screens/home/welcome-variants/SecondRowChecklist"
import { SecondRowCategories } from "@/components/redesign/screens/home/welcome-variants/SecondRowCategories"
import { SecondRowGrouped } from "@/components/redesign/screens/home/welcome-variants/SecondRowGrouped"

type Option = { id: string; name: ReactNode; desc: ReactNode; Comp: () => ReactNode }

const OPTIONS: Option[] = [
  { id: "A", name: <Trans>Sample book</Trans>, desc: <Trans>Activation-first — open a finished book to experience the output.</Trans>, Comp: SecondRowSample },
  { id: "B", name: <Trans>Interactive demo</Trans>, desc: <Trans>Category tabs with a small live demo of what each produces.</Trans>, Comp: SecondRowDemo },
  { id: "C", name: <Trans>Getting-started checklist</Trans>, desc: <Trans>Add → Generate → Preview → Export, step 1 live at first run.</Trans>, Comp: SecondRowChecklist },
  { id: "D", name: <Trans>Category cards</Trans>, desc: <Trans>Four outcome buckets (Listen / See / Understand / Check).</Trans>, Comp: SecondRowCategories },
  { id: "E", name: <Trans>Grouped by stage</Trans>, desc: <Trans>Convert / Enhance / Localize / Validate columns (most detail).</Trans>, Comp: SecondRowGrouped },
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
