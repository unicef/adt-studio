/**
 * Applies the kid's reading-comfort preferences (text zoom + font) to the
 * book content while Kids Mode is active.
 *
 * Everything is driven through a single managed <style> tag rather than inline
 * styles so it can override the book's own per-element font rules (which set
 * their own `font-family`, so a plain style on `#content` alone wouldn't
 * cascade) and so cleanup is a single element removal. Only `#content` — the
 * book content container — is touched; the chrome is never affected.
 */
import { useAtomValue } from "jotai"
import { useLayoutEffect } from "react"
import {
  kidsReadingFontAtom,
  kidsTextScaleAtom,
  type KidsReadingFont,
  type KidsTextScale,
} from "@/features/kids/state/kids.atoms"

const STYLE_TAG_ID = "kids-reading-comfort"

const PLAIN_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'

function fontRules(font: KidsReadingFont): string {
  if (font === "plain") {
    return `#content, #content * { font-family: ${PLAIN_FONT_STACK} !important; }`
  }
  if (font === "spaced") {
    return (
      `#content, #content * { font-family: ${PLAIN_FONT_STACK} !important; ` +
      "letter-spacing: 0.06em !important; word-spacing: 0.16em !important; " +
      "line-height: 1.8 !important; }"
    )
  }
  return ""
}

function buildCss(scale: KidsTextScale, font: KidsReadingFont): string {
  const rules: string[] = []
  if (scale !== "1") rules.push(`#content { zoom: ${scale}; }`)
  const font_ = fontRules(font)
  if (font_) rules.push(font_)
  return rules.join("\n")
}

function applyCss(css: string): void {
  if (typeof document === "undefined") return
  const existing = document.getElementById(STYLE_TAG_ID)
  if (!css) {
    existing?.remove()
    return
  }
  const tag =
    (existing as HTMLStyleElement | null) ??
    document.head.appendChild(
      Object.assign(document.createElement("style"), { id: STYLE_TAG_ID }),
    )
  tag.textContent = css
}

export function useKidsReadingComfort(active: boolean): void {
  const scale = useAtomValue(kidsTextScaleAtom) as KidsTextScale
  const font = useAtomValue(kidsReadingFontAtom) as KidsReadingFont

  useLayoutEffect(() => {
    if (!active) {
      applyCss("")
      return
    }
    applyCss(buildCss(scale, font))
    return () => applyCss("")
  }, [active, scale, font])
}
