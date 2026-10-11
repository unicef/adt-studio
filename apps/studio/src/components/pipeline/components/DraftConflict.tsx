import { Trans } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"

export function DraftConflict({ error, paths, onResolve }: { error: string | null; paths?: string[]; onResolve: (choice: "draft" | "latest") => void }) {
  if (!error) return null
  return <div role="alert" className="m-3 space-y-2 rounded border border-amber-400 bg-amber-50 p-3 text-sm">
    <p>{error}</p>
    <p><Trans>Your draft is retained. Review the refreshed content before saving again.</Trans></p>
    {paths?.length ? <>
      <p><Trans>Conflicting fields:</Trans> {paths.join(", ")}</p>
      <Button variant="outline" onClick={() => onResolve("draft")}><Trans>Keep my conflicting edits</Trans></Button>
      <Button variant="outline" onClick={() => onResolve("latest")}><Trans>Use latest conflicting values</Trans></Button>
    </> : null}
  </div>
}
