import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { useVariant } from "@/components/app/lab/variants"
import type { StepNote } from "../notes/NoteRow"
import { hintStore } from "./hintStore"
import { hintNote } from "./HintNote"
import { HintHelpButton } from "./HintHelpButton"

export interface HowItWorks {
  note: StepNote | null
  help: ReactNode
}

export function useHowItWorks(slug: string, { title, body }: { title: ReactNode; body: ReactNode }): HowItWorks {
  const mode = useVariant("hints")
  const [dismissed, setDismissed] = hintStore(slug).use()
  if (mode === "help") return { note: null, help: <HintHelpButton title={title} body={body} /> }
  if (mode === "none" || dismissed) return { note: null, help: null }
  return {
    note: hintNote({ title, body, dismissLabel: <Trans>Got it</Trans>, onDismiss: () => setDismissed(true) }),
    help: null,
  }
}
