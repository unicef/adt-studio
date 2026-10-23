import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import type { PageAspect } from "@/components/app/screens/pipeline/shared/usePageAspect"
import type { PipelinePage } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { StepPageGrid, type StepPageCardContent } from "../../StepPageGrid"
import { StepEmptyHint } from "../../ui"

export function ListPagesGrid({
  label,
  pages,
  aspect,
  onOpen,
  cardOf,
  empty,
}: {
  label: string
  pages: readonly PipelinePage[]
  aspect: PageAspect
  onOpen: (pageId: string) => void
  cardOf: (page: PipelinePage) => StepPageCardContent
  empty?: ReactNode
}) {
  if (pages.length === 0) {
    return <StepEmptyHint>{empty ?? <Trans>Nothing here is linked to a page yet.</Trans>}</StepEmptyHint>
  }
  return <StepPageGrid label={label} pages={pages} aspect={aspect} onOpen={onOpen} cardOf={cardOf} />
}
