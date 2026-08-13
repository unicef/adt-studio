import type { ReactNode } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans } from "@lingui/react/macro"
import { BookOpen, ArrowRight, Sparkles, Play, Image as ImageIcon, Languages, ShieldCheck } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Equalizer } from "./parts"
import { SecondRowHeader, SamplePanel } from "./SecondRowShell"


const OUTPUTS: { icon: LucideIcon; label: ReactNode; cls: string }[] = [
  { icon: Play, label: <Trans>Narration</Trans>, cls: "text-stage-speech" },
  { icon: ImageIcon, label: <Trans>AI captions</Trans>, cls: "text-stage-captions" },
  { icon: Languages, label: <Trans>Translations</Trans>, cls: "text-stage-translate" },
  { icon: ShieldCheck, label: <Trans>WCAG</Trans>, cls: "text-stage-validation" },
]

function PanelLabel({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <div className={`mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] ${accent ? "text-brand-600" : "text-muted-foreground"}`}>
      {children}
    </div>
  )
}

export function SecondRowSampleTransform() {
  const navigate = useNavigate()
  return (
    <>
      <SecondRowHeader
        title={<Trans>From a plain PDF to a book anyone can use</Trans>}
        description={<Trans>Same content — now narrated, described, translated and validated. Open the finished sample to feel the difference.</Trans>}
      />

      <SamplePanel className="p-6">
        <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_1fr]" aria-hidden>
          <div>
            <PanelLabel>
              <Trans>Before · PDF</Trans>
            </PanelLabel>
            <div className="mx-auto w-full max-w-[248px] rounded-xl border bg-muted/40 p-4 opacity-90 grayscale">
              <div className="space-y-2">
                <div className="h-1.5 w-[70%] rounded-full bg-foreground/25" />
                <div className="h-1.5 w-[92%] rounded-full bg-foreground/15" />
                <div className="h-1.5 w-[85%] rounded-full bg-foreground/15" />
              </div>
              <div className="my-3 grid h-16 place-items-center rounded-lg bg-foreground/10 text-foreground/30">
                <ImageIcon className="size-5" />
              </div>
              <div className="space-y-2">
                <div className="h-1.5 w-[88%] rounded-full bg-foreground/15" />
                <div className="h-1.5 w-[60%] rounded-full bg-foreground/15" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center py-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-[11px] font-semibold shadow-sm">
              <Sparkles className="size-3.5 text-brand-600" />
              <Trans>ADT Studio</Trans>
              <ArrowRight className="size-3.5 text-muted-foreground" />
            </span>
          </div>

          <div>
            <PanelLabel accent>
              <Trans>After · Accessible edition</Trans>
            </PanelLabel>
            <div className="mx-auto w-full max-w-[248px] rounded-xl border bg-card p-4 shadow-lg">
              <div className="mb-3 flex items-center gap-2">
                <img src="/logo.png" className="size-4" alt="" />
                <div className="h-1.5 w-20 rounded-full bg-foreground/80" />
                <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground">
                  <Trans>ES</Trans>
                </span>
              </div>
              <div className="space-y-2">
                <div className="h-1.5 w-[92%] rounded-full bg-muted" />
                <div className="h-1.5 w-[80%] rounded-full bg-muted" />
              </div>
              <div className="my-3 flex items-center gap-2 rounded-lg bg-stage-captions/10 px-2 py-2 text-[10px] leading-tight text-stage-captions">
                <ImageIcon className="size-4 shrink-0" />
                <Trans>Cell membrane, with nucleus and organelles</Trans>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-brand-500/[0.06] px-2.5 py-2">
                <span className="grid size-6 place-items-center rounded-full bg-stage-speech text-white">
                  <Play className="size-3" />
                </span>
                <span className="text-stage-speech">
                  <Equalizer />
                </span>
                <span className="ml-auto font-mono text-[9px] text-muted-foreground">0:42</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <ul className="flex flex-wrap gap-1.5">
            {OUTPUTS.map((o, i) => {
              const Icon = o.icon
              return (
                <li key={i} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium">
                  <Icon className={`size-3.5 ${o.cls}`} aria-hidden />
                  {o.label}
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button onClick={() => navigate({ to: "/books/new" })}>
              <BookOpen className="size-4" />
              <Trans>Open the sample</Trans>
            </Button>
            <Button variant="ghost" onClick={() => navigate({ to: "/books/new" })}>
              <Trans>or add your own PDF</Trans>
            </Button>
          </div>
        </div>
      </SamplePanel>
    </>
  )
}
