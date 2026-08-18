import { useState } from "react"
import type { ReactNode } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { TopBar } from "@/components/title-bar/TopBar"
import { AppSidebar } from "@/components/redesign/AppSidebar"
import { AddBookDialog } from "@/components/redesign/AddBookDialog"
import { WelcomeHero } from "@/components/redesign/screens/home/WelcomeHero"
import { PipelineStrip } from "@/components/redesign/screens/home/PipelineStrip"
import { SecondRowGrouped } from "@/components/redesign/screens/home/welcome-variants/SecondRowGrouped"

type Placement = "top" | "center"
type Option = { id: string; name: ReactNode; desc: ReactNode; placement: Placement; bottom: () => ReactNode }

const OPTIONS: Option[] = [
  {
    id: "A",
    name: <Trans>Pipeline · top-anchored</Trans>,
    desc: <Trans>Banner + pipeline strip pinned to the top (leaves the lower area open).</Trans>,
    placement: "top",
    bottom: PipelineStrip,
  },
  {
    id: "B",
    name: <Trans>Pipeline · centered</Trans>,
    desc: <Trans>Same content, vertically centered so the empty area reads as calm, not unfinished.</Trans>,
    placement: "center",
    bottom: PipelineStrip,
  },
  {
    id: "C",
    name: <Trans>Capabilities · centered</Trans>,
    desc: <Trans>Banner + the full "what every book gets" breakdown, centered.</Trans>,
    placement: "center",
    bottom: SecondRowGrouped,
  },
]

function ShellFrame({ option, onOpenAdd }: { option: Option; onOpenAdd: () => void }) {
  const Bottom = option.bottom
  return (
    <div className="relative flex h-[860px] overflow-hidden rounded-2xl border bg-background text-foreground shadow-xl ring-1 ring-black/5">
      <AppSidebar
        libraryCount={0}
        handoffsCount={0}
        onOpenPalette={() => {}}
        onOpenAdd={onOpenAdd}
        onOpenShortcuts={() => {}}
      />
      <div className="relative min-h-0 min-w-0 flex-1">
        <TopBar className="absolute top-0 drag-region" />
        <div className="pointer-events-none absolute -top-[120px] right-[-80px] size-[440px] animate-hero-drift rounded-full bg-[radial-gradient(circle,rgba(43,127,255,.12),transparent_70%)]" />
        <div
          className={cn(
            "h-full overflow-auto px-8",
            option.placement === "center" ? "flex flex-col justify-center pb-10 pt-14" : "pb-6 pt-14",
          )}
        >
          <WelcomeHero onOpenAdd={onOpenAdd} />
          <Bottom />
        </div>
      </div>
    </div>
  )
}

function WelcomeShellPreview() {
  const [addOpen, setAddOpen] = useState(false)
  return (
    <div className="min-h-dvh overflow-auto bg-muted/40 p-8 text-foreground">
      <div className="mx-auto max-w-[1280px]">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">
          <Trans>First-run welcome — in the app shell</Trans>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <Trans>Only shown when the user has zero books. Each frame is the real sidebar + window bar. Buttons are live.</Trans>
        </p>

        <div className="mt-6 flex flex-col gap-10">
          {OPTIONS.map((o) => (
            <section key={o.id}>
              <div className="mb-2.5 flex items-baseline gap-3">
                <span className="rounded-md bg-foreground px-2 py-0.5 font-mono text-[11px] font-semibold text-background">{o.id}</span>
                <span className="text-[15px] font-semibold">{o.name}</span>
                <span className="text-[12.5px] text-muted-foreground">{o.desc}</span>
              </div>
              <ShellFrame option={o} onOpenAdd={() => setAddOpen(true)} />
            </section>
          ))}
        </div>
      </div>
      <AddBookDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

export const Route = createFileRoute("/redesign-welcome")({
  component: WelcomeShellPreview,
})
