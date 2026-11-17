import {
  DEFAULT_READER_LAYOUT,
  READER_COLOR_TOKENS,
  type ReaderColorTokens,
  type ReaderUi,
  type ReaderUiLayout,
} from "@adt/types"

/**
 * Drop unset fields and empty groups, and put every key in one canonical order
 * (the schema's). The API validates `reader_ui` with zod, which returns keys in
 * schema order, so a draft compared by insertion order would never equal what
 * was just saved — and would stay "unsaved" forever.
 */
export function normalizeReaderUi(ui: ReaderUi): ReaderUi {
  const out: ReaderUi = {}
  const layout: ReaderUiLayout = {}
  for (const key of Object.keys(DEFAULT_READER_LAYOUT) as Array<keyof ReaderUiLayout>) {
    const value = ui.layout?.[key]
    if (value !== undefined) (layout as Record<string, unknown>)[key] = value
  }
  if (Object.keys(layout).length > 0) out.layout = layout
  for (const mode of ["light", "dark"] as const) {
    const tokens: ReaderColorTokens = {}
    for (const token of READER_COLOR_TOKENS) {
      const value = ui[mode]?.[token]
      if (typeof value === "string" && value.trim() !== "") tokens[token] = value.trim()
    }
    if (Object.keys(tokens).length > 0) out[mode] = tokens
  }
  if (typeof ui.radius === "number") out.radius = Math.round(ui.radius * 1000) / 1000
  if (ui.font && ui.font !== "default") out.font = ui.font
  return out
}

export function sameReaderUi(a: ReaderUi, b: ReaderUi): boolean {
  return JSON.stringify(normalizeReaderUi(a)) === JSON.stringify(normalizeReaderUi(b))
}
