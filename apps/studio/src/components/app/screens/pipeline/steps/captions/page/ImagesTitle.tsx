import { Trans } from "@lingui/react/macro"
import type { CaptionFilters } from "../useCaptionFilters"

export function ImagesTitle({ filters }: { filters: CaptionFilters }) {
  const total = filters.counts.all
  const shown = filters.shown.items.length
  if (filters.filtering && shown !== total) return <Trans>Images · {shown} of {total}</Trans>
  return <Trans>Images · {total}</Trans>
}
