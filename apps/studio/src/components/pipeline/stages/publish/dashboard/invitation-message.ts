import { useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import { formatPublishDate } from "../expiry-options"
import type { DashLink } from "./dashboard-data"

/** The message an author sends: the title, the link, the code — word for word what gets copied. */
export function useInvitationMessage(link: DashLink): string {
  const { i18n, t } = useLingui()
  return useMemo(() => {
    const lines = [
      t`${link.title} is ready to read.`,
      "",
      t`Open: ${link.url}`,
      ...(link.accessCode === null ? [] : [t`Access code: ${link.accessCode}`]),
      ...(link.expiresAt === null
        ? []
        : ["", t`The link stops working on ${formatPublishDate(link.expiresAt, i18n.locale)}.`]),
    ]
    return lines.join("\n")
  }, [i18n.locale, link.accessCode, link.expiresAt, link.title, link.url, t])
}
