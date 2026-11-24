import { useEffect, useMemo, useState } from "react"
import { useStore } from "@tanstack/react-form"
import { useLingui } from "@lingui/react/macro"
import { useWizard } from "@/components/wizard/core/WizardProvider"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { BookCreationWizard } from "@/components/wizard/manual/BookCreationWizard"
import { CreateScreen } from "../../create/CreateScreen"
import { applySettings } from "../../engine/answers"
import { toSetupResult } from "../../engine/toSetupResult"
import { useEngineRun } from "../../engine/useEngineRun"
import { RecommendationProvider } from "../../recommendation/RecommendationContext"
import { useUploadFlow } from "../../../start/upload/useUploadFlow"
import { ScreenShell } from "../../../core/ui"
import { CoverStage } from "./cover/CoverStage"
import { OpenStage } from "./open/OpenStage"
import { useBookState } from "./useBookState"

type Stage = "cover" | "open" | "create" | "manual"

/**
 * "Open book": the whole Add Book flow happens on the user's own book. Drop the PDF and it stands
 * up as a cover; open it and the real pages turn while the engine reads; then the findings are
 * notes in the margin pinned to the pages that show them, the settings are bookmarks out of the
 * book, and a note the AI is unsure about asks for an answer that moves the bookmarks live.
 * Creating closes the book and runs the shared create step. "Set it up myself" is always one click
 * away and keeps the PDF.
 */
export function OpenBookFlow() {
  const { i18n } = useLingui()
  const { setPhase, setCurrentStep } = useWizard()
  const form = useWizardForm()
  const flow = useUploadFlow()
  const file = useStore(form.store, (s) => s.values.file)
  const [stage, setStage] = useState<Stage>("cover")
  const [from, setFrom] = useState<Stage>("cover")
  const [reading, setReading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [opening, setOpening] = useState(true)
  const run = useEngineRun(reading ? file : null, attempt)
  const rec = run.status === "done" ? run.rec : null
  const state = useBookState(rec)
  const result = useMemo(() => (rec ? toSetupResult(rec, i18n, i18n.locale) : null), [rec, i18n])

  // A different PDF (dropped anywhere) starts over from its cover.
  useEffect(() => {
    setReading(false)
    setStage((s) => (s === "open" || s === "create" ? "cover" : s))
  }, [file])

  const open = () => {
    if (!flow.file) return
    setPhase("wizard")
    setReading(true)
    setOpening(true)
    setStage("open")
  }
  const manual = () => {
    setFrom(stage === "manual" ? from : stage)
    setCurrentStep(0)
    setPhase("wizard")
    setStage("manual")
  }
  const toCover = () => {
    setPhase("upload")
    setStage("cover")
  }

  if (stage === "manual") return <BookCreationWizard onBackFromPresets={() => (from === "open" ? setStage("open") : toCover())} />

  if (stage === "create" && result)
    return (
      <RecommendationProvider value={result}>
        <CreateScreen
          onBack={() => {
            setOpening(true)
            setStage("open")
          }}
        />
      </RecommendationProvider>
    )

  if (stage === "open" && file)
    return (
      <ScreenShell scrollClassName="px-4 sm:px-6">
        <OpenStage
          key={`${attempt}`}
          file={file}
          coverSrc={flow.cover}
          run={run}
          state={state}
          opening={opening}
          onRetry={() => setAttempt((a) => a + 1)}
          onCancel={() => {
            setReading(false)
            toCover()
          }}
          onBack={toCover}
          onManual={manual}
          onCreate={() => {
            const decided = state.decided()
            if (!decided) return
            applySettings(form, decided)
            setOpening(true)
            setStage("create")
          }}
        />
      </ScreenShell>
    )

  return <CoverStage flow={flow} onOpen={open} onManual={manual} />
}
