import type { I18n } from "@lingui/core"
import { humanReason } from "./humanReason"
import type { PageImageEntry } from "./usePageDetailData"

export function reasonText(i18n: I18n, entry: PageImageEntry): string {
  const reason = humanReason(entry.reason)
  return typeof reason.label === "string" ? reason.label : i18n._(reason.label)
}
