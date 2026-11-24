import { useState } from "react"
import { useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupBookFactId } from "@adt/types"
import { FlowTopBar } from "@/components/FlowTopBar"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { askedFacts } from "../../../engine/answers"
import type { EngineRun } from "../../../engine/useEngineRun"
import { SetupError } from "../../../errors/SetupError"
import { useCreate } from "../../../review/parts"
import { DotGrid } from "../../../../core/ui"
import { WhichLooksRight } from "../question/WhichLooksRight"
import { Rail } from "../rail/Rail"
import type { Device, Shown } from "../stage/layouts"
import { screenPages, useScreenImages } from "../stage/pages"
import { Stage } from "../stage/Stage"
import type { CanvasSetup } from "../useSetup"
import { CreateBar } from "./CreateBar"
import { Header, type Moment } from "./Header"
import { PagesChip } from "./PagesChip"
import { SettingsDrawer } from "./SettingsDrawer"
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
 * Preview first, one thing at a time. While the engine reads: a headline and the book's cover
 * being scanned. Each question then takes the canvas on its own ("Which looks right?", the outcomes
 * side by side). Then the finished book, a one-line summary that opens Settings, the name and Create.
 */
export function Canvas({ run, setup, file, onRetry, onManual, onCreate, onReplace }: { run: EngineRun; setup: CanvasSetup | null; file: File | null; onRetry: () => void; onManual: () => void; onCreate: () => void; onReplace: () => void }) {
  const { t } = useLingui()
  const [device, setDevice] = useState<Device>(() => (window.innerWidth < 640 ? "phone" : "desktop"))
  const [drawer, setDrawer] = useState(false)
  const [comparing, setComparing] = useState<SetupBookFactId | null>(null)
  const step = useReveal(run.status === "done" && !!setup)
  const rec = setup?.rec ?? null
  const page = usePreviewPage(1, rec?.previewPage)

  const grouping = step >= 1 ? setup?.look.pageGrouping : undefined
  const pages = screenPages(rec, grouping, page)
  const srcs = useScreenImages(file, pages)
  const shown: Shown = step >= 3 && setup ? setup.look : RAW

  const asked = rec ? askedFacts(rec) : []
  const pending = setup && step >= 3 ? setup.pending : []
  const factId = comparing ?? pending[0]?.id ?? null
  const fact = factId && rec ? rec.facts.find((f) => f.id === factId) ?? null : null
  const failed = run.status === "failed"
  const moment: Moment = failed ? "failed" : step < 3 ? "reading" : fact ? "asking" : "ready"
  const create = useCreate(onCreate)
  const number = fact ? Math.max(1, asked.findIndex((f) => f.id === fact.id) + 1) : 1
  const total = comparing && fact && !fact.ask ? 1 : asked.length

  const pick = (value: string) => {
    if (!setup || !fact) return
    setup.answer(fact.id, value)
    setComparing(null)
  }
  const compare = (id: SetupBookFactId) => {
    setDrawer(false)
    setComparing(id)
  }

  const status =
    moment === "reading" ? t`Reading your book. The preview is being built.` : moment === "asking" ? t`Which looks right? Question ${number} of ${total}.` : moment === "ready" ? t`Your book is ready to create.` : ""

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <FlowTopBar title={t`Add Book`} />
      <DotGrid>
        <div className="absolute left-[45%] top-[45%] h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300/20 blur-3xl motion-reduce:hidden" />
      </DotGrid>

      <main className="relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 pt-4 sm:px-6 lg:flex-row lg:overflow-hidden lg:pt-5">
        <section className="flex min-h-0 flex-1 flex-col gap-4">
          <Header
            moment={moment}
            number={number}
            total={total}
            aside={
              <>
                <PagesChip onReplace={onReplace} />
                <button type="button" onClick={onManual} className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
                  <Trans>Set it up myself</Trans>
                </button>
              </>
            }
          />
          <Stage mode={step < 3 ? "reading" : "ready"} device={device} onDevice={setDevice} shown={shown} pages={pages} srcs={srcs} slow={run.slow} onManual={onManual}>
            {run.status === "failed" ? (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <SetupError kind={run.failure.kind} detail={run.failure.detail} onRetry={onRetry} onManual={onManual} />
              </div>
            ) : fact && setup ? (
              <WhichLooksRight key={fact.id} setup={setup} fact={fact} file={file} device={device} onDevice={setDevice} onPick={pick} onClose={comparing ? () => setComparing(null) : undefined} />
            ) : undefined}
          </Stage>
        </section>

        <SettingsDrawer open={drawer && moment === "ready"} onClose={() => setDrawer(false)}>
          <Rail setup={setup} onCompare={compare} />
          <p className="mt-5 px-1 text-[12px] leading-snug text-muted-foreground">
            <Trans>The preview is a sketch of where things go, not the converted book.</Trans>
          </p>
        </SettingsDrawer>
      </main>

      {moment === "ready" && setup && <CreateBar setup={setup} file={file} settingsOpen={drawer} onCreate={create} onSettings={() => setDrawer((d) => !d)} />}

      <span role="status" className="sr-only">
        {status}
      </span>
    </div>
  )
}
