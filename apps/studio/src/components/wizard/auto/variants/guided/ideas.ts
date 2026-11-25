import { createElement, useContext, useMemo, type ReactNode } from "react"
import type { FlowStep } from "./shared/labDrive"
import { IdeasContext, NO_IDEAS, useIdea, type IdeaGroup, type Ideas } from "./shared/ideaGroups"

/** Guided's own value for "none of the ideas": plain swaps, no tint. Only the lab sets it. */
export const PLAIN = "off"

/**
 * The reference-board ideas Guided plays, per group, and the one it uses when the lab says "now"
 * (its default, what looks best here).
 */
export const GUIDED_IDEAS = {
  loader: { default: "c12", options: ["c12", "c13", "c14", "c15", "c16", "c17"] },
  question: { default: "d18", options: ["d18", "d21"] },
  evidence: { default: "cite", options: ["cite", "e22", "e23", "e24"] },
  finish: { default: "f26", options: ["f26", "f27", "f28", "f29"] },
  expand: { default: "b10", options: ["b10"] },
  ambient: { default: "g34", options: ["g34"] },
} as const satisfies Partial<Record<IdeaGroup, { default: string; options: readonly string[] }>>

export type GuidedGroup = keyof typeof GUIDED_IDEAS

/** Lab: which groups change each step of Guided (the lab's steps, mapped onto Upload · Reading · Check · Create). */
export const GUIDED_STEP_GROUPS: Record<FlowStep, GuidedGroup[]> = {
  start: ["ambient", "expand"],
  reading: ["loader", "ambient", "expand"],
  found: ["evidence", "expand", "ambient"],
  q1: ["question", "evidence", "expand"],
  q2: ["question", "evidence", "expand"],
  ready: ["evidence", "expand", "ambient"],
  creating: ["finish", "ambient", "expand"],
  done: ["finish", "ambient", "expand"],
  error: ["ambient", "expand"],
}

/** The idea Guided plays for a group, from the lab's value: "now" is Guided's default, `off` is none ("now" for the shared parts). */
export function guidedIdea(group: IdeaGroup, value: string | undefined): string {
  const spec = (GUIDED_IDEAS as Record<string, { default: string; options: readonly string[] }>)[group]
  if (!spec) return "now"
  if (value === PLAIN) return "now"
  return value && spec.options.includes(value) ? value : spec.default
}

/**
 * Guided's ideas for everything inside it: the parts under `shared/` (questions, evidence, finish,
 * settings) read `useIdea`, so they get Guided's resolved picks.
 */
export function GuidedIdeas({ children }: { children: ReactNode }) {
  const lab = useContext(IdeasContext)
  const ideas = useMemo(() => Object.fromEntries(Object.keys(NO_IDEAS).map((g) => [g, guidedIdea(g as IdeaGroup, lab[g as IdeaGroup])])) as Ideas, [lab])
  return createElement(IdeasContext.Provider, { value: ideas }, children)
}

/** The resolved idea for a group, inside `GuidedIdeas`. */
export const useGuidedIdea = (group: GuidedGroup) => useIdea(group)
