import { useMemo } from "react"
import { googleFontsCss2Url } from "@adt/types"
import { getBookFontFileUrl, type BookCurrentFont, type BookFontWithStatus } from "@/api/client"

export function FontPreviewStyles({ label, fonts }: { label: string; fonts: BookFontWithStatus[] }) {
  /* eslint-disable lingui/no-unlocalized-strings -- CSS, not user-visible text */
  const css = useMemo(
    () =>
      fonts
        .filter((f) => f.source === "upload")
        .flatMap((f) =>
          f.faces.map(
            (face) => `@font-face {
  font-family: ${JSON.stringify(f.family)};
  font-style: ${face.style};
  font-weight: ${face.weight};
  font-display: swap;
  src: url(${JSON.stringify(getBookFontFileUrl(label, f.id, face.file))});
  ${face.unicodeRange ? `unicode-range: ${face.unicodeRange};` : ""}
}`,
          ),
        )
        .join("\n"),
    [label, fonts],
  )
  /* eslint-enable lingui/no-unlocalized-strings */
  if (!css) return null
  return <style>{css}</style>
}

/** Loads the Google CDN stylesheet for every attached Google family so previews
 *  render regardless of local cache state. One `<link>` per family so one odd
 *  family can't fail the whole batch (a combined css2 request 400s entirely). */
export function GooglePreviewLink({
  current,
  fonts,
}: {
  current: BookCurrentFont | undefined
  fonts: BookFontWithStatus[]
}) {
  const families = new Set<string>()
  if (current && !current.fixedLayout && current.font.google) families.add(current.font.family)
  for (const f of fonts) {
    if (f.source === "google") families.add(f.family)
  }
  return (
    <>
      {[...families].map((family) => {
        const url = googleFontsCss2Url([family])
        return url ? <link key={family} rel="stylesheet" href={url} /> : null
      })}
    </>
  )
}
