import { useState } from "react"
import { useWizard } from "@/components/wizard/core/WizardProvider"
import { BookCreationWizard } from "@/components/wizard/manual/BookCreationWizard"
import { cn } from "@/lib/utils"
import { ChatThread } from "./ChatThread"
import { ChatLookContext, type ChatLook } from "./look"

/**
 * Variant "Conversation": the whole Add Book flow as one chat with the ADT Assistant, from the PDF
 * to "Open the book". "Set it up myself" opens the step-by-step wizard with the PDF (and, once the
 * assistant has answered, its setup) kept; its back button returns to the conversation as it was.
 */
export function ConversationFlow({ look = "regular" }: { look?: ChatLook }) {
  const { setPhase, setCurrentStep } = useWizard()
  const [manual, setManual] = useState(false)
  return (
    <ChatLookContext.Provider value={look}>
      <div className={cn("flex h-full min-h-0 flex-1 flex-col", manual && "hidden")}>
        <ChatThread
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
    </ChatLookContext.Provider>
  )
}
