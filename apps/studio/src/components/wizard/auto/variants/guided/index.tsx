import { useState } from "react"
import { useWizard } from "@/components/wizard/core/WizardProvider"
import { BookCreationWizard } from "@/components/wizard/manual/BookCreationWizard"
import { cn } from "@/lib/utils"
import { ChatLookContext } from "../chat/look"
import { Guided } from "./Guided"
import { GuidedIdeas } from "./ideas"
import "../livechat/livechat.css"

/**
 * Variant "Guided": Add Book as a four-step stepper with one assistant bubble per step. It shares
 * Living chat's look and parts (questions, settings, evidence, finish), so it renders them in the
 * "living" look with Guided's own picks of the board's ideas. "Set it up myself" opens the
 * step-by-step wizard with the PDF (and the setup so far) kept; its back button returns here.
 */
export function GuidedFlow() {
  const { setPhase, setCurrentStep } = useWizard()
  const [manual, setManual] = useState(false)
  return (
    <ChatLookContext.Provider value="living">
      <GuidedIdeas>
        <div className={cn("flex h-full min-h-0 flex-1 flex-col", manual && "hidden")}>
          <Guided
            onManual={() => {
              setPhase("wizard")
              setCurrentStep(0)
              setManual(true)
            }}
          />
        </div>
      </GuidedIdeas>
      {manual && (
        <BookCreationWizard
          onBackFromPresets={() => {
            setPhase("upload")
            setManual(false)
          }}
        />
      )}
    </ChatLookContext.Provider>
  )
}
