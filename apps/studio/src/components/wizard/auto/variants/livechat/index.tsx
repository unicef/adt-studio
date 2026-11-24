import { useState } from "react"
import { useWizard } from "@/components/wizard/core/WizardProvider"
import { BookCreationWizard } from "@/components/wizard/manual/BookCreationWizard"
import { cn } from "@/lib/utils"
import { LiveThread } from "./LiveThread"

/**
 * Variant "Living chat": the conversation where each message grows into a stage while it needs the
 * user and shrinks back into a bubble once it's done. "Set it up myself" opens the step-by-step
 * wizard with the PDF (and the setup so far); its back button returns to the conversation.
 */
export function LiveChatFlow() {
  const { setPhase, setCurrentStep } = useWizard()
  const [manual, setManual] = useState(false)
  return (
    <>
      <div className={cn("flex h-full min-h-0 flex-1 flex-col", manual && "hidden")}>
        <LiveThread
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
