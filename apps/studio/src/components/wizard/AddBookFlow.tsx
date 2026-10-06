import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { useWizard } from "@/components/wizard/core/WizardProvider"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { BookCreationWizard } from "@/components/wizard/manual/BookCreationWizard"
import { ChooseScreen } from "./start/choose/ChooseScreen"
import { CreateScreen } from "./auto/create/CreateScreen"
import { DecideScreen } from "./auto/decide/DecideScreen"
import { LoaderScreen } from "./auto/loader/LoaderScreen"
import type { SetupResult } from "./auto/recommendation/contract"
import { RecommendationProvider } from "./auto/recommendation/RecommendationContext"
import { ReviewScreen } from "./auto/review/ReviewScreen"
import { applyAiPicks, toAiPicks, type AiPicks, type SettingKey } from "./auto/review/setup"
import { UploadScreen } from "./start/upload/UploadScreen"
import { useUploadFlow } from "./start/upload/useUploadFlow"

type Screen = "choose" | "loader" | "decide" | "review" | "create" | "manual"

function UploadStep() {
  const flow = useUploadFlow()
  return <UploadScreen flow={flow} />
}

/**
 * "Add Book": upload → choose (AI or manual) → AI setup → decide (only when the recommender left the
 * look between two options) → review → create, which opens the book. Manual is the preset grid and
 * the step-by-step settings. Auto vs manual is decided on Choose; on the AI path every setting stays
 * editable on Review (All settings).
 */
export function AddBookFlow() {
  const { phase, setPhase, setCurrentStep } = useWizard()
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const [screen, setScreen] = useState<Screen>("choose")
  const [result, setResult] = useState<SetupResult | null>(null)
  const [asked, setAsked] = useState<SettingKey[]>([])

  useEffect(() => {
    setResult(null)
    setAsked([])
  }, [file])

  const aiPicks = useMemo(() => (result ? toAiPicks(result.recommendation) : null), [result])
  const picks = aiPicks ? { ...aiPicks, asked } : null

  const apply = (from: AiPicks, renderStrategy?: string, nextAsked: SettingKey[] = []) => {
    applyAiPicks(form, from, renderStrategy ? { renderStrategy: renderStrategy as AiPicks["renderStrategy"] } : {})
    setAsked(nextAsked)
  }
  const openManual = () => {
    setCurrentStep(0)
    setScreen("manual")
  }
  const choose = <ChooseScreen onAuto={() => setScreen("loader")} onManual={openManual} onBack={() => setPhase("upload")} />

  let content: ReactNode
  if (phase === "upload") content = <UploadStep />
  else if (screen === "loader")
    content = (
      <LoaderScreen
        onDone={(answer) => {
          setResult(answer)
          apply(toAiPicks(answer.recommendation))
          setScreen("review")
        }}
        onUnsure={(answer) => {
          setResult(answer)
          setScreen("decide")
        }}
        onStartOver={() => setScreen("choose")}
        onManual={openManual}
      />
    )
  else if (screen === "decide" && aiPicks)
    content = (
      <DecideScreen
        onBack={() => setScreen("choose")}
        onDone={(look) => {
          apply(aiPicks, look, ["look"])
          setScreen("review")
        }}
      />
    )
  else if (screen === "review" && picks) content = <ReviewScreen picks={picks} onBack={() => setScreen(asked.length ? "decide" : "choose")} onCreate={() => setScreen("create")} />
  else if (screen === "create") content = <CreateScreen onBack={() => setScreen("review")} />
  else if (screen === "manual") content = <BookCreationWizard onBackFromPresets={() => setScreen("choose")} />
  else content = choose

  return <RecommendationProvider value={result}>{content}</RecommendationProvider>
}
