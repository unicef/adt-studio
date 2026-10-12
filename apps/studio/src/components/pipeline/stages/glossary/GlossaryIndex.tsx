import { useGlossary } from "@/hooks/use-glossary"
import { useStageStatus } from "@/hooks/use-stage-status"
import { GlossaryLandingPage } from "./GlossaryLandingPage"
import { GlossaryView } from "./GlossaryView"

export function GlossaryIndex({ bookLabel }: { bookLabel: string }) {
  const status = useStageStatus("glossary")

  const { data } = useGlossary(bookLabel)

  if (status.isCompleted || status.isRunning || data) {
    return <GlossaryView bookLabel={bookLabel} />
  }

  return <GlossaryLandingPage bookLabel={bookLabel} />
}
