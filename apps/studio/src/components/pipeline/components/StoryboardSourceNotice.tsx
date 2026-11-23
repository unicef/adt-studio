import { Trans } from "@lingui/react/macro"

/** Warning-only: keep the editor/preview and any local draft mounted. */
export function StoryboardSourceNotice() {
  return <div role="status" className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
    <Trans>Source content changed after some Storyboard output was saved. The saved output remains available.</Trans>
  </div>
}
