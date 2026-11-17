import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { ReaderColorToken } from "@adt/types"

export interface TokenGroup {
  id: string
  label: MessageDescriptor
  /** Token pairs: a surface and the text drawn on it. */
  tokens: ReaderColorToken[]
}

/** How the colour editor groups the shadcn tokens. The first group is the
 *  one that changes the reader the most, so the compact editors show it alone. */
export const READER_TOKEN_GROUPS: TokenGroup[] = [
  { id: "brand", label: msg`Brand`, tokens: ["primary", "primary-foreground", "accent", "accent-foreground"] },
  { id: "surface", label: msg`Dock and panels`, tokens: ["popover", "popover-foreground", "foreground", "background"] },
  { id: "neutral", label: msg`Neutral`, tokens: ["secondary", "secondary-foreground", "muted", "muted-foreground", "card", "card-foreground"] },
  { id: "lines", label: msg`Lines and focus`, tokens: ["border", "input", "ring", "destructive"] },
]

export const READER_TOKEN_LABELS: Record<ReaderColorToken, MessageDescriptor> = {
  background: msg`Background`,
  foreground: msg`Text`,
  card: msg`Card`,
  "card-foreground": msg`Card text`,
  popover: msg`Dock and panel surface`,
  "popover-foreground": msg`Dock and panel text`,
  primary: msg`Primary`,
  "primary-foreground": msg`Text on primary`,
  secondary: msg`Secondary`,
  "secondary-foreground": msg`Text on secondary`,
  muted: msg`Muted`,
  "muted-foreground": msg`Muted text`,
  accent: msg`Highlight (hover, active)`,
  "accent-foreground": msg`Text on highlight`,
  destructive: msg`Error`,
  border: msg`Border`,
  input: msg`Input border`,
  ring: msg`Focus ring`,
}

/** Foreground/background pairs worth a contrast warning. */
export const READER_CONTRAST_PAIRS: Array<[ReaderColorToken, ReaderColorToken]> = [
  ["primary-foreground", "primary"],
  ["accent-foreground", "accent"],
  ["popover-foreground", "popover"],
  ["foreground", "popover"],
  ["secondary-foreground", "secondary"],
  ["muted-foreground", "popover"],
]
