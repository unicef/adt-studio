import { useEffect, useRef, useState } from "react"
import type { SetupRecommendation } from "@adt/types"
import { useWizardForm } from "../../../../core/wizardForm"
import type { Answers } from "../shared/useAnswers"
import { CHECK_START, checkScreens, defaultPageRange, moveCheck, shownScreen, type CheckAction, type CheckState, type ScreenId } from "./screens"

/**
 * Check's screens for one engine answer: which ones show, the one on view and the ones passed.
 * When the answer comes in, the engine's page range goes into the wizard form (where the
 * step-by-step wizard and creating the book read it), unless the user already chose pages.
 */
export function useCheck(rec: SetupRecommendation | null, chat: Answers, pageCount: number) {
  const form = useWizardForm()
  const [state, setState] = useState<CheckState>(CHECK_START)
  const ranged = useRef<string | null>(null)

  useEffect(() => {
    setState(CHECK_START)
    if (!rec || ranged.current === rec.id || pageCount < 1) return
    ranged.current = rec.id
    if (form.state.values.scope !== "whole") return
    const range = defaultPageRange(rec, pageCount)
    if (range.scope === "whole") return
    form.setFieldValue("scope", "range")
    form.setFieldValue("startPage", String(range.start))
    form.setFieldValue("endPage", String(range.end))
  }, [rec?.id, pageCount])

  const screens: ScreenId[] = rec && chat.derived ? checkScreens(rec, chat.derived.current) : []
  const at = screens.length ? shownScreen(state, screens) : "kind"
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
    jump: (to: ScreenId) => move({ type: "jump", to }),
  }
}

export type Check = ReturnType<typeof useCheck>
