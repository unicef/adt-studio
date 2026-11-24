import { useMemo, useState } from "react"
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
import { Canvas } from "./canvas/Canvas"
import { DropScreen } from "./DropScreen"
import { useSetup } from "./useSetup"

type Screen = "canvas" | "create" | "manual"

function Drop() {
  const flow = useUploadFlow()
  return <DropScreen flow={flow} />
}

/**
 * "Preview first": drop a PDF and land on one canvas that shows the finished book. The engine runs
 * once per PDF (kept while the user visits Create or the manual setup); answers and changes live
 * here, so coming back finds the canvas as it was.
 */
export function PreviewFirstFlow() {
  const { phase, setPhase, setCurrentStep } = useWizard()
  const form = useWizardForm()
  const { i18n } = useLingui()
  const file = useStore(form.store, (s) => s.values.file)
  const [screen, setScreen] = useState<Screen>("canvas")
  const [attempt, setAttempt] = useState(0)
  const run = useEngineRun(phase === "wizard" ? file : null, attempt)
  const rec = run.status === "done" ? run.rec : null
  const setup = useSetup(rec)
  const result = useMemo(() => (rec ? toSetupResult(rec, i18n, i18n.locale) : null), [rec, i18n])

  const openManual = () => {
    if (setup) applySettings(form, setup.decided)
    setCurrentStep(0)
    setScreen("manual")
  }
  const replace = () => {
    form.setFieldValue("file", null)
    form.setFieldValue("label", "")
    setScreen("canvas")
    setPhase("upload")
  }

  if (phase === "upload") return <Drop />
  if (screen === "manual") return <BookCreationWizard onBackFromPresets={() => setScreen("canvas")} />
  if (screen === "create" && result)
    return (
      <RecommendationProvider value={result}>
        <CreateScreen onBack={() => setScreen("canvas")} />
      </RecommendationProvider>
    )
  return (
    <Canvas
      run={run}
      setup={setup}
      file={file}
      onRetry={() => setAttempt((a) => a + 1)}
      onManual={openManual}
      onReplace={replace}
      onCreate={() => {
        if (!setup) return
        applySettings(form, setup.decided)
        setScreen("create")
      }}
    />
  )
}
