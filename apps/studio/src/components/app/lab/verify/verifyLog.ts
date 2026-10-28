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

export const VERIFY_LOG: Record<string, LogEntry> = {
  "extract:page-ask": { status: "pinned", text: msg`Being reworked in another PR.` },
}

export type TestingTarget = { kind: "grid" } | { kind: "page"; pageId: string; book?: string } | { kind: "state"; stateId: string; theme?: "dark" }

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
  sectioning: [
    {
      id: "sectlanding",
      variants: ["sectlanding"],
      text: msg`Not run: Extract's docked panel next to the extracted pages (switch Sectioning Mode and watch the badges change) or next to the PDF wall.`,
      links: [
        { label: msg`Not run`, target: { kind: "state", stateId: "notrun" } },
        { label: msg`Extract hasn't run`, target: { kind: "state", stateId: "prereq-extract" } },
        { label: msg`Not run · dark`, target: { kind: "state", stateId: "notrun", theme: "dark" } },
      ],
    },
    {
      id: "sectrunning",
      variants: ["sectrunning"],
      text: msg`Running: straight to the page grid with Extract's slim strip; pages wait in grey until they get sections.`,
      links: [
        { label: msg`Starting · 0 of 21`, target: { kind: "state", stateId: "starting" } },
        { label: msg`10 of 21`, target: { kind: "state", stateId: "setup" } },
        { label: msg`Extract still running`, target: { kind: "state", stateId: "extract-feeding" } },
        { label: msg`Just finished`, target: { kind: "state", stateId: "finished" } },
      ],
    },
    {
      id: "sectnotes",
      variants: ["sectnotes"],
      text: msg`Notes strip: dropped sections, pages read from images, pages with no sections and skipped pages, each only when it applies.`,
      links: [
        { label: msg`Sections dropped`, target: { kind: "state", stateId: "dropped" } },
        { label: msg`Scanned pages`, target: { kind: "state", stateId: "scanned" } },
        { label: msg`Pages skipped`, target: { kind: "state", stateId: "skipped" } },
      ],
    },
    {
      id: "sectresume",
      variants: ["sectresume"],
      text: msg`Interrupted: the same Resume strip as Extract.`,
      links: [{ label: msg`Interrupted`, target: { kind: "state", stateId: "interrupted" } }],
    },
    {
      id: "secthead",
      variants: ["secthead"],
      text: msg`Header: Extract's Book info and Source PDF button cards next to the title.`,
      links: [{ label: msg`Has results`, target: { kind: "state", stateId: "done" } }],
    },
    {
      id: "sectrail",
      variants: ["sectrail"],
      text: msg`Pages list heading: "Pages" like Extract instead of "Sections by page"; the counts still show sections. The list shows once a page is open.`,
      links: [
        { label: msg`Open pages 8–9`, target: { kind: "page", pageId: "pg008009" } },
        { label: msg`Page errors`, target: { kind: "state", stateId: "page-errors" } },
      ],
    },
  ],
}
