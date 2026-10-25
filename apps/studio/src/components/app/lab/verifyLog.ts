import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { VariantKey } from "./variants"

export type LogStatus = "fixed" | "review" | "pending" | "pinned"

export interface LogEntry {
  status: LogStatus
  group?: MessageDescriptor
  text: MessageDescriptor
  round?: number
  variants?: VariantKey[]
}

const BANNERS = msg`Banner redesign`
const LOADERS = msg`Loading path`
const POLISH = msg`Visual polish`

export const VERIFY_LOG: Record<string, LogEntry> = {
  "extract:notrun": { status: "fixed", group: POLISH, round: 7, text: msg`Docked panel is standard: a full-height side panel flush with the left edge, settings as flat sections. Page numbers stay as pills. The page wall scrolls, follows Page range and Spread live, and loads its pages from the server.` },
  "extract:opening": { status: "fixed", group: LOADERS, round: 3, text: msg`One skeleton from boot to content. The boot screen and the step loader now draw the same component, with the same panel, grid and cards, and the page shape is remembered per book. Only the top bar and dock change when the app arrives.` },
  "extract:loading": { status: "fixed", group: LOADERS, round: 3, text: msg`Same skeleton as "Opening the book": the title row with its buttons and the card footers now match the real page cards.` },
  "extract:start": { status: "fixed", group: POLISH, round: 3, text: msg`Button cards are standard now: raised buttons that lift on hover, each with a tinted icon tile (Book info has one too). No page count, so nothing clashes with the page total in the title.` },
  "extract:step-error": { status: "fixed", group: BANNERS, round: 3, text: msg`Strip is standard for every banner. Warnings take the stage colour (Extract blue): border, icon and button. Shared by every stage.` },
  "extract:key-error": { status: "fixed", group: BANNERS, round: 3, text: msg`Strip is standard. Errors stay red: red border, icon and button.` },
  "extract:page-errors": { status: "fixed", round: 3, text: msg`Folded is standard now, so the banner switches don't apply here. The line has a white alert icon and got back its Try again button.` },
  "extract:page-ask": { status: "pinned", text: msg`Being reworked in another PR.` },
}
