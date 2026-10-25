import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"

export type PlanStatus = "done" | "now" | "next" | "later" | "paused"

export interface PlanItem {
  id: string
  label: MessageDescriptor
  status: PlanStatus
  detail?: MessageDescriptor
}

export interface PlanSection {
  id: string
  title: MessageDescriptor
  hint?: MessageDescriptor
  items: PlanItem[]
}

export const PLAN_UPDATED = "2026-10-23"

export const PLAN: PlanSection[] = [
  {
    id: "built",
    title: msg`Built so far`,
    items: [
      { id: "dock", status: "done", label: msg`Dock: Storyboard first, every step as a tile, hover cards, setup merge`, detail: msg`Storyboard focus variants (Two tiles, Islands, Base, Tray) kept for the team to pick.` },
      { id: "pages", status: "done", label: msg`Left sidebar: Pages with the Go to page field` },
      { id: "layers", status: "done", label: msg`Left sidebar: Layers mockup with the + drawer` },
      { id: "topbar", status: "done", label: msg`Top bar (other chat)` },
      { id: "lab", status: "done", label: msg`Lab: States, Checklist and Verification mode, Plan menu, cleanup` },
    ],
  },
  {
    id: "states",
    title: msg`States review, stage by stage`,
    hint: msg`UI only: log fixes for after the develop merge, collect shared polish.`,
    items: [
      { id: "extract", status: "now", label: msg`Extract`, detail: msg`Verifying together in Verification mode (23 states). First pass notes in states-review/extract.md.` },
      { id: "sectioning", status: "next", label: msg`Sectioning`, detail: msg`First pass done (11 states, states-review/sectioning.md); verify together next.` },
      { id: "storyboard", status: "next", label: msg`Storyboard` },
      { id: "captions", status: "next", label: msg`Image descriptions` },
      { id: "toc", status: "next", label: msg`Table of contents`, detail: msg`Needs its states defined first.` },
      { id: "easy-read", status: "next", label: msg`Easy Read`, detail: msg`Needs its states defined first.` },
      { id: "sign-language", status: "next", label: msg`Sign language`, detail: msg`Needs its states defined first.` },
      { id: "quizzes", status: "next", label: msg`Quizzes` },
      { id: "glossary", status: "next", label: msg`Glossary`, detail: msg`Needs its states defined first.` },
      { id: "translate", status: "next", label: msg`Languages`, detail: msg`Needs its states defined first.` },
      { id: "speech", status: "next", label: msg`Read aloud`, detail: msg`Needs its states defined first.` },
      { id: "validation", status: "next", label: msg`Validation` },
      { id: "preview", status: "next", label: msg`Preview` },
      { id: "export", status: "next", label: msg`Export` },
    ],
  },
  {
    id: "extract-work",
    title: msg`Extract: from your verification`,
    hint: msg`9 of 23 states need work. Most of these are shared by every stage.`,
    items: [
      { id: "skeleton", status: "done", label: msg`Loading skeleton matches the real screen (no sidebar)` },
      { id: "spreads-accent", status: "done", label: msg`Spreads modal uses the Extract colour, detected spreads too` },
      { id: "banners", status: "now", label: msg`Banner redesign: Compact chosen, pick a compact layout and a tone`, detail: msg`Folded errors decided. Variants: Banner layout × Banner tone.` },
      { id: "loaders", status: "done", label: msg`Run start: straight to the grid (decided)` },
      { id: "finished-pill", status: "done", label: msg`Run finish: no extra signal (decided)` },
      { id: "notrun-art", status: "done", label: msg`Not run: Book first (decided)`, detail: msg`Range requests for the PDF are pinned for after the develop merge.` },
      { id: "header-buttons", status: "now", label: msg`Header buttons: card styles that read as buttons`, detail: msg`Variants: Cards, Button cards, Grouped, Detailed.` },
      { id: "page-ask-pr", status: "paused", label: msg`A page failed (asks): reworked in another PR` },
    ],
  },
  {
    id: "later",
    title: msg`Pinned for later`,
    items: [
      { id: "resolution", status: "paused", label: msg`Adapt to screen sizes (1280 to 2560, the 2K monitor)`, detail: msg`Audit the main screens at four widths, then fix the shared layout.` },
      { id: "human", status: "later", label: msg`Right sidebar: Human panel` },
      { id: "agent", status: "later", label: msg`Right sidebar: Agent panel` },
      { id: "tts", status: "later", label: msg`No TTS, glossary or interactive playback on the storyboard` },
      { id: "loader", status: "later", label: msg`Loader redesign (boot and content skeletons)` },
      { id: "tour", status: "later", label: msg`Guided tour with react-joyride for the team`, detail: msg`Review mode code is archived for reuse.` },
    ],
  },
  {
    id: "polish",
    title: msg`Shared polish to batch`,
    hint: msg`Build one set of variants on the shared step parts, apply everywhere.`,
    items: [
      { id: "banner-actions", status: "later", label: msg`Banner main actions look like plain buttons (Resume, Try again)` },
      { id: "stacked", status: "later", label: msg`Error banner stacked on the Next card` },
      { id: "dock-loading", status: "later", label: msg`Dock loses tiles while content loads` },
    ],
  },
  {
    id: "fixes",
    title: msg`Fixes after merging develop`,
    items: [
      { id: "page-ask", status: "later", label: msg`Page failed dialog: Skip as the main action, show "Page 4"` },
      { id: "pdf-error", status: "later", label: msg`PDF can't be read: hide the re-run warning, one main action` },
      { id: "no-spreads", status: "later", label: msg`"No spreads found" looks like "Ready for Sectioning"` },
    ],
  },
  {
    id: "questions",
    title: msg`Open questions`,
    items: [
      { id: "rerun", status: "later", label: msg`Setup re-run on a finished book: what should Storyboard do in the dock?` },
      { id: "finished", status: "later", label: msg`Extract has no "just finished" moment. OK?` },
      { id: "ai-line", status: "later", label: msg`"Set up AI access" lines in error states: check with a key` },
    ],
  },
  {
    id: "last",
    title: msg`Last`,
    items: [
      { id: "cleanup", status: "later", label: msg`Code cleanup, React Doctor and React Scan passes with refactor` },
      { id: "i18n", status: "later", label: msg`Extract and translate strings before merging` },
    ],
  },
]
