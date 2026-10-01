import type { PageDetail } from "@/api/client"

export type RenderingData = NonNullable<PageDetail["rendering"]>

export type SectionDrafts = Readonly<Record<number, string>>

export const NO_DRAFTS: SectionDrafts = Object.freeze({})

export interface HtmlCodec {
  toCanvas: (html: string) => string
  fromCanvas: (html: string) => string
}

const IDENTITY_CODEC: HtmlCodec = {
  toCanvas: (html) => html,
  fromCanvas: (html) => html,
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const RELATIVE_API_SRC = /(?<=\bsrc=["'])\/api\//g

export function imageUrlCodec(baseUrl: string): HtmlCodec {
  if (!/^https?:\/\//.test(baseUrl)) return IDENTITY_CODEC
  const origin = new URL(baseUrl).origin
  const absoluteApiSrc = new RegExp(
    RELATIVE_API_SRC.source.replace(/\\\/api/, escapeRegExp(origin) + "/api"),
    "g",
  )
  return {
    toCanvas: (html) => html.replace(RELATIVE_API_SRC, origin + "/api/"),
    fromCanvas: (html) => html.replace(absoluteApiSrc, "/api/"),
  }
}

export function withDraft(
  drafts: SectionDrafts,
  sectionIndex: number,
  html: string,
  baseline: string,
): SectionDrafts {
  if (html === baseline) {
    if (!(sectionIndex in drafts)) return drafts
    return Object.fromEntries(
      Object.entries(drafts).filter(([key]) => Number(key) !== sectionIndex),
    )
  }
  if (drafts[sectionIndex] === html) return drafts
  return { ...drafts, [sectionIndex]: html }
}

export function hasDrafts(drafts: SectionDrafts): boolean {
  return Object.keys(drafts).length > 0
}

export function applyDrafts(
  rendering: RenderingData,
  drafts: SectionDrafts,
  codec: HtmlCodec,
): RenderingData {
  return {
    ...rendering,
    sections: rendering.sections.map((section) => {
      const draft = drafts[section.sectionIndex]
      return draft === undefined ? section : { ...section, html: codec.fromCanvas(draft) }
    }),
  }
}
