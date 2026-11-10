import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { VariantKey } from "../variants"

export type LogStatus = "fixed" | "review" | "pending" | "pinned"

export interface LogEntry {
  status: LogStatus
  group?: MessageDescriptor
  text: MessageDescriptor
  round?: number
  variants?: VariantKey[]
}

const praticasBookId = "Pra-ticas-de-Alfabetizac-a-o-e-de-Matema-tica--Vol.-II"

export const VERIFY_LOG: Record<string, LogEntry> = {
  "extract:page-ask": { status: "pinned", text: msg`Being reworked in another PR.` },
}

export type TestingTarget = { kind: "grid"; book?: string } | { kind: "page"; pageId: string; book?: string; stateId?: string } | { kind: "state"; stateId: string; theme?: "dark" }

export interface TestingLink {
  label: MessageDescriptor
  target: TestingTarget
}

export interface TestingItem {
  id: string
  variants: VariantKey[]
  text: MessageDescriptor
  links: TestingLink[]
}

export const TESTING_NOW: Record<string, TestingItem[]> = {
  extract: [
    {
      id: "exbstate",
      variants: ["exbstate"],
      text: msg`Final Extract. The left-out banner before the AI, the AI second look (intro, running, in the background, finished), after the AI, answers in another language, part-way, all checked and nothing to check. Then open a page: Page details first with the nudge, Review shows only the left-out outlines. Buttons in simulated states never save.`,
      links: [
        { label: msg`Banner before the AI`, target: { kind: "state", stateId: "lo-banner" } },
        { label: msg`AI second look`, target: { kind: "state", stateId: "lo-ai-intro" } },
        { label: msg`After the AI`, target: { kind: "state", stateId: "lo-ai-done" } },
        { label: msg`Other language`, target: { kind: "state", stateId: "lo-ai-language" } },
        { label: msg`Dark`, target: { kind: "state", stateId: "lo-ai-done", theme: "dark" } },
      ],
    },
  ],
  captions: [
    {
      id: "caplanding",
      variants: ["caplanding"],
      text: msg`Not run: what sits next to the settings: a sample page, the book's own images, or its pages. Also check a book with no images.`,
      links: [
        { label: msg`Not run`, target: { kind: "state", stateId: "never" } },
        { label: msg`Book has no images`, target: { kind: "state", stateId: "no-images" } },
      ],
    },
    {
      id: "caprunning",
      variants: ["caprunning"],
      text: msg`Running with no descriptions yet: a progress panel, or the page grid filling in under a slim strip.`,
      links: [{ label: msg`Running · no results`, target: { kind: "state", stateId: "running-empty" } }],
    },
    {
      id: "capnext",
      variants: ["capnext"],
      text: msg`Top card when some pages failed: a quiet "almost ready" card or the bold Next card, each with the error folded in.`,
      links: [{ label: msg`Some pages failed`, target: { kind: "state", stateId: "page-errors" } }],
    },
    {
      id: "capview",
      variants: ["capview"],
      text: msg`The page grid with results: open a page to edit, one long editable list, or the grid with page 1's editor already open on the right.`,
      links: [{ label: msg`Page grid`, target: { kind: "state", stateId: "done" } }],
    },
    {
      id: "capsave",
      variants: ["capsave"],
      text: msg`Page 12: "Saves automatically" shows in the Images header when saving is instant. Edit a description to see the Saved tick and Undo, or the Save bar.`,
      links: [{ label: msg`Edit page 12`, target: { kind: "page", pageId: "pg012013", book: "lab-triste", stateId: "done" } }],
    },
  ],
}
