import { Lightbulb } from "lucide-react"
import type { ReactNode } from "react"
import type { StepNote } from "../notes/NoteRow"

export function hintNote({
  title,
  body,
  dismissLabel,
  onDismiss,
}: {
  title: ReactNode
  body: ReactNode
  dismissLabel: ReactNode
  onDismiss: () => void
}): StepNote {
  return {
    id: "how-it-works",
    icon: Lightbulb,
    title,
    body,
    actions: [{ label: dismissLabel, onClick: onDismiss, quiet: true }],
  }
}
