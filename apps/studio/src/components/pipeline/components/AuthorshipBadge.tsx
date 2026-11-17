import { Trans } from "@lingui/react/macro"

export function AuthorshipBadge({ source }: { source?: "ai" | "manual" }) {
  if (source === "ai") return null
  return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
    {source === "manual" ? <Trans>Edited manually</Trans> : <Trans>Legacy · protected</Trans>}
  </span>
}
