import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react"
import type { ImageProcessingPreviewFocus } from "./step3ContentProcessing/imageProcessingPreviewTypes"
import type { PresetId } from "./constants"
import { useCloseIntent } from "@/components/close-guard/CloseGuard"

export type WizardPhase = "upload" | "wizard"

interface WizardContextValue {
  phase: WizardPhase
  setPhase: (phase: WizardPhase) => void
  currentStep: number
  setCurrentStep: (step: number) => void
  stepDirection: "forward" | "back"
  previewFocus: ImageProcessingPreviewFocus
  setPreviewFocus: (focus: ImageProcessingPreviewFocus) => void
  committedStep0Preset: PresetId | null
  setCommittedStep0Preset: (id: PresetId) => void
}

const WizardContext = createContext<WizardContextValue | null>(null)

export function WizardProvider({ children }: { children: ReactNode }) {
  const [phase, setPhaseRaw] = useState<WizardPhase>("upload")
  const [currentStep, setCurrentStepRaw] = useState(0)
  const [stepDirection, setStepDirection] = useState<"forward" | "back">("forward")

  const setPhase = useCallback((next: WizardPhase) => {
    setStepDirection(next === "wizard" ? "forward" : "back")
    setPhaseRaw(next)
  }, [])

  const hasProgress = !(phase === "upload" && currentStep === 0)

  useCloseIntent(hasProgress, "wizard")

  useEffect(() => {
    if (!hasProgress) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [hasProgress])

  const [previewFocus, setPreviewFocusRaw] =
    useState<ImageProcessingPreviewFocus>("idle")

  const [committedStep0Preset, setCommittedStep0Preset] = useState<PresetId | null>(null)

  const setCurrentStep = useCallback((step: number) => {
    setStepDirection(step > currentStep ? "forward" : "back")
    setCurrentStepRaw(step)
    if (step !== 3) setPreviewFocusRaw("idle")
  }, [currentStep])

  const setPreviewFocus = useCallback(
    (focus: ImageProcessingPreviewFocus) => setPreviewFocusRaw(focus),
    [],
  )

  return (
    <WizardContext.Provider
      value={{
        phase,
        setPhase,
        currentStep,
        setCurrentStep,
        stepDirection,
        previewFocus,
        setPreviewFocus,
        committedStep0Preset,
        setCommittedStep0Preset,
      }}
    >
      {children}
    </WizardContext.Provider>
  )
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext)
  if (!ctx) throw new Error("useWizard must be used inside <WizardProvider>")
  return ctx
}

const PREVIEW_HOVER_DELAY = 300

export function useDelayedPreviewFocus(focus: ImageProcessingPreviewFocus) {
  const { setPreviewFocus } = useWizard()
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const onMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setPreviewFocus(focus), PREVIEW_HOVER_DELAY)
  }, [focus, setPreviewFocus])

  const onMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return { onMouseEnter, onMouseLeave }
}
