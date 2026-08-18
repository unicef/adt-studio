import { useState } from "react"
import type { ComponentType } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { AddBookDialog } from "@/components/redesign/AddBookDialog"
import { DropZoneLauncher, type WelcomeVariantProps } from "@/components/redesign/screens/home/welcome-full/DropZoneLauncher"
import { PipelineRibbon } from "@/components/redesign/screens/home/welcome-full/PipelineRibbon"
import { HybridPress } from "@/components/redesign/screens/home/welcome-full/HybridPress"

type Option = { id: string; name: React.ReactNode; note: React.ReactNode; Comp: ComponentType<WelcomeVariantProps> }

const OPTIONS: Option[] = [
  {
    id: "D",
    name: <Trans>Drop-zone hero</Trans>,
    note: <Trans>Action-first. The drop target is the whole screen; one clear primary, quiet secondaries.</Trans>,
    Comp: DropZoneLauncher,
  },
  {
    id: "P",
    name: <Trans>Pipeline ribbon</Trans>,
    note: <Trans>Orientation-first. Explains the PDF→book pipeline in one glance, then the CTA.</Trans>,
    Comp: PipelineRibbon,
  },
  {
    id: "H",
    name: <Trans>Split press</Trans>,
    note: <Trans>Craft ceiling. Drop-anywhere hero beside an illustrative preview of a finished edition.</Trans>,
    Comp: HybridPress,
  },
]

function WelcomeFullPreview() {
  const navigate = useNavigate()
  const [addOpen, setAddOpen] = useState(false)

  const handlers: WelcomeVariantProps = {
    onAddBook: () => setAddOpen(true),
    onImport: () => setAddOpen(true),
    onOpenDocs: () => navigate({ to: "/onboarding" }),
    onOpenSample: () => navigate({ to: "/onboarding" }),
  }

  return (
    <div className="min-h-dvh overflow-auto bg-muted/40 p-8 text-foreground">
      <div className="mx-auto max-w-[1180px]">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">
          <Trans>Home welcome — full-screen variants</Trans>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <Trans>Each frame is the Home content area a first-run user sees with zero books. Buttons and drag-and-drop are live.</Trans>
        </p>

        <div className="mt-6 flex flex-col gap-10">
          {OPTIONS.map((o) => {
            const Variant = o.Comp
            return (
              <section key={o.id}>
                <div className="mb-2.5 flex items-baseline gap-3">
                  <span className="rounded-md bg-foreground px-2 py-0.5 font-mono text-[11px] font-semibold text-background">{o.id}</span>
                  <span className="text-[15px] font-semibold">{o.name}</span>
                  <span className="text-[12.5px] text-muted-foreground">{o.note}</span>
                </div>
                <div className="h-[760px] overflow-hidden rounded-2xl border bg-background shadow-lg">
                  <Variant {...handlers} />
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

export const Route = createFileRoute("/redesign-welcome-full")({
  component: WelcomeFullPreview,
})
