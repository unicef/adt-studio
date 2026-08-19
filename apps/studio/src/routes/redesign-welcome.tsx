import { useState } from "react"
import type { ReactNode } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { TopBar } from "@/components/title-bar/TopBar"
import { AppSidebar } from "@/components/redesign/AppSidebar"
import { AddBookDialog } from "@/components/redesign/AddBookDialog"
import { WelcomeHero } from "@/components/redesign/screens/home/WelcomeHero"
import { V1Bento } from "@/components/redesign/screens/home/welcome-e/V1Bento"
import { V2Reader } from "@/components/redesign/screens/home/welcome-e/V2Reader"
import { V3Switcher } from "@/components/redesign/screens/home/welcome-e/V3Switcher"
import { V4Grid } from "@/components/redesign/screens/home/welcome-e/V4Grid"
import { V5Tiles } from "@/components/redesign/screens/home/welcome-e/V5Tiles"
import { V6Split } from "@/components/redesign/screens/home/welcome-e/V6Split"
import { V7Rail } from "@/components/redesign/screens/home/welcome-e/V7Rail"

type Option = { id: string; name: ReactNode; desc: ReactNode; bottom: () => ReactNode }

const OPTIONS: Option[] = [
  { id: "1", name: <Trans>Varied bento</Trans>, desc: <Trans>Audio flagship tile + mode tiles + extra chips.</Trans>, bottom: V1Bento },
  { id: "2", name: <Trans>In-context reader</Trans>, desc: <Trans>A mock page with the accessibility toolbar, extras alongside.</Trans>, bottom: V2Reader },
  { id: "3", name: <Trans>Mode switcher</Trans>, desc: <Trans>Segmented modes with a live preview panel.</Trans>, bottom: V3Switcher },
  { id: "4", name: <Trans>Borderless grid</Trans>, desc: <Trans>All nine features, de-boxed icon rows.</Trans>, bottom: V4Grid },
  { id: "5", name: <Trans>Mode tiles + chips</Trans>, desc: <Trans>Five mode tiles with the extras clustered.</Trans>, bottom: V5Tiles },
  { id: "6", name: <Trans>Split editorial</Trans>, desc: <Trans>Bold statement beside a two-column feature list.</Trans>, bottom: V6Split },
  { id: "7", name: <Trans>Grouped rail</Trans>, desc: <Trans>Features grouped by how the reader reaches the page.</Trans>, bottom: V7Rail },
]

function ShellFrame({ bottom: Bottom, onOpenAdd }: { bottom: () => ReactNode; onOpenAdd: () => void }) {
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
        <div className="flex h-full flex-col overflow-auto px-11 pb-11 pt-16">
          <WelcomeHero onOpenAdd={onOpenAdd} />
          <Bottom />
        </div>
      </div>
    </div>
  )
}

function WelcomeEPreview() {
  const [addOpen, setAddOpen] = useState(false)
  return (
    <div className="min-h-dvh overflow-auto bg-muted/40 p-8 text-foreground">
      <div className="mx-auto max-w-[1280px]">
        <h1 className="text-2xl font-bold tracking-[-0.02em]">
          <Trans>First-run welcome — feature-highlight variants</Trans>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <Trans>Banner stays; seven ways to highlight the accessibility features below it. Real shell, centered, zero books.</Trans>
        </p>

        <div className="mt-6 flex flex-col gap-10">
          {OPTIONS.map((o) => (
            <section key={o.id}>
              <div className="mb-2.5 flex items-baseline gap-3">
                <span className="rounded-md bg-foreground px-2 py-0.5 font-mono text-[11px] font-semibold text-background">{o.id}</span>
                <span className="text-[15px] font-semibold">{o.name}</span>
                <span className="text-[12.5px] text-muted-foreground">{o.desc}</span>
              </div>
              <ShellFrame bottom={o.bottom} onOpenAdd={() => setAddOpen(true)} />
            </section>
          ))}
        </div>
      </div>
      <AddBookDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

export const Route = createFileRoute("/redesign-welcome")({
  component: WelcomeEPreview,
})
