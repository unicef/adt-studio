import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"

export interface HumanReason {
  label: MessageDescriptor | string
  detail: string | null
  raw: string | null
}

const TOO_SMALL = /shortest side (\d+)px < min_side (\d+)px/i
const BLANK = /stddev [\d.]+ < min_stddev/i
const NOT_MEANINGFUL = /^not meaningful:\s*(.+)$/is

export function humanReason(reason: string | null | undefined): HumanReason {
  const raw = reason?.trim() || null
  if (!raw) return { label: msg`Filtered out`, detail: null, raw }
  const small = TOO_SMALL.exec(raw)
  if (small) return { label: msg`Too small (${small[1]}px, needs ${small[2]}px)`, detail: null, raw }
  if (BLANK.test(raw)) return { label: msg`Blank or a single colour`, detail: null, raw }
  if (/full-page render/i.test(raw)) return { label: msg`A picture of the whole page`, detail: null, raw }
  if (raw === "manual") return { label: msg`Removed by you`, detail: null, raw }
  const meaningless = NOT_MEANINGFUL.exec(raw)
  if (meaningless) return { label: msg`Not a meaningful image`, detail: meaningless[1].trim(), raw }
  return { label: raw, detail: null, raw }
}
