import { useEffect, useState } from "react"
import { useWizard } from "@/components/wizard/core/WizardProvider"
import { BookCreationWizard } from "@/components/wizard/manual/BookCreationWizard"
import { ModeChoice } from "@/components/wizard/start/ModeChoice"
import { cn } from "@/lib/utils"
import { releasePageThumbs } from "@/components/wizard/core/pdf/usePageThumb"
import { Guided } from "@/components/wizard/auto/guided/Guided"
import "./core/look.css"

type Mode = "choose" | "auto" | "manual"

/**
 * Add Book: first the choice between the assistant (Guided, in Beta) and the step-by-step wizard.
 * Guided (auto/guided/) is the four-step flow with one assistant bubble per step, built from Check's
 * screens in `check/` and the parts in `shared/`, on the look in `core/look.css`. Its "Set it up myself" opens
 * the wizard with the PDF (and the setup so far) kept, and the wizard's back returns to Guided; a
 * wizard opened from the choice starts at its presets, and its back returns to the choice.
 */
export function AddBookFlow() {
  const { setPhase, setCurrentStep } = useWizard()
  const [mode, setMode] = useState<Mode>("choose")
  // Guided stays mounted (hidden) under a wizard opened from it, so coming back keeps its state.
  const [guided, setGuided] = useState(false)
  const [manualFrom, setManualFrom] = useState<"choose" | "auto">("choose")
  // The PDF's pages are drawn from one open document; leaving Add Book releases it.
  useEffect(() => releasePageThumbs, [])

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
