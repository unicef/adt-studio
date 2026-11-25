/* eslint-disable lingui/no-unlocalized-strings -- dev-only lab labels for ideas from the reference board */
import { createContext, useContext } from "react"

/**
 * Ideas from the Living chat reference board (`.context/issue-333/refboard`), one toolbar control
 * per group. "now" is Living chat as it is; every other value is one idea, by its board id. Only
 * the lab sets these; outside it every group is "now".
 */
export const IDEA_GROUPS = [
  { key: "entrance", label: "Entrance", options: [
    ["a1", "Spring from avatar", "Each bubble pops out of the avatar's corner with a small overshoot."],
    ["a2", "Composer → bubble", "Your text flies up from the composer and becomes your bubble. Send or answer something."],
    ["a3", "Words from blur", "The assistant's words fade in from a blur, one by one."],
    ["a4", "Gentle / Slam", "Routine messages slip in softly; the big moment (book ready) stamps down."],
  ] },
  { key: "expand", label: "Expand", options: [
    ["b6", "Bubble → panel", "Opening the settings stretches the bubble into the panel in place. Click Change settings."],
    ["b7", "Island morph", "One dark pill at the top changes shape for each phase: busy, needs you, done."],
    ["b8", "Height: auto", "Folded steps open as native details that slide to their real height. Click a summary row."],
    ["b9", "Side canvas", "Settings open in a panel beside the chat and the chat slides left. Click Change settings."],
    ["b10", "Height morph", "One card keeps its place; only its height eases between views. Click Change settings."],
    ["b11", "Receipt", "Answered steps collapse to a one-line receipt with Change."],
  ] },
  { key: "loader", label: "Loader", options: [
    ["c12", "Scan line", "A glowing line sweeps down your page thumbnails while reading."],
    ["c13", "Shimmer + count", "The status line shimmers and the page count ticks up."],
    ["c14", "Steps tick off", "A short checklist; each step gets a check as it finishes."],
    ["c15", "Skeleton → answer", "Grey shapes of the answer appear first, then turn into it."],
    ["c16", "Flipbook", "A small stack of your pages flips one by one."],
    ["c17", "Shape morph", "The avatar morphs between shapes while it works."],
  ] },
  { key: "question", label: "Question", options: [
    ["d18", "Live previews", "Each choice is a picture of what you'll get, made from your pages."],
    ["d19", "Chip flies to reply", "Pick an answer: it flies across and becomes your reply."],
    ["d21", "Smart default", "Only my guess shows, with one button; the rest hide behind Other options."],
  ] },
  { key: "evidence", label: "Evidence", options: [
    ["cite", "Inline citations", "Small page badges right after each claim. Hover one."],
    ["e22", "Boxes on page", "Outlines are drawn on the page thumbnail as proof."],
    ["e23", "Peek on hover", "Tiny page tags after claims; hover one to peek at the page."],
    ["e24", "Settings sentence", "The settings read as one sentence; each underlined word opens a menu."],
    ["e25", "Tool-call card", "What was checked shows as tool rows: spinner, then check, details folded."],
  ] },
  { key: "finish", label: "Finish", options: [
    ["f26", "Ring → button", "A progress ring fills, then stretches into the Open button."],
    ["f27", "Pages → book", "Page thumbnails gather into a stack and a cover closes over them."],
    ["f28", "Sparkle burst", "A check draws itself and a few sparkles burst once."],
    ["f29", "Done in N steps", "The progress steps fold into one line: Done in N steps."],
  ] },
  { key: "ambient", label: "Ambient", options: [
    ["g30", "Edge glow", "A soft moving glow around the screen edge while it works."],
    ["g31", "Avatar moods", "The avatar breathes when idle, looks busy while working, hops when done."],
    ["g32", "Dots → message", "The typing dots widen into the message instead of being replaced."],
    ["g33", "Press feedback", "Buttons squish when pressed; wrong input shakes. Click things."],
    ["g34", "Tint per phase", "The background tint changes with each phase."],
  ] },
] as const

export type IdeaGroup = (typeof IDEA_GROUPS)[number]["key"]
export type Ideas = Record<IdeaGroup, string>

export const NO_IDEAS = Object.fromEntries(IDEA_GROUPS.map((g) => [g.key, "now"])) as Ideas

export const IdeasContext = createContext<Ideas>(NO_IDEAS)

/** The idea picked for a group in the lab ("now" when none). */
export const useIdea = (group: IdeaGroup) => useContext(IdeasContext)[group]
