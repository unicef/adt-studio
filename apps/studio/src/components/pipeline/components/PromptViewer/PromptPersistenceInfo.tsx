import { Trans } from "@lingui/react/macro"
import type { PromptResponse } from "@/api/client"
import { Button } from "@/components/ui/button"

export function PromptPersistenceInfo({ prompt, dirty, conflict, onReload, onKeepDraft }: {
  prompt?: PromptResponse
  dirty: boolean
  conflict?: boolean
  onReload?: () => void
  onKeepDraft?: () => void
}) {
  if (!prompt) return null
  return <div className="space-y-2 border-b bg-muted/20 px-3 py-2 text-xs">
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      <span><Trans>Using:</Trans> {prompt.source === "book" ? <Trans>This book</Trans> : prompt.source === "global" ? <Trans>Global overrides</Trans> : <Trans>Bundled default</Trans>} · <code>{prompt.resolvedName}</code></span>
      <span><Trans>Save to:</Trans> {prompt.persistence.saveTarget === "book" ? <Trans>This book</Trans> : <Trans>Global overrides</Trans>} · <code>{prompt.persistence.logicalPath}</code></span>
      {dirty && <strong><Trans>Unsaved changes</Trans></strong>}
    </div>
    {(prompt.requestedModelId ?? prompt.modelId) == null && <p><Trans>Model-specific prompts take precedence over this generic prompt.</Trans></p>}
    <p><Trans>Saving does not regenerate content. Affected outputs need regeneration.</Trans></p>
    {conflict && <div role="alert" className="space-y-2 rounded border border-amber-400 p-2">
      <p><Trans>This prompt changed after you loaded it. Your draft was not overwritten.</Trans></p>
      <details><summary><Trans>Review latest saved prompt</Trans></summary><pre className="max-h-40 overflow-auto whitespace-pre-wrap">{prompt.content}</pre></details>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onReload}><Trans>Reload latest</Trans></Button>
        <Button size="sm" variant="outline" onClick={onKeepDraft}><Trans>Keep my draft against this revision</Trans></Button>
      </div>
    </div>}
  </div>
}
