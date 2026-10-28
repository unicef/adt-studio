import { Trans } from "@lingui/react/macro"
import { Type } from "lucide-react"
import type { PageDetail } from "@/api/client"
import { PageSection } from "../PageSection"
import { hasFontInfo, PageFontList } from "../PageFontList"
import { SeeMoreButton } from "./SeeMoreButton"
import type { SectionMore } from "./types"

export const FONT_PREVIEW = 4

export function FontsSection({ page, reflowableFont, more }: { page: PageDetail; reflowableFont: { family: string } | null; more: SectionMore }) {
  if (!hasFontInfo(page)) return <PageSection icon={Type} title={<Trans>Fonts</Trans>} empty={<Trans>No fonts detected</Trans>} />
  const count = page.fonts?.length ?? 0
  const hidden = Math.max(0, count - FONT_PREVIEW)
  return (
    <PageSection icon={Type} title={count > 0 ? <Trans>Fonts · {count}</Trans> : <Trans>Detected font</Trans>}>
      <PageFontList page={page} reflowableFont={reflowableFont} limit={count > 0 ? FONT_PREVIEW : undefined} />
      {hidden > 0 && <SeeMoreButton count={hidden} open={more.open} onClick={more.onMore} buttonRef={more.buttonRef} />}
    </PageSection>
  )
}
