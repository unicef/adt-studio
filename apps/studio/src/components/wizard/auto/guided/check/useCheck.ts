import { useEffect, useState } from "react"
import type { SetupRecommendation } from "@adt/types"
import { morph } from "../shared/motion"
import type { Answers } from "../shared/useAnswers"
import { CHECK_START, checkScreens, moveCheck, shownScreen, type CheckAction, type CheckState, type ScreenId } from "./screens"

/**
 * Check's screens for one engine answer: which ones show, the one on view and the ones passed.
 * The pages to import are the user's to pick (all of them until they choose), so nothing goes
 * into the form here.
 */
export function useCheck(rec: SetupRecommendation | null, chat: Answers) {
  const [state, setState] = useState<CheckState>(CHECK_START)

  useEffect(() => {
    setState(CHECK_START)
  }, [rec?.id])
  const screens: ScreenId[] = rec && chat.derived ? checkScreens(rec, chat.derived.current) : []
  const at = screens.length ? shownScreen(state, screens) : "kind"
  // No page morph between screens: the new screen slides in on its own (CheckFlow), and the
  // fixed bottom bar stays where it is while its title, count and progress animate.
  const move = (action: CheckAction) => setState((s) => moveCheck(s, action, screens))
  return {
    screens,
    at,
    done: state.done,
    /** Where Continue goes after an Edit from the summary (else the next screen). */
    returning: !!state.back && state.back !== at,
    next: () => move({ type: "next" }),
    back: () => move({ type: "back" }),
    go: (to: ScreenId, edit?: boolean) => move({ type: "go", to, edit }),
    /** Takes the guesses for every question left and opens the last screen. */
    end: () => {
      const left = chat.derived?.asked.filter((f) => !(f.id in chat.answers)) ?? []
      if (left.length) chat.skipRest(left)
      move({ type: "end" })
    },
  }
}

export type Check = ReturnType<typeof useCheck>
