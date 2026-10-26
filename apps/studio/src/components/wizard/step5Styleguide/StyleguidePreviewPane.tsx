import { msg } from "@lingui/core/macro"
import { Trans, useLingui } from "@lingui/react/macro"
import { Palette } from "lucide-react"
import { useStyleguidePreview } from "@/hooks/use-presets"
import { PreviewShell } from "@/components/wizard/shared/PreviewShell"

const PREVIEW_HEADER = msg`Style guide`
const IFRAME_TITLE = msg`Styleguide Preview`

function IdleIllustration() {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-6 px-6 py-8">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-border bg-card text-muted-foreground">
        <Palette className="h-7 w-7" />
      </div>
      <div className="max-w-[280px] text-center">
        <p className="text-base font-semibold text-foreground">
          <Trans>Style Guide</Trans>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          <Trans>
            Select a style guide to preview how it styles the generated pages - typography, colors, and
            component layout.
          </Trans>
        </p>
      </div>
    </div>
  )
}

export function StyleguidePreviewPane({
  styleguide,
}: {
  styleguide: string
}) {
  const { i18n } = useLingui()
  const { data: previewData, isLoading } = useStyleguidePreview(
    styleguide || null,
  )
  const label = styleguide || i18n._(PREVIEW_HEADER)

  if (!styleguide) {
    return (
      <PreviewShell label={label}>
        <IdleIllustration />
      </PreviewShell>
    )
  }

  return (
    <PreviewShell label={label}>
      {isLoading ? (
        <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-muted-foreground">
          <Trans>Loading preview...</Trans>
        </div>
      ) : (
        <iframe
          srcDoc={previewData?.html ?? ""}
          className="h-full w-full border-0"
          sandbox="allow-scripts"
          title={i18n._(IFRAME_TITLE)}
        />
      )}
    </PreviewShell>
  )
}
