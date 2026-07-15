import { Type } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { BookCurrentFont } from "@/api/client"
import { useLingui } from "@lingui/react/macro"
import { Trans } from "@lingui/react/macro"
import { previewFamily } from "./font-utils"

export function CurrentFontCard({ current }: { current: BookCurrentFont }) {
  const { t } = useLingui()
  if (current.fixedLayout) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Type className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h4 className="text-sm font-medium">{t`Current book font`}</h4>
          <Badge variant="secondary">{t`Fixed layout`}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          <Trans>
            This book renders fixed-layout, so it keeps the original PDF fonts. Attached fonts
            still guide the AI for activities and generated pages.
          </Trans>
        </p>
      </div>
    )
  }

  const detectedLabel =
    current.detectedCategory === "serif"
      ? t`serif`
      : current.detectedCategory === "sans"
        ? t`sans serif`
        : null

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Type className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h4 className="text-sm font-medium">{t`Current book font`}</h4>
        {current.bodyRole ? (
          <Badge variant="secondary">{t`From attached fonts · Body text`}</Badge>
        ) : current.setting === "auto" ? (
          <Badge variant="secondary">
            {detectedLabel
              ? t`Auto-detected · ${detectedLabel}`
              : t`Default (no text detected yet)`}
          </Badge>
        ) : (
          <Badge variant="secondary">{t`Set manually`}</Badge>
        )}
      </div>
      <p
        className="text-2xl leading-snug truncate"
        style={{ fontFamily: previewFamily(current.font.family, current.font.category) }}
        title={current.font.family}
      >
        {current.font.family}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {current.bodyRole ? (
          <Trans>
            Body text uses this attached font. Change the “Used for” role below to switch back to
            the default.
          </Trans>
        ) : (
          <Trans>
            Body text uses this font today. Attach a font below and assign it the “Body text” role
            to replace it in generated pages.
          </Trans>
        )}
      </p>
    </div>
  )
}
