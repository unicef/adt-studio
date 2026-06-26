import { useMemo, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Settings2, TriangleAlert } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { bookFontFamilyChain, googleFontsCss2Url } from "@adt/types"
import { getBookFontFileUrl, type BookFontWithStatus } from "@/api/client"
import { toast } from "@/components/ui/sonner"
import { useAddGoogleFont, useBookFonts } from "@/hooks/use-book-fonts"
import { StyleLabel } from "../controls/StyleLabel"
import { useElementContext } from "../element-context"
import { GoogleFontPickerDialog } from "../../../GoogleFontPickerDialog"
import { POPULAR_GOOGLE_FONTS } from "../../../popular-google-fonts"
import { FontFamilyCombobox } from "./FontFamilyCombobox"

function isRestricted(font: BookFontWithStatus): boolean {
  return !!(font.license?.embeddingRestricted || font.license?.openSource === false)
}

/** Loads attached fonts' `@font-face` into the app document so the picker can
 *  render every option in its own face. Once the picker has been opened, also
 *  pulls the curated Google subset via a single combined stylesheet so those
 *  rows preview correctly without fetching webfonts no one looks at. */
function FontPreviewAssets({
  label,
  fonts,
  includePopular,
}: {
  label: string
  fonts: BookFontWithStatus[]
  includePopular: boolean
}) {
  /* eslint-disable lingui/no-unlocalized-strings -- CSS, not user-visible text */
  const css = useMemo(
    () =>
      fonts
        .filter((f) => f.cached)
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
  const googleUrl = googleFontsCss2Url([
    ...fonts.filter((f) => f.source === "google").map((f) => f.family),
    ...(includePopular ? POPULAR_GOOGLE_FONTS : []),
  ])
  return (
    <>
      {googleUrl ? <link rel="stylesheet" href={googleUrl} /> : null}
      {css ? <style>{css}</style> : null}
    </>
  )
}

/** Per-element font picker for the Typography section. Applies the chosen font
 *  as an inline `font-family` on the element (an explicit declaration that wins
 *  over the book's body-font rule and needs no Tailwind rebuild). "Default"
 *  removes the inline font so the element falls back to the body font. Lists
 *  the book's attached fonts plus a curated Google set in a searchable popover,
 *  with a footer entry that opens the full Google catalog. */
export function FontFamilyControl({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { dataId, computedStyles, onStyleChange } = useElementContext()
  const inlineFamily = computedStyles?.inlineFontFamily ?? null
  const inheritedFamily = computedStyles?.fontFamily ?? null
  const { data } = useBookFonts(bookLabel)
  const addGoogleFont = useAddGoogleFont(bookLabel)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [previewsLoaded, setPreviewsLoaded] = useState(false)

  const fonts = data?.fonts ?? []
  const selected = fonts.find((f) => f.family === inlineFamily) ?? null

  const setFontFamily = (chain: string) => onStyleChange?.(dataId, "font-family", chain)

  const handleSelectFont = (id: string) => {
    if (!id) {
      setFontFamily("")
      return
    }
    const font = fonts.find((f) => f.id === id)
    if (font) setFontFamily(bookFontFamilyChain(font))
  }

  const handleSelectGoogle = (family: string) => {
    setFontFamily(bookFontFamilyChain({ family }))
    addGoogleFont.mutate(family, {
      onSuccess: () => toast.success(t`Google font added.`),
    })
  }

  return (
    <>
      <FontPreviewAssets label={bookLabel} fonts={fonts} includePopular={previewsLoaded} />
      <StyleLabel label={<Trans>Font</Trans>} inherited={!inlineFamily && !!inheritedFamily}>
        <FontFamilyCombobox
          value={selected?.id ?? ""}
          fonts={fonts}
          pendingFamily={addGoogleFont.isPending ? (addGoogleFont.variables ?? null) : null}
          onSelectFont={handleSelectFont}
          onSelectGoogle={handleSelectGoogle}
          onBrowse={() => setPickerOpen(true)}
          onOpenChange={(open) => {
            if (open) setPreviewsLoaded(true)
          }}
        />
      </StyleLabel>
      <Link
        to="/books/$label/$step/settings"
        params={{ label: bookLabel, step: "storyboard" }}
        search={{ tab: "fonts" }}
        className="flex items-center gap-1 pl-[5.5rem] text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Settings2 className="h-3 w-3 shrink-0" aria-hidden="true" />
        <Trans>Set fonts for the whole book</Trans>
      </Link>
      {selected && isRestricted(selected) ? (
        <p className="flex items-start gap-1.5 pl-[5.5rem] text-[11px] text-destructive" role="alert">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <Trans>
              This font's license restricts embedding — distributing it inside the book bundle may
              be illegal.
            </Trans>
          </span>
        </p>
      ) : null}
      <GoogleFontPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        existingFamilies={
          new Set(fonts.filter((f) => f.source === "google").map((f) => f.family))
        }
        pendingFamily={addGoogleFont.isPending ? (addGoogleFont.variables ?? null) : null}
        onSelect={handleSelectGoogle}
      />
    </>
  )
}
