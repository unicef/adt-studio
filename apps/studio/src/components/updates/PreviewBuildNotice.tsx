import { Trans } from "@lingui/react/macro"
import type { PreviewBuildStatus } from "@/hooks/use-preview-build"
import { AmbientCard, GlassButton, PrimaryButton } from "./AmbientCard"
import { openPullRequest, previewBuildMessage } from "./preview-build-message"

export function PreviewBuildNotice({
  status,
  onOpenVersions,
  onDismiss,
}: {
  status: PreviewBuildStatus
  onOpenVersions: () => void
  onDismiss: () => void
}) {
  const { icon: Icon, title, body } = previewBuildMessage(status)
  const skin = status.state === "closed" ? "previewClosed" : "preview"

  return (
    <AmbientCard
      skin={skin}
      subtitleLines={2}
      icon={<Icon className="size-6" />}
      eyebrow={<Trans>Preview build</Trans>}
      title={title}
      subtitle={body}
      onDismiss={onDismiss}
      actions={
        <>
          <GlassButton onClick={() => openPullRequest(status)}>
            <Trans>View PR</Trans>
          </GlassButton>
          <PrimaryButton onClick={onOpenVersions} skin={skin}>
            <Trans>Open Versions</Trans>
          </PrimaryButton>
        </>
      }
    />
  )
}
