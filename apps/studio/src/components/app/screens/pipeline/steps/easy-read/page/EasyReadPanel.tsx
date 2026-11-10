import { Trans } from "@lingui/react/macro"
import { BookOpenText } from "lucide-react"
import type { EasyReadSectionBlock } from "@/api/client"
import { PageSection } from "../../shared/page-inspector/PageSection"
import { SeeMoreButton } from "../../shared/page-inspector/SeeMoreButton"
import type { SectionMore } from "../../shared/page-inspector/useInspectorSheet"
import { SaveError } from "../../shared/ui"
import { entryCount, takeEntries } from "../easyReadPages"
import { EasyReadSections, type EasyReadSectionsProps } from "../EasyReadSections"

export const EASY_READ_PREVIEW = 4

export function EasyReadPanel({
  blocks,
  locked,
  saveError,
  isEdited,
  onUpdate,
  more,
}: {
  blocks: readonly EasyReadSectionBlock[]
  locked: boolean
  saveError: Error | null
  isEdited: EasyReadSectionsProps["isEdited"]
  onUpdate: EasyReadSectionsProps["onUpdate"]
  more: SectionMore
}) {
  const total = entryCount(blocks)
  if (total === 0)
    return <PageSection icon={BookOpenText} title={<Trans>Blocks</Trans>} empty={<Trans>This page has no Easy Read text.</Trans>} />

  const hidden = Math.max(0, total - EASY_READ_PREVIEW)

  return (
    <PageSection icon={BookOpenText} title={<Trans>Blocks · {total}</Trans>}>
      <SaveError error={saveError} />
      <EasyReadSections blocks={takeEntries(blocks, EASY_READ_PREVIEW)} layout="stacked" locked={locked} isEdited={isEdited} onUpdate={onUpdate} />
      <SeeMoreButton count={hidden > 0 ? hidden : undefined} open={more.open} onClick={more.onMore} buttonRef={more.buttonRef} />
    </PageSection>
  )
}
