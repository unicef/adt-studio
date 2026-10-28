import { Trans } from "@lingui/react/macro"
import { ArrowRight } from "lucide-react"
import type { PageDetail } from "@/api/client"

const CHIP = "inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-2.5 text-[12px]"

export function hasFontInfo(page: PageDetail): boolean {
  return (page.fonts?.length ?? 0) > 0 || !!page.fontProfile?.category
}

export function PageFontList({
  page,
  reflowableFont,
  offset = 0,
  limit,
}: {
  page: PageDetail
  reflowableFont: { family: string } | null
  offset?: number
  limit?: number
}) {
  const fonts = page.fonts ?? []
  if (fonts.length > 0)
    return (
      <div className="flex flex-wrap gap-1.5">
        {fonts.slice(offset, limit != null ? offset + limit : undefined).map((font) => (
          <span key={font.family} className={CHIP} title={font.family}>
            <span className="font-medium text-foreground">{font.family}</span>
            {font.sizes.length > 0 && (
              <span className="text-[11px] tabular-nums text-muted-foreground">{font.sizes.map((size) => `${size}px`).join(", ")}</span>
            )}
          </span>
        ))}
      </div>
    )
  if (!page.fontProfile?.category || offset > 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={CHIP}>
        <span className="font-medium text-foreground">{page.fontProfile.category === "sans" ? <Trans>Sans-serif</Trans> : <Trans>Serif</Trans>}</span>
      </span>
      {reflowableFont && (
        <>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <span className={CHIP} title={reflowableFont.family}>
            <span className="font-medium text-foreground">{reflowableFont.family}</span>
          </span>
        </>
      )}
    </div>
  )
}
