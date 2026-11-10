import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { ReasonKind } from "../page-detail/humanReason"

export const GROUP_TITLE: Record<ReasonKind, MessageDescriptor> = {
  "page-elements": msg`Will be rebuilt as page elements`,
  "not-meaningful": msg`Not meaningful`,
  duplicate: msg`Copies of kept figures`,
  "too-small": msg`Too small`,
  "too-large": msg`Too large`,
  blank: msg`Blank or a single colour`,
  manual: msg`Removed by you`,
  segmented: msg`Split into parts`,
  cropped: msg`Replaced by a crop`,
  "full-page": msg`Whole-page pictures`,
  "guard-kept": msg`Kept by a safety check`,
  other: msg`Other reasons`,
}
