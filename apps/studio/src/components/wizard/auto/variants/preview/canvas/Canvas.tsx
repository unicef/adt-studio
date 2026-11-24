import { useState } from "react"
import { useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupBookFactId } from "@adt/types"
import { FlowTopBar } from "@/components/FlowTopBar"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { cn } from "@/lib/utils"
import { askedFacts } from "../../../engine/answers"
import type { EngineRun } from "../../../engine/useEngineRun"
import { SetupError } from "../../../errors/SetupError"
import { useCreate } from "../../../review/parts"
import { DotGrid } from "../../../../core/ui"
import { WhichLooksRight } from "../question/WhichLooksRight"
import { Rail } from "../rail/Rail"
import { Found } from "../stage/Found"
import type { Device, Shown } from "../stage/layouts"
import { screenPages, useScreenImages } from "../stage/pages"
import { Stage } from "../stage/Stage"
import type { CanvasSetup } from "../useSetup"
import { CreateBar } from "./CreateBar"
import { Header, type Moment } from "./Header"
import { PagesChip } from "./PagesChip"
import { useReveal } from "./useReveal"

const RAW: Shown = { renderStrategy: "raw", sectioningMode: "page", activitiesGenerator: false, figureExtraction: "off" }

/** The page the preview shows: the engine's representative page, kept inside the pages the user chose. */
function usePreviewPage(fallback: number, preferred?: number) {
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)
  const start = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const end = parseInt(useStore(form.store, (s) => s.values.endPage)) || Infinity
  const page = preferred ?? fallback
  if (scope === "range" && (page < start || page > end)) return start
  return page
}

/**
 * Preview first: one canvas, no steps. The finished book, on a computer or a phone, made from the
 * book's own page, builds up while the engine reads; a question is asked as the outcomes side by
 * side; the settings sit in a slim rail (a sheet on phones) and every change re-draws the preview.
 */
export function Canvas({ run, setup, file, onRetry, onManual, onCreate, onReplace }: { run: EngineRun; setup: CanvasSetup | null; file: File | null; onRetry: () => void; onManual: () => void; onCreate: () => void; onReplace: () => void }) {
  const { t } = useLingui()
  const [device, setDevice] = useState<Device>(() => (window.innerWidth < 640 ? "phone" : "desktop"))
  const [sheet, setSheet] = useState(false)
  const [comparing, setComparing] = useState<SetupBookFactId | null>(null)
  const [later, setLater] = useState<SetupBookFactId[]>([])
  const step = useReveal(run.status === "done" && !!setup)
  const rec = setup?.rec ?? null
  const page = usePreviewPage(1, rec?.previewPage)

  const grouping = step >= 1 ? setup?.look.pageGrouping : undefined
  const pages = screenPages(rec, grouping, page)
  const srcs = useScreenImages(file, pages)
  const shown: Shown = step >= 3 && setup ? setup.look : RAW

  const asked = rec ? askedFacts(rec) : []
  const open = setup && step >= 3 ? setup.pending.filter((f) => !later.includes(f.id)) : []
  const factId = comparing ?? open[0]?.id ?? null
  const fact = factId && rec ? rec.facts.find((f) => f.id === factId) ?? null : null
  const failed = run.status === "failed"
  const moment: Moment = failed ? "failed" : step < 3 ? "reading" : fact ? "asking" : "ready"
  const create = useCreate(onCreate)

  const pick = (value: string) => {
    if (!setup || !fact) return
    setup.answer(fact.id, value)
    setComparing(null)
  }
  const compare = (id: SetupBookFactId) => {
    setComparing(id)
    setSheet(false)
  }

  const rail = <Rail setup={step >= 3 ? setup : null} stopped={run.status === "failed"} onCompare={compare} />
  const status =
    moment === "reading" ? t`Reading your book. The preview is being built.` : moment === "asking" && fact ? t`A question about your book: which looks right?` : moment === "ready" ? t`The preview of your book is ready.` : ""

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <FlowTopBar title={t`Add Book`} />
      <DotGrid>
        <div className="absolute left-[38%] top-[45%] h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300/20 blur-3xl motion-reduce:hidden" />
      </DotGrid>

      <main className="relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 pt-4 sm:px-6 lg:flex-row lg:overflow-hidden lg:pt-5">
        <section className="flex min-h-0 flex-1 flex-col gap-4">
          <Header
            moment={moment}
            questions={open.length || 1}
            aside={
              <>
                <PagesChip onReplace={onReplace} />
                <button type="button" onClick={onManual} className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden">
                  <Trans>Set it up myself</Trans>
                </button>
              </>
            }
          />
          <Stage mode={step < 3 ? "reading" : "ready"} device={device} onDevice={setDevice} shown={shown} pages={pages} srcs={srcs} slow={run.slow} onManual={onManual} footer={<Found rec={rec} step={step} />}>
            {run.status === "failed" ? (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <SetupError kind={run.failure.kind} detail={run.failure.detail} onRetry={onRetry} onManual={onManual} />
              </div>
            ) : fact && setup ? (
              <WhichLooksRight
                key={fact.id}
                setup={setup}
                fact={fact}
                file={file}
                device={device}
                onDevice={setDevice}
                number={Math.max(1, asked.findIndex((f) => f.id === fact.id) + 1)}
                total={comparing && !fact.ask ? 1 : asked.length}
                onPick={pick}
                onClose={() => {
                  if (comparing) setComparing(null)
                  else setLater((l) => [...l, fact.id])
                }}
              />
            ) : undefined}
          </Stage>
        </section>

        <aside aria-label={t`Settings`} className={cn("hidden w-[340px] shrink-0 overflow-y-auto pb-4 lg:block", "[scrollbar-width:thin]")}>
          {rail}
        </aside>
      </main>

      <CreateBar file={file} ready={!!setup && step >= 3} pending={open.length} onCreate={create} onManual={onManual} onSettings={() => setSheet(true)} />

      <Sheet open={sheet} onOpenChange={setSheet}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-[28px] p-5 pt-12 lg:hidden" aria-describedby={undefined}>
          <SheetTitle className="sr-only">
            <Trans>Settings</Trans>
          </SheetTitle>
          <SheetDescription className="sr-only">
            <Trans>Change any setting and the preview follows.</Trans>
          </SheetDescription>
          {rail}
          <button type="button" onClick={onManual} className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-muted text-[14px] font-medium">
            <Trans>Set it up myself</Trans>
          </button>
        </SheetContent>
      </Sheet>

      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  )
}
