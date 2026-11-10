import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"

export type ReasonKind =
  | "page-elements"
  | "not-meaningful"
  | "duplicate"
  | "too-small"
  | "too-large"
  | "blank"
  | "segmented"
  | "cropped"
  | "manual"
  | "full-page"
  | "guard-kept"
  | "other"

export interface HumanReason {
  kind: ReasonKind
  label: MessageDescriptor | string
  explain: MessageDescriptor | null
  detail: string | null
  raw: string | null
}

export const REASON_ORDER: readonly ReasonKind[] = [
  "page-elements",
  "not-meaningful",
  "duplicate",
  "too-small",
  "too-large",
  "blank",
  "manual",
  "segmented",
  "cropped",
  "full-page",
  "other",
]

const TOO_SMALL = /shortest side (\d+)px < min_side (\d+)px/i
const TOO_LARGE = /longest side (\d+)px > max_side (\d+)px/i
const BLANK = /stddev [\d.]+ < min_stddev/i
const NOT_MEANINGFUL = /^not meaningful:\s*(.+)$/is
const FIGURE_FILTER = /^auto figure filter:?\s*(.*)$/is
const DUPLICATE = /^duplicate artwork:\s*kept composite\s+(\S+)/i
const GUARD_KEPT = /^auto guard kept:\s*(.+)$/is
const GUARD_LLM = /\(LLM:\s*(.+)\)\s*$/is

function reason(kind: ReasonKind, raw: string, label: MessageDescriptor | string, explain: MessageDescriptor | null, detail: string | null = null): HumanReason {
  return { kind, label, explain, detail: detail?.trim() || null, raw }
}

export function humanReason(input: string | null | undefined): HumanReason {
  const raw = input?.trim() || null
  if (!raw) return { kind: "other", label: msg`Filtered out`, explain: null, detail: null, raw }
  const figure = FIGURE_FILTER.exec(raw)
  if (figure) {
    return reason(
      "page-elements",
      raw,
      msg`Will be rebuilt as page elements`,
      msg`Sectioning recreates it as HTML (a table, a callout or a heading) instead of keeping the picture. Keep it as an image if the picture itself matters.`,
      figure[1],
    )
  }
  const meaningless = NOT_MEANINGFUL.exec(raw)
  if (meaningless) return reason("not-meaningful", raw, msg`Not a meaningful image`, msg`The AI judged it decorative or not needed to understand the page.`, meaningless[1])
  const duplicate = DUPLICATE.exec(raw)
  if (duplicate) return reason("duplicate", raw, msg`A copy of a kept figure`, msg`The same artwork is kept inside a combined figure, so this separate copy isn't used.`)
  const small = TOO_SMALL.exec(raw)
  if (small) return reason("too-small", raw, msg`Too small (${small[1]}px, needs ${small[2]}px)`, msg`Images this small are usually lines, dots or bits of decoration.`)
  const large = TOO_LARGE.exec(raw)
  if (large) return reason("too-large", raw, msg`Too large (${large[1]}px, limit ${large[2]}px)`, msg`Images this big are usually page backgrounds or whole-page scans.`)
  if (BLANK.test(raw)) return reason("blank", raw, msg`Blank or a single colour`, msg`It has almost no detail, like a background fill or an empty box.`)
  if (/^segmented$/i.test(raw)) return reason("segmented", raw, msg`Split into parts`, msg`It was replaced by the parts cut out of it. The parts are kept.`)
  if (/^cropped$/i.test(raw)) return reason("cropped", raw, msg`Replaced by its crop`, msg`A cropped version of this image is used instead.`)
  if (/^manual$/i.test(raw)) return reason("manual", raw, msg`Removed by you`, msg`You filtered it out.`)
  if (/full-page render/i.test(raw)) return reason("full-page", raw, msg`A picture of the whole page`, msg`The whole page was captured as one picture. Its own images and text are used instead.`)
  const guard = GUARD_KEPT.exec(raw)
  if (guard) {
    return reason(
      "guard-kept",
      raw,
      msg`Kept by a safety check`,
      msg`The AI wanted to remove it, but it is artwork that would otherwise be lost, so it was kept.`,
      GUARD_LLM.exec(guard[1])?.[1] ?? guard[1],
    )
  }
  return { kind: "other", label: raw, explain: null, detail: null, raw }
}

export function isPageElements(input: string | null | undefined): boolean {
  return humanReason(input).kind === "page-elements"
}
