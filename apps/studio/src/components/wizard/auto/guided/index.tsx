import { useState } from "react"
import { useWizard } from "@/components/wizard/core/WizardProvider"
import { BookCreationWizard } from "@/components/wizard/manual/BookCreationWizard"
import { cn } from "@/lib/utils"
import { Guided } from "./Guided"
import "./shared/look.css"

/**
 * Guided, the Add Book auto mode design: a four-step stepper with one assistant bubble per step. It
 * is built from Check's screens in `check/`, the parts in `shared/` and the look in `shared/look.css`.
 * "Set it up myself" opens the step-by-step wizard with the PDF (and the setup so far) kept; its back button returns here.
 */
export function GuidedFlow() {
  const { setPhase, setCurrentStep } = useWizard()
  const [manual, setManual] = useState(false)
  return (
    <>
        <div className={cn("flex h-full min-h-0 flex-1 flex-col", manual && "hidden")}>
          <Guided
            active={!manual}
            onManual={() => {
              setPhase("wizard")
              setCurrentStep(0)
              setManual(true)
            }}
          />
        </div>
      {manual && (
        <BookCreationWizard
          onBackFromPresets={() => {
            setPhase("upload")
            setManual(false)
          }}
        />
      )}
    </>
  )
}
