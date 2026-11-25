/* eslint-disable lingui/no-unlocalized-strings -- dev-only lab labels for ideas from the reference board */
import { createContext, useContext } from "react"

/**
 * The reference board's ideas (`.context/issue-333/refboard`) that Guided can play, one toolbar
 * control per group, each by its board id. "now" is the plain look (no idea). Only the lab sets
 * these; outside it every group is "now", and `GuidedIdeas` resolves "now" to Guided's own pick.
 */
export const IDEA_GROUPS = [
  { key: "expand", label: "Expand", options: [
    ["b10", "Height morph", "Each place keeps its spot; when its content changes only its height eases, and the new content swaps in with a blur. Click Change."],
  ] },
  { key: "loader", label: "Loader", options: [
    ["c12", "Scan line", "Three of your pages; a glowing line sweeps down each in turn and leaves a soft tint."],
    ["c13", "Shimmer + count", "The status line shimmers; the seconds so far tick up inside it, the page count under it."],
    ["c14", "Steps tick off", "Steps appear as they start: each spins, then pops a check and dims."],
    ["c15", "Skeleton → answer", "Grey lines and pages in the answer's shape, then the real setup and pages replace them in place."],
    ["c16", "Flipbook", "Your first five pages riffle over one by one in 3D, onto a dimmed left page."],
    ["c17", "Shape morph", "A brand-blue shape turns and morphs between blob, circle and squircle while it reads."],
  ] },
  { key: "question", label: "Question", options: [
    ["d18", "Live previews", "Light picture cards: each is a screen of the book you'd get, from your pages, with a plain line. The picked one lifts."],
    ["d21", "Smart default", "Only my guess shows, with its page, a pulse and Use this; the rest hide behind Other options."],
  ] },
  { key: "evidence", label: "Evidence", options: [
    ["cite", "Inline citations", "Small page badges right after each claim. Hover one."],
    ["e22", "Boxes on page", "Under the finding, the pages that prove it; an outline draws itself on each and a plain label pops."],
    ["e23", "Peek on hover", "Tiny page tags after claims; hover one to peek at the page."],
    ["e24", "Settings sentence", "The setup reads as one plain sentence; each underlined word opens a menu and the new word rolls in. Click a word."],
  ] },
  { key: "finish", label: "Finish", options: [
    ["f26", "Ring → button", "A progress ring fills, then stretches into the Open pill; the caption under it says it's ready."],
    ["f27", "Pages → book", "Your first pages slide into a stack and a cover with the name swings shut; the words follow."],
    ["f28", "Sparkle burst", "A blue check springs in and draws itself while eight dots burst once."],
    ["f29", "Done in N steps", "The checklist folds into one row, Done in N steps, with Open under it. Click the row."],
  ] },
  { key: "ambient", label: "Ambient", options: [
    ["g34", "Tint per phase", "The background takes its own blue tint for reading, asking and ready, crossfading between them."],
  ] },
] as const

export type IdeaGroup = (typeof IDEA_GROUPS)[number]["key"]
export type Ideas = Record<IdeaGroup, string>

export const NO_IDEAS = Object.fromEntries(IDEA_GROUPS.map((g) => [g.key, "now"])) as Ideas

export const IdeasContext = createContext<Ideas>(NO_IDEAS)

/** The idea picked for a group in the lab ("now" when none). */
export const useIdea = (group: IdeaGroup) => useContext(IdeasContext)[group]
