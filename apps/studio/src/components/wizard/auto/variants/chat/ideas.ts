/* eslint-disable lingui/no-unlocalized-strings -- dev-only lab labels for ideas from the reference board */
import { createContext, useContext } from "react"

/**
 * Ideas from the Living chat reference board (`.context/issue-333/refboard`), one toolbar control
 * per group. "now" is Living chat as it is; every other value is one idea, by its board id. Only
 * the lab sets these; outside it every group is "now".
 */
export const IDEA_GROUPS = [
  { key: "entrance", label: "Entrance", options: [["a1", "Spring from avatar"], ["a2", "Composer → bubble"], ["a3", "Words from blur"], ["a4", "Gentle / Slam"]] },
  { key: "expand", label: "Expand", options: [["b6", "Bubble → panel"], ["b7", "Island morph"], ["b8", "Height: auto"], ["b9", "Side canvas"], ["b10", "Height morph"], ["b11", "Receipt"]] },
  { key: "loader", label: "Loader", options: [["c12", "Scan line"], ["c13", "Shimmer + count"], ["c14", "Steps tick off"], ["c15", "Skeleton → answer"], ["c16", "Flipbook"], ["c17", "Shape morph"]] },
  { key: "question", label: "Question", options: [["d18", "Live previews"], ["d19", "Chip flies to reply"], ["d21", "Smart default"]] },
  { key: "evidence", label: "Evidence", options: [["cite", "Inline citations"], ["e22", "Boxes on page"], ["e23", "Peek on hover"], ["e24", "Settings sentence"], ["e25", "Tool-call card"]] },
  { key: "finish", label: "Finish", options: [["f26", "Ring → button"], ["f27", "Pages → book"], ["f28", "Sparkle burst"], ["f29", "Done in N steps"]] },
  { key: "ambient", label: "Ambient", options: [["g30", "Edge glow"], ["g31", "Avatar moods"], ["g32", "Dots → message"], ["g33", "Press feedback"], ["g34", "Tint per phase"]] },
] as const

export type IdeaGroup = (typeof IDEA_GROUPS)[number]["key"]
export type Ideas = Record<IdeaGroup, string>

export const NO_IDEAS = Object.fromEntries(IDEA_GROUPS.map((g) => [g.key, "now"])) as Ideas

export const IdeasContext = createContext<Ideas>(NO_IDEAS)

/** The idea picked for a group in the lab ("now" when none). */
export const useIdea = (group: IdeaGroup) => useContext(IdeasContext)[group]
