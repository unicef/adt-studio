import { useStageStatus } from "@/hooks/use-stage-status"
import { useGlossary } from "@/hooks/use-glossary"
import { GlossaryLandingPage } from "./GlossaryLandingPage"
import { GlossaryView } from "./GlossaryView"

export function GlossaryIndex({ bookLabel }: { bookLabel: string }) {
  const status = useStageStatus("glossary")
  const { data } = useGlossary(bookLabel)

  if (status.isCompleted || status.isRunning || data != null) {
    return <GlossaryView bookLabel={bookLabel} />
  }

  return <GlossaryLandingPage bookLabel={bookLabel} />
}
