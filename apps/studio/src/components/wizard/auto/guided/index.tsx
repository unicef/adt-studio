import { lazy, Suspense, useState, type ReactNode } from "react"
import { useWizard } from "@/components/wizard/core/WizardProvider"
import { BookCreationWizard } from "@/components/wizard/manual/BookCreationWizard"
import { ModeChoice } from "@/components/wizard/start/ModeChoice"
import { cn } from "@/lib/utils"
import { Guided } from "./Guided"
import "./shared/look.css"

type Mode = "choose" | "auto" | "manual"

// Dev only: the lab that compares how the Check screens show their other options (`?options=inline`).
// eslint-disable-next-line lingui/no-unlocalized-strings -- a module path
const OptionsLab = import.meta.env.DEV ? lazy(() => import("./lab/OptionsLab")) : null
function WithLab({ children }: { children: ReactNode }) {
  if (!OptionsLab) return <>{children}</>
  return (
    <Suspense fallback={children}>
      <OptionsLab>{children}</OptionsLab>
    </Suspense>
  )
}

/**
 * Add Book: first the choice between the assistant (Guided, in Beta) and the step-by-step wizard.
 * Guided is the four-step flow with one assistant bubble per step, built from Check's screens in
 * `check/`, the parts in `shared/` and the look in `shared/look.css`. Its "Set it up myself" opens
 * the wizard with the PDF (and the setup so far) kept, and the wizard's back returns to Guided; a
 * wizard opened from the choice starts at its presets, and its back returns to the choice.
 */
export function GuidedFlow() {
  const { setPhase, setCurrentStep } = useWizard()
  const [mode, setMode] = useState<Mode>("choose")
  // Guided stays mounted (hidden) under a wizard opened from it, so coming back keeps its state.
  const [guided, setGuided] = useState(false)
  const [manualFrom, setManualFrom] = useState<"choose" | "auto">("choose")

  if (mode === "choose")
    return (
      <ModeChoice
        onAuto={() => {
          setGuided(true)
          setMode("auto")
        }}
        onManual={() => {
          setPhase("upload")
          setCurrentStep(0)
          setManualFrom("choose")
          setMode("manual")
        }}
      />
    )
  return (
    <>
      {guided && (
        <WithLab>
          <div className={cn("flex h-full min-h-0 flex-1 flex-col", mode !== "auto" && "hidden")}>
            <Guided
              active={mode === "auto"}
              onManual={() => {
                setPhase("wizard")
                setCurrentStep(0)
                setManualFrom("auto")
                setMode("manual")
              }}
            />
          </div>
        </WithLab>
      )}
      {mode === "manual" && (
        <BookCreationWizard
          onBackFromPresets={() => {
            setPhase("upload")
            setMode(manualFrom)
          }}
        />
      )}
    </>
  )
}
