import type { SetupBookFactId, SetupFact, SetupRecommendation } from "@adt/types"
import { askedFacts, factsThatMatter, settingsFor, type FactAnswers } from "../../engine/answers"

/**
 * Check as small screens, one decision each: the kind of book, its language, how the pages look,
 * the pages to import, the activities (school books, or when the engine asks about exercises or labelled
 * pictures) and the name. Everything here is worked out from the engine's answer and the current
 * answers, so the screens follow the user's picks (another kind of book can bring Activities in).
 */
export const SCREEN_IDS = ["kind", "language", "look", "pages", "activities", "name"] as const
export type ScreenId = (typeof SCREEN_IDS)[number]

const ACTIVITY_FACTS: SetupBookFactId[] = ["exercises", "diagrams"]

const askedIds = (rec: SetupRecommendation) => new Set(askedFacts(rec).map((f) => f.id))

/** The facts the Activities screen shows: the ones the engine asks about, or that change a setting for these answers. */
export function activityFacts(rec: SetupRecommendation, answers: FactAnswers): SetupBookFactId[] {
  const asked = askedIds(rec)
  const matters = new Set(factsThatMatter(rec, answers))
  return ACTIVITY_FACTS.filter((id) => asked.has(id) || matters.has(id))
}

/** Activities is shown for school books, or when the engine asks about exercises or labelled pictures. */
export function activitiesApply(rec: SetupRecommendation, answers: FactAnswers): boolean {
  const asked = askedIds(rec)
  const school = settingsFor(rec, answers).preset?.value === "textbook"
  return (school || ACTIVITY_FACTS.some((id) => asked.has(id))) && activityFacts(rec, answers).length > 0
}

/** The screens of Check for these answers, in order. Every one is shown, except Activities when it doesn't apply. */
export function checkScreens(rec: SetupRecommendation, answers: FactAnswers): ScreenId[] {
  return SCREEN_IDS.filter((id) => id !== "activities" || activitiesApply(rec, answers))
}

/**
 * The facts a screen decides. Kind: the genre. Look: where the words sit, when it's asked or
 * changes the layout (otherwise the screen picks the layout itself). Activities: see `activityFacts`.
 */
export function screenFacts(rec: SetupRecommendation, answers: FactAnswers, screen: ScreenId): SetupFact[] {
  const fact = (id: SetupBookFactId) => rec.facts.find((f) => f.id === id)
  const ids: SetupBookFactId[] =
    screen === "kind"
      ? ["genre"]
      : screen === "look"
        ? askedIds(rec).has("composition") || factsThatMatter(rec, answers).includes("composition")
          ? ["composition"]
          : []
        : screen === "activities"
          ? activityFacts(rec, answers)
          : []
  return ids.map(fact).filter((f): f is SetupFact => !!f)
}

/** Sure: the engine asked nothing on this screen, so it opens on its pick with "Looks right". */
export function screenSure(rec: SetupRecommendation, answers: FactAnswers, screen: ScreenId): boolean {
  return !screenFacts(rec, answers, screen).some((f) => f.ask)
}

/** The screen a fact is decided on. */
export function screenOf(fact: SetupBookFactId): ScreenId {
  return fact === "genre" ? "kind" : fact === "composition" ? "look" : "activities"
}

/** From this many pages a book is large: the Pages screen suggests trying a few pages first. */
export const LARGE_BOOK = 50

/** The book's language from the engine: what the AI saw on the pages, else what the PDF's text or tag says. Null when nothing tells. */
export function bookLanguage(rec: SetupRecommendation): string | null {
  return rec.language ? rec.language.code : rec.measured.language
}

/** Where the user is in Check: the screen on view, the ones passed, and where Continue goes after an Edit from the summary. */
export type CheckState = { at: ScreenId; done: ScreenId[]; back: ScreenId | null }

export const CHECK_START: CheckState = { at: "kind", done: [], back: null }

export type CheckAction = { type: "next" } | { type: "back" } | { type: "go"; to: ScreenId; edit?: boolean } | { type: "end" } | { type: "jump"; to: ScreenId }

/** The screen on view, kept on the list: one that stopped applying gives way to the next that does. */
export function shownScreen(state: CheckState, screens: ScreenId[]): ScreenId {
  if (screens.includes(state.at)) return state.at
  const from = SCREEN_IDS.indexOf(state.at)
  return screens.find((s) => SCREEN_IDS.indexOf(s) > from) ?? screens[screens.length - 1]!
}

const add = (done: ScreenId[], ...ids: ScreenId[]) => [...new Set([...done, ...ids])]

/**
 * Moving through Check. Next passes the screen (back to the summary after an Edit from it); Back
 * goes one screen back; Go opens a passed screen (from the list or the summary); End takes the
 * guesses for the rest and opens the last screen; Jump (the lab) lands on a screen with the ones
 * before it passed.
 */
export function moveCheck(state: CheckState, action: CheckAction, screens: ScreenId[]): CheckState {
  const at = shownScreen(state, screens)
  const i = screens.indexOf(at)
  const last = screens[screens.length - 1]!
  switch (action.type) {
    case "next": {
      const to = state.back && state.back !== at ? state.back : (screens[i + 1] ?? at)
      return { at: to, done: add(state.done, at), back: null }
    }
    case "back":
      return { ...state, at: screens[Math.max(0, i - 1)]!, back: null }
    case "go":
      if (action.to !== at && !state.done.includes(action.to)) return state
      return { ...state, at: action.to, back: action.edit ? at : null }
    case "end":
      return { at: last, done: add(state.done, ...screens.filter((s) => s !== last)), back: null }
    case "jump": {
      const j = Math.max(0, screens.indexOf(action.to))
      return { at: screens[j]!, done: add(state.done, ...screens.slice(0, j)), back: null }
    }
  }
}
