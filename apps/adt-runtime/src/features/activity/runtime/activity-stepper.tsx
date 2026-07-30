/**
 * Step-by-step (stepper) activity renderer.
 *
 * Sections carrying `data-activity-variant="stepper"` don't ship LLM HTML —
 * they ship an embedded JSON payload (structured activity + palette, see
 * `packages/pipeline/src/render-editable-activity.ts`) and this module renders
 * the whole experience as a React tree: one item per step, progress header,
 * per-step validation through the dock's Submit button, and inline feedback.
 *
 * The classic initializers (activity-quiz, activity-fill-in-the-blank) skip
 * stepper sections via `:not([data-activity-variant="stepper"])`.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { createRoot } from "react-dom/client"
import { Provider as JotaiProvider, getDefaultStore, useAtomValue } from "jotai"
import type {
  EditableActivity,
  FitbStep,
  McStep,
  OpenEndedStep,
  UnderlineStep,
} from "@adt/types"
import { translationsAtom } from "@/features/language/state/language.atoms"
import {
  pagesAtom,
  currentSectionIdAtom,
} from "@/features/navigation/state/nav.atoms"
import {
  activityModeAtom,
  confettiTriggerAtom,
  isActivityPageAtom,
} from "@/features/activity/state/activity.atoms"
import { embedModeAtom } from "@/shared/state/ui.atoms"
import { playActivitySound } from "./sounds"
import { announceToScreenReader } from "@/shared/lib/aria-live"
import {
  type StepperPayload,
  type SentencePart,
  parseStepperPayload,
  parseSentenceParts,
  resolveText,
  resolveSentenceText,
  isBlankCorrect,
  isMcStepCorrect,
  isUnderlineStepCorrect,
  blankWidthCh,
  standaloneBlanks,
  readableOnWhite,
  clampStageHeight,
  IMAGE_UPSCALE_CAP,
} from "./stepper-logic"
import { containsProfanity } from "../lib/profanity-detector"

const GREEN = "rgb(22, 163, 74)"
/** Darker green/red for text — the mid tones pass AA only as borders/badges. */
const GREEN_TEXT = "#15803D"
const RED = "rgb(220, 38, 38)"
const RED_TEXT = "#B91C1C"
const NEUTRAL_BORDER = "rgb(148, 163, 184)"
const INK = "#1F2937"
const MUTED = "#4B5563"
const STEP_PILL_BG = "#334155"
const UPCOMING_DOT = "#D1D5DB"

const IMAGE_MAX_HEIGHT: Record<string, number> = {
  small: 220,
  medium: 340,
  large: 460,
}

/**
 * Keyboard focus ring for everything interactive in the card, in the
 * activity's accent. A stylesheet rule (not inline styles) so it can use
 * :focus-visible — and because inline `outline` values would permanently
 * suppress it. Scoped to the stepper mount node.
 */
const FOCUS_CSS = `
[data-stepper-root] button:focus-visible,
[data-stepper-root] input:focus-visible,
[data-stepper-root] [role="radio"]:focus-visible {
  outline: 3px solid var(--stepper-focus, #1D4ED8);
  outline-offset: 2px;
  /* transition-all on options would fade the ring in from 0px — a focus
     indicator must appear instantly, so exclude outline while focused. */
  transition-property: color, background-color, border-color, transform, box-shadow;
}
`

function tr(key: string, fallback: string): string {
  const dict = getDefaultStore().get(translationsAtom)
  return dict[key] || fallback
}

function findNextPageHref(): string | null {
  const store = getDefaultStore()
  const pages = store.get(pagesAtom)
  const currentId = store.get(currentSectionIdAtom)
  if (!currentId) return null
  const idx = pages.findIndex((p) => p.section_id === currentId)
  if (idx < 0 || idx >= pages.length - 1) return null
  return pages[idx + 1].href
}

function pageSlug(): string {
  return location.pathname
    .substring(location.pathname.lastIndexOf("/") + 1)
    .split(".")[0]
}

function loadStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function saveStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable (private mode) — progress just isn't persisted
  }
}

type StepStatus = "correct" | "incorrect"

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function StepperActivity({ payload }: { payload: StepperPayload }): React.ReactElement {
  const { activity, palette } = payload
  const dict = useAtomValue(translationsAtom)
  const steps = activity.steps as Array<FitbStep | McStep | OpenEndedStep | UnderlineStep>
  const slug = useMemo(pageSlug, [])

  const [stepIndex, setStepIndex] = useState<number>(() => {
    const saved = loadStored<number>(`${slug}_stepper_step`, 0)
    return Number.isInteger(saved) && saved >= 0 && saved < steps.length ? saved : 0
  })
  const [fitbValues, setFitbValues] = useState<Record<string, string>>(() =>
    loadStored(`${slug}_stepper_values`, {}),
  )
  const [mcSelected, setMcSelected] = useState<Record<string, string>>(() =>
    loadStored(`${slug}_stepper_selected`, {}),
  )
  // Open-ended free text, keyed by step id.
  const [openEndedValues, setOpenEndedValues] = useState<Record<string, string>>(() =>
    loadStored(`${slug}_stepper_open`, {}),
  )
  // Underline: the selected word item-ids per step.
  const [underlineSelected, setUnderlineSelected] = useState<Record<string, string[]>>(() =>
    loadStored(`${slug}_stepper_underline`, {}),
  )
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>({})

  const confettiFired = useRef(false)
  const mounted = useRef(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const stepContainer = useRef<HTMLDivElement | null>(null)
  const prevBlankValidity = useRef<Record<string, boolean>>({})
  const embed = useAtomValue(embedModeAtom)

  const currentStep = steps[stepIndex]
  const currentStatus = statuses[currentStep.id]
  const isLastStep = stepIndex === steps.length - 1
  const checked = currentStatus !== undefined

  const fitbStepCorrect = useCallback(
    (step: FitbStep, values: Record<string, string>): boolean =>
      step.blanks.every((b) => isBlankCorrect(values[b.itemId] ?? "", b.answers)),
    [],
  )

  const goToStep = useCallback(
    (index: number) => {
      setStepIndex(index)
      saveStored(`${slug}_stepper_step`, index)
    },
    [slug],
  )

  // The stepper card owns its controls — the reader's floating activity dock
  // and header would duplicate them, so stand both down for this page.
  useEffect(() => {
    const store = getDefaultStore()
    store.set(activityModeAtom, false)
    store.set(isActivityPageAtom, false)
  }, [])

  // Every blank must have something in it before Check unlocks — grading a
  // half-entered multi-blank step as "wrong" would just punish slow typing.
  // Each kind has its own "ready to check" rule.
  const filled =
    activity.kind === "fill-in-the-blank"
      ? (currentStep as FitbStep).blanks.every(
          (b) => (fitbValues[b.itemId] ?? "").trim() !== "",
        )
      : activity.kind === "multiple-choice"
        ? Boolean(mcSelected[currentStep.id])
        : activity.kind === "open-ended"
          ? (openEndedValues[currentStep.id] ?? "").trim() !== ""
          : (underlineSelected[currentStep.id]?.length ?? 0) > 0
  // Once checked (right OR wrong) the learner may always continue. In the
  // storyboard's embedded preview the last "Next" would navigate the iframe
  // out of the section, so it's disabled there (same rule the dock used).
  const canNext = !isLastStep || (!embed && findNextPageHref() !== null)

  // Primary action: first press checks, next press advances — regardless of
  // whether the answer was right. Editing/reselecting resets back to "check".
  const primaryAction = useCallback(() => {
    if (checked) {
      if (!canNext) return
      if (!isLastStep) {
        goToStep(stepIndex + 1)
      } else {
        const href = findNextPageHref()
        if (href) window.location.href = href
      }
      return
    }
    if (!filled) return

    let correct: boolean
    if (activity.kind === "fill-in-the-blank") {
      correct = fitbStepCorrect(currentStep as FitbStep, fitbValues)
    } else if (activity.kind === "multiple-choice") {
      correct = isMcStepCorrect(currentStep as McStep, mcSelected[currentStep.id] ?? null)
    } else if (activity.kind === "open-ended") {
      // No answer key — any non-empty, non-profane response is accepted.
      const value = openEndedValues[currentStep.id] ?? ""
      correct = value.trim() !== "" && !containsProfanity(value)
    } else {
      correct = isUnderlineStepCorrect(
        currentStep as UnderlineStep,
        underlineSelected[currentStep.id] ?? [],
      )
    }

    setStatuses((prev) => ({ ...prev, [currentStep.id]: correct ? "correct" : "incorrect" }))
    playActivitySound(correct ? "success" : "error")

    if (correct) {
      announceToScreenReader(
        tr("multiple-choice-correct-answer", "Correct!"),
        { assertive: true },
      )
      if (isLastStep && !confettiFired.current) {
        confettiFired.current = true
        const store = getDefaultStore()
        store.set(confettiTriggerAtom, store.get(confettiTriggerAtom) + 1)
      }
    } else {
      announceToScreenReader(
        tr("multiple-choice-try-again", "Try again"),
        { assertive: true },
      )
    }
  }, [
    activity.kind,
    checked,
    canNext,
    isLastStep,
    filled,
    stepIndex,
    currentStep,
    fitbValues,
    mcSelected,
    openEndedValues,
    underlineSelected,
    goToStep,
    fitbStepCorrect,
  ])

  // Clear the current step's answer and verdict so the learner can retry
  // without hand-deleting their text; focus returns to the answer field.
  const tryAgain = useCallback(() => {
    const step = currentStep
    if (activity.kind === "fill-in-the-blank") {
      const itemIds = (step as FitbStep).blanks.map((b) => b.itemId)
      setFitbValues((prev) => {
        const next = { ...prev }
        for (const id of itemIds) delete next[id]
        return next
      })
      for (const id of itemIds) delete prevBlankValidity.current[id]
    } else if (activity.kind === "multiple-choice") {
      setMcSelected((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([k]) => k !== step.id)),
      )
    } else if (activity.kind === "open-ended") {
      setOpenEndedValues((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([k]) => k !== step.id)),
      )
    } else {
      setUnderlineSelected((prev) =>
        Object.fromEntries(Object.entries(prev).filter(([k]) => k !== step.id)),
      )
    }
    setStatuses((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => k !== step.id)),
    )
    window.setTimeout(() => {
      stepContainer.current
        ?.querySelector<HTMLElement>('input, textarea, [role="radio"], [role="checkbox"]')
        ?.focus()
    }, 0)
  }, [activity.kind, currentStep])

  // Full keyboard flow: Enter checks, Enter again advances — from anywhere on
  // the page; Escape clears a wrong answer for a retry. Exceptions keep native
  // semantics: the primary button itself (native click), Back/dots/Try-again
  // buttons, and unselected options (Enter selects them first; Enter on the
  // selected option checks).
  const primaryRef = useRef(primaryAction)
  primaryRef.current = primaryAction
  const tryAgainRef = useRef(tryAgain)
  tryAgainRef.current = tryAgain
  const statusRef = useRef(currentStatus)
  statusRef.current = currentStatus
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
      // Only handle keys when focus is inside the activity card (or nowhere
      // in particular) — reader chrome (dock, TOC, notepad, sidebar) keeps
      // its native Enter/Escape behavior.
      const target = e.target as HTMLElement | null
      const withinCard = Boolean(target && cardRef.current?.contains(target))
      const unfocused =
        !target || target === document.body || target === document.documentElement
      if (!withinCard && !unfocused) return
      if (e.key === "Escape") {
        if (statusRef.current === "incorrect") {
          e.preventDefault()
          tryAgainRef.current()
        }
        return
      }
      if (e.key !== "Enter") return
      // A textarea (open-ended writing area) keeps Enter for newlines.
      if (target?.tagName === "TEXTAREA") return
      if (target?.closest?.("[data-stepper-primary]")) return
      if (target?.closest?.("[data-stepper-nav]")) return
      // An underline word toggles its own selection on Enter.
      if (target?.closest?.('[role="checkbox"]')) return
      const radio = target?.closest?.('[role="radio"]')
      if (radio && radio.getAttribute("aria-checked") !== "true") return
      e.preventDefault()
      primaryRef.current()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  // Persist answers.
  useEffect(() => {
    saveStored(`${slug}_stepper_values`, fitbValues)
  }, [slug, fitbValues])
  useEffect(() => {
    saveStored(`${slug}_stepper_selected`, mcSelected)
  }, [slug, mcSelected])
  useEffect(() => {
    saveStored(`${slug}_stepper_open`, openEndedValues)
  }, [slug, openEndedValues])
  useEffect(() => {
    saveStored(`${slug}_stepper_underline`, underlineSelected)
  }, [slug, underlineSelected])

  // Announce + focus on step change (not on initial mount). Focus lands on
  // the answer field (or first option) so type → Enter → Enter flows without
  // touching the mouse.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    const template = tr("stepper-progress-n-of-m", "Step ${n} of ${m}")
    announceToScreenReader(
      template.replace("${n}", String(stepIndex + 1)).replace("${m}", String(steps.length)),
    )
    const focusTarget = stepContainer.current?.querySelector<HTMLElement>(
      'input, textarea, [role="radio"], [role="checkbox"]',
    )
    ;(focusTarget ?? stepContainer.current)?.focus()
  }, [stepIndex, steps.length])

  const onBlankChange = (itemId: string, answers: string[], value: string): void => {
    setFitbValues((prev) => ({ ...prev, [itemId]: value }))
    // Any edit re-arms the check — the verdict belongs to the answer that was
    // checked, not the one being typed.
    setStatuses((prev) =>
      prev[currentStep.id] !== undefined
        ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== currentStep.id))
        : prev,
    )
    // Chirp only when live validity flips, like the classic hydrator.
    const valid = isBlankCorrect(value, answers)
    const was = prevBlankValidity.current[itemId]
    if (value.trim() !== "") {
      if (valid && was === false) playActivitySound("validate_success")
      if (!valid && was === true) playActivitySound("validate_error")
      prevBlankValidity.current[itemId] = valid
    }
  }

  const onSelectOption = (stepId: string, itemId: string): void => {
    setMcSelected((prev) => ({ ...prev, [stepId]: itemId }))
    // Selecting re-arms the check so verdicts never show for an unchecked pick.
    setStatuses((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => k !== stepId)),
    )
    playActivitySound("drop")
  }

  const onOpenEndedChange = (stepId: string, value: string): void => {
    setOpenEndedValues((prev) => ({ ...prev, [stepId]: value }))
    // Editing re-arms the check — the verdict belongs to the checked text.
    setStatuses((prev) =>
      prev[stepId] !== undefined
        ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== stepId))
        : prev,
    )
  }

  const onToggleToken = (stepId: string, itemId: string): void => {
    setUnderlineSelected((prev) => {
      const current = prev[stepId] ?? []
      const next = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
      return { ...prev, [stepId]: next }
    })
    // Toggling re-arms the check so verdicts never show for an unchecked pick.
    setStatuses((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([k]) => k !== stepId)),
    )
    playActivitySound("drop")
  }

  const titleText = resolveText(activity.title, dict)
  const instructionsText = resolveText(activity.instructions, dict)
  const wordBankText = resolveText(activity.wordBank, dict)
  // A cloze word bank is comma-separated in the source; show each word as a
  // chip. Persistent (in the card header) so it's visible on every step —
  // learners draw every answer from it.
  const wordBankWords = wordBankText
    .split(/[,،]/)
    .map((w) => w.trim())
    .filter(Boolean)
  const imageMaxHeight = IMAGE_MAX_HEIGHT[activity.theme?.imageSize ?? "medium"]
  // Book accents are often mid-tone (pink, orange) and fail AA as text color —
  // headings/controls use a contrast-safe darkened accent; the raw accent only
  // decorates surfaces text never sits on (top strip, page tint, states).
  const accentDark = useMemo(() => readableOnWhite(palette.accent), [palette.accent])

  // The soft accent tints the page BEHIND the card (the card itself stays pure
  // white) — restores the previous background when the activity unmounts.
  useEffect(() => {
    const prev = document.body.style.backgroundColor
    document.body.style.backgroundColor = palette.accentSoft
    return () => {
      document.body.style.backgroundColor = prev
    }
  }, [palette.accentSoft])

  // Keep the image area a constant height across steps (reserved even when a
  // step has no picture) so the card doesn't resize while navigating.
  const reserveImageSpace = steps.some((s) => Boolean(s.image))

  // Measure the activity's images once — small source images (extracted
  // crops) must not leave a mostly-empty stage that pushes the answer field
  // and controls below the fold. The stage shrinks to fit them (see
  // clampStageHeight) and each image may upscale to at most 2× natural size.
  const [naturalHeights, setNaturalHeights] = useState<Record<string, number>>({})
  useEffect(() => {
    let cancelled = false
    const srcs = new Set<string>()
    for (const s of steps) if (s.image?.src) srcs.add(s.image.src)
    for (const src of srcs) {
      const probe = new Image()
      probe.onload = () => {
        if (cancelled) return
        setNaturalHeights((prev) =>
          prev[src] !== undefined ? prev : { ...prev, [src]: probe.naturalHeight },
        )
      }
      probe.src = src
    }
    return () => {
      cancelled = true
    }
  }, [steps])

  const imageSteps = steps.filter((s) => s.image?.src)
  const allImagesMeasured = imageSteps.every(
    (s) => naturalHeights[s.image!.src] !== undefined,
  )
  const stageHeight = allImagesMeasured
    ? clampStageHeight(
        imageMaxHeight,
        imageSteps.map((s) => naturalHeights[s.image!.src]),
      )
    : imageMaxHeight
  const currentNaturalHeight = currentStep.image?.src
    ? naturalHeights[currentStep.image.src]
    : undefined

  // Quiz-style explanation shown instead of the generic "Correct!" message.
  const mcExplanation =
    activity.kind === "multiple-choice" && currentStatus === "correct"
      ? (currentStep as McStep).options.find(
          (o) => o.itemId === mcSelected[currentStep.id],
        )?.explanation
      : undefined

  // Open-ended has no right answer, so its default messages are encouraging
  // rather than "Correct!"/"Try again" (the incorrect state only appears when
  // a response is flagged as inappropriate).
  const defaultCorrect =
    activity.kind === "open-ended"
      ? tr("stepper-open-ended-saved", "Nice work — your answer is saved.")
      : tr("multiple-choice-correct-answer", "Correct!")
  const defaultIncorrect =
    activity.kind === "open-ended"
      ? tr("stepper-open-ended-rephrase", "Let's keep it kind — try rephrasing your answer.")
      : tr("multiple-choice-try-again", "Try again")

  return (
    <div
      ref={cardRef}
      className="mx-auto mt-6 mb-28 w-full max-w-3xl overflow-hidden rounded-3xl bg-white"
      style={{
        border: "1px solid rgba(0,0,0,0.10)",
        boxShadow: "0 18px 44px rgba(0,0,0,0.14)",
        color: INK,
        ["--stepper-focus" as string]: accentDark,
      }}
      role="form"
      aria-label={
        activity.kind === "fill-in-the-blank"
          ? tr("fitb-activity-label", "Fill in the blank activity")
          : activity.kind === "open-ended"
            ? tr("open-ended-activity-label", "Open-ended answer activity")
            : activity.kind === "underline-text"
              ? tr("underline-text-options-label", "Underline the correct text")
              : tr("activity-options-label", "Answer options")
      }
    >
      <style>{FOCUS_CSS}</style>
      {/* Decorative accent strip — keeps the book's color identity without
          putting text on the accent. */}
      <div style={{ height: 8, backgroundColor: palette.accent }} aria-hidden="true" />

      <div className="px-6 py-7 md:px-12 md:py-9">
        <ProgressHeader
          count={steps.length}
          current={stepIndex}
          statuses={steps.map((s) => statuses[s.id])}
          accentDark={accentDark}
          onJump={goToStep}
        />

        {titleText ? (
          <h2
            className="mt-6 text-center text-3xl font-extrabold tracking-tight md:text-4xl"
            style={{ color: accentDark }}
            {...(activity.title?.dataId ? { "data-id": activity.title.dataId } : {})}
          >
            {titleText}
          </h2>
        ) : null}
        {instructionsText ? (
          <p
            className="mt-2 text-center text-lg md:text-xl"
            style={{ color: MUTED }}
            {...(activity.instructions?.dataId
              ? { "data-id": activity.instructions.dataId }
              : {})}
          >
            {instructionsText}
          </p>
        ) : null}
        {wordBankWords.length > 0 ? (
          <div
            className="mx-auto mt-4 max-w-2xl rounded-2xl px-4 py-3"
            style={{ backgroundColor: palette.accentSoft, border: "1px solid rgba(0,0,0,0.08)" }}
            role="group"
            aria-label={tr("stepper-word-bank", "Words to choose from")}
          >
            <p
              className="mb-2 text-center text-sm font-bold uppercase tracking-wide"
              style={{ color: accentDark }}
            >
              {tr("stepper-word-bank", "Words to choose from")}
            </p>
            <div
              className="flex flex-wrap justify-center gap-2"
              {...(activity.wordBank?.dataId ? { "data-id": activity.wordBank.dataId } : {})}
            >
              {wordBankWords.map((word, i) => (
                <span
                  key={i}
                  className="rounded-full bg-white px-3 py-1 text-base font-medium md:text-lg"
                  style={{ border: `2px solid ${accentDark}`, color: INK }}
                >
                  {word}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Step body */}
        <div ref={stepContainer} tabIndex={-1} className="mt-7 outline-none">
          {activity.kind === "fill-in-the-blank" ? (
            <FitbStepView
              step={currentStep as FitbStep}
              dict={dict}
              values={fitbValues}
              status={currentStatus}
              stageHeight={stageHeight}
              imageNaturalHeight={currentNaturalHeight}
              reserveImageSpace={reserveImageSpace}
              accentDark={accentDark}
              onChange={onBlankChange}
            />
          ) : activity.kind === "multiple-choice" ? (
            <McStepView
              step={currentStep as McStep}
              dict={dict}
              selected={mcSelected[currentStep.id] ?? null}
              status={currentStatus}
              imageMaxHeight={imageMaxHeight}
              stageHeight={stageHeight}
              imageNaturalHeight={currentNaturalHeight}
              reserveImageSpace={reserveImageSpace}
              accentDark={accentDark}
              accentSoft={palette.accentSoft}
              optionColumns={activity.theme?.optionColumns}
              onSelect={onSelectOption}
            />
          ) : activity.kind === "open-ended" ? (
            <OpenEndedStepView
              step={currentStep as OpenEndedStep}
              dict={dict}
              value={openEndedValues[currentStep.id] ?? ""}
              status={currentStatus}
              stageHeight={stageHeight}
              imageNaturalHeight={currentNaturalHeight}
              reserveImageSpace={reserveImageSpace}
              accentDark={accentDark}
              onChange={onOpenEndedChange}
            />
          ) : (
            <UnderlineStepView
              step={currentStep as UnderlineStep}
              dict={dict}
              selected={underlineSelected[currentStep.id] ?? []}
              status={currentStatus}
              stageHeight={stageHeight}
              imageNaturalHeight={currentNaturalHeight}
              reserveImageSpace={reserveImageSpace}
              accentDark={accentDark}
              accentSoft={palette.accentSoft}
              onToggle={onToggleToken}
            />
          )}

          {/* Feedback — fixed-height slot so the card doesn't jump on check */}
          <div
            className="mt-5 flex min-h-9 items-center justify-center text-center"
            aria-live="polite"
          >
            {currentStatus === "correct" ? (
              <p
                className="flex items-center justify-center gap-2 text-lg font-semibold md:text-xl"
                style={{ color: GREEN_TEXT }}
              >
                <i className="fas fa-check-circle shrink-0" aria-hidden="true" />
                <span>
                  {currentStep.feedback?.correct || mcExplanation || defaultCorrect}
                </span>
              </p>
            ) : currentStatus === "incorrect" ? (
              <p
                className="flex items-center justify-center gap-2 text-lg font-semibold md:text-xl"
                style={{ color: RED_TEXT }}
              >
                <i className="fas fa-times-circle shrink-0" aria-hidden="true" />
                <span>
                  {currentStep.feedback?.incorrect || defaultIncorrect}
                </span>
              </p>
            ) : null}
          </div>

          {/* Controls — Back on the left, Check/Next on the right. The DOM
              puts the primary action(s) FIRST so Tab reaches them from the
              answer field before Back; flex-row-reverse keeps the visual
              order (Back left, actions right). */}
          <div className="mt-4 flex flex-row-reverse items-center justify-between gap-3">
            {currentStatus === "incorrect" ? (
              <div className="flex items-center gap-3">
                {/* Retry is the encouraged action after a wrong answer — it
                    clears the answer and re-arms the check. Next stays
                    available, but as the quieter option. */}
                <button
                  type="button"
                  data-stepper-nav="true"
                  onClick={tryAgain}
                  className="inline-flex cursor-pointer items-center gap-2.5 rounded-full px-6 py-3 text-lg font-bold text-white transition-all"
                  style={{ backgroundColor: accentDark, boxShadow: "0 4px 0 rgba(0,0,0,0.18)" }}
                >
                  <i className="fas fa-undo" aria-hidden="true" />
                  {tr("multiple-choice-try-again", "Try again")}
                </button>
                <button
                  type="button"
                  data-stepper-primary="true"
                  onClick={primaryAction}
                  disabled={!canNext}
                  className="inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-white px-6 py-3 text-lg font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ border: `3px solid ${accentDark}`, color: accentDark }}
                >
                  {tr("next", "Next")}
                  <i className="fas fa-arrow-right" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-stepper-primary="true"
                onClick={primaryAction}
                disabled={checked ? !canNext : !filled}
                className="inline-flex cursor-pointer items-center gap-2.5 rounded-full px-8 py-3 text-lg font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
                style={{ backgroundColor: accentDark, boxShadow: "0 4px 0 rgba(0,0,0,0.18)" }}
              >
                {checked ? (
                  <>
                    {tr("next", "Next")}
                    <i className="fas fa-arrow-right" aria-hidden="true" />
                  </>
                ) : (
                  tr("submit-text", "Check")
                )}
              </button>
            )}
            {stepIndex > 0 ? (
              <button
                type="button"
                data-stepper-nav="true"
                onClick={() => goToStep(stepIndex - 1)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-white px-5 py-2.5 text-base font-semibold transition-colors"
                style={{ border: `3px solid ${accentDark}`, color: accentDark }}
              >
                <i className="fas fa-arrow-left" aria-hidden="true" />
                {tr("previous", "Back")}
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ProgressHeader({
  count,
  current,
  statuses,
  accentDark,
  onJump,
}: {
  count: number
  current: number
  statuses: Array<StepStatus | undefined>
  accentDark: string
  onJump: (index: number) => void
}): React.ReactElement {
  const template = tr("stepper-progress-n-of-m", "Step ${n} of ${m}")
  const label = template
    .replace("${n}", String(current + 1))
    .replace("${m}", String(count))
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            data-stepper-nav="true"
            onClick={() => onJump(i)}
            aria-label={template
              .replace("${n}", String(i + 1))
              .replace("${m}", String(count))}
            aria-current={i === current}
            className="h-4 w-4 cursor-pointer rounded-full transition-all"
            style={{
              backgroundColor:
                statuses[i] === "correct"
                  ? GREEN
                  : statuses[i] === "incorrect"
                    ? RED
                    : i === current
                      ? accentDark
                      : UPCOMING_DOT,
              // No `outline: none` for other dots — it would suppress the
              // keyboard focus ring (FOCUS_CSS).
              ...(i === current
                ? { outline: `3px solid ${accentDark}`, outlineOffset: "3px" }
                : {}),
            }}
          />
        ))}
      </div>
      <span
        className="shrink-0 rounded-full px-4 py-1 text-base font-bold text-white"
        style={{ backgroundColor: STEP_PILL_BG }}
        aria-hidden="true"
      >
        {current + 1} / {count}
      </span>
    </div>
  )
}

function FitbStepView({
  step,
  dict,
  values,
  status,
  stageHeight,
  imageNaturalHeight,
  reserveImageSpace,
  accentDark,
  onChange,
}: {
  step: FitbStep
  dict: Record<string, string>
  values: Record<string, string>
  status: StepStatus | undefined
  stageHeight: number
  imageNaturalHeight: number | undefined
  reserveImageSpace: boolean
  accentDark: string
  onChange: (itemId: string, answers: string[], value: string) => void
}): React.ReactElement {
  const answersByItem = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const b of step.blanks) map.set(b.itemId, b.answers)
    return map
  }, [step])

  const liveState = (itemId: string): boolean | null => {
    const value = values[itemId] ?? ""
    return value.trim() === "" ? null : isBlankCorrect(value, answersByItem.get(itemId) ?? [])
  }

  const verdictColor = (live: boolean | null, neutral: string): string =>
    status === "incorrect" && !live ? RED : live === null ? neutral : live ? GREEN : RED

  /** Inline blank inside a sentence — thick underline, inherits text size. */
  const inlineBlank = (
    itemId: string,
    hint: string | undefined,
    key: React.Key,
  ): React.ReactNode => {
    const answers = answersByItem.get(itemId) ?? []
    const live = liveState(itemId)
    return (
      <input
        key={key}
        type="text"
        value={values[itemId] ?? ""}
        onChange={(e) => onChange(itemId, answers, e.target.value)}
        placeholder={hint}
        autoComplete="off"
        aria-label={tr("fitb-blank-label", "Blank")}
        aria-invalid={live === false}
        className="mx-1 inline-block border-b-4 bg-transparent px-1 py-0.5 text-center focus:outline-none"
        style={{
          width: `${blankWidthCh(answers, hint)}ch`,
          minWidth: "5ch",
          maxWidth: "100%",
          borderColor: verdictColor(live, NEUTRAL_BORDER),
        }}
      />
    )
  }

  /** Form-style answer field — a large, obvious box (name-the-picture). */
  const standaloneField = (
    itemId: string,
    hint: string | undefined,
  ): React.ReactNode => {
    const answers = answersByItem.get(itemId) ?? []
    const live = liveState(itemId)
    return (
      <input
        key={itemId}
        type="text"
        value={values[itemId] ?? ""}
        onChange={(e) => onChange(itemId, answers, e.target.value)}
        placeholder={hint}
        autoComplete="off"
        aria-label={tr("fitb-blank-label", "Blank")}
        aria-invalid={live === false}
        className="rounded-2xl bg-white px-5 py-3 text-center text-xl md:text-2xl focus:outline-none focus:ring-4 focus:ring-blue-200"
        style={{
          border: `3px solid ${verdictColor(live, accentDark)}`,
          width: `${Math.max(blankWidthCh(answers, hint) + 4, 14)}ch`,
          maxWidth: "100%",
        }}
      />
    )
  }

  const renderPart = (part: SentencePart, key: number): React.ReactNode => {
    if (part.type === "text") return <React.Fragment key={key}>{part.text}</React.Fragment>
    return inlineBlank(part.itemId, part.hint, key)
  }

  // Form-style answer fields (no marker in any sentence) render on their own
  // line under the image/label — the name-the-picture layout.
  const standalone = standaloneBlanks(step)

  return (
    <div>
      {reserveImageSpace ? (
        <div
          className="mb-6 flex items-center justify-center"
          style={{ height: `min(${stageHeight}px, 38vh)` }}
        >
          {step.image ? (
            <img
              src={step.image.src}
              alt={step.image.decorative ? "" : (step.image.alt ?? "")}
              {...(step.image.decorative ? { "aria-hidden": true } : {})}
              className="rounded-xl object-contain"
              style={{
                // Fill the stage, but never blow a small source up past 2×.
                height: imageNaturalHeight
                  ? `min(100%, ${imageNaturalHeight * IMAGE_UPSCALE_CAP}px)`
                  : undefined,
                maxHeight: "100%",
                maxWidth: "100%",
              }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="space-y-4">
        {step.sentences
          .filter((s) => s.text.trim() !== "")
          .map((sentence, si) => (
            // data-id keeps the sentence in the read-aloud queue; the DOM
            // translation pass skips [data-stepper-root] so it can't stomp
            // the React-rendered inputs.
            <p
              key={si}
              className="text-center text-xl leading-relaxed md:text-2xl"
              {...(sentence.dataId ? { "data-id": sentence.dataId } : {})}
            >
              {parseSentenceParts(resolveSentenceText(sentence, dict)).map(renderPart)}
            </p>
          ))}
      </div>
      {standalone.length > 0 ? (
        <div className="mt-5 flex flex-col items-center gap-4">
          {standalone.map((blank) => standaloneField(blank.itemId, blank.hint))}
        </div>
      ) : null}
    </div>
  )
}

function McStepView({
  step,
  dict,
  selected,
  status,
  imageMaxHeight,
  stageHeight,
  imageNaturalHeight,
  reserveImageSpace,
  accentDark,
  accentSoft,
  optionColumns,
  onSelect,
}: {
  step: McStep
  dict: Record<string, string>
  selected: string | null
  status: StepStatus | undefined
  imageMaxHeight: number
  stageHeight: number
  imageNaturalHeight: number | undefined
  reserveImageSpace: boolean
  accentDark: string
  accentSoft: string
  optionColumns: number | undefined
  onSelect: (stepId: string, itemId: string) => void
}): React.ReactElement {
  const promptText = resolveText(step.prompt, dict)
  const hasImageOptions = step.options.some((o) => o.image)
  // The user's explicit column choice wins for any option style; the
  // image-based default is 2 (grid), text-based default is 1 (stack).
  const columns = optionColumns ?? (hasImageOptions ? 2 : 1)
  // The context image shares the viewport with the options — cap it so the
  // options stay visible without scrolling on a laptop screen.
  const contextStageHeight = Math.min(stageHeight, 300)
  // Image options share the card space — cap each image lower so a 2×2 grid
  // still fits on screen while staying large and legible.
  const optionImageMaxHeight = Math.round(imageMaxHeight * 0.66)

  return (
    <div>
      {promptText ? (
        <p
          className="mb-5 text-center text-xl font-semibold md:text-2xl"
          {...(step.prompt?.dataId ? { "data-id": step.prompt.dataId } : {})}
        >
          {promptText}
        </p>
      ) : null}
      {reserveImageSpace ? (
        <div
          className="mb-6 flex items-center justify-center"
          style={{ height: `min(${contextStageHeight}px, 34vh)` }}
        >
          {step.image ? (
            <img
              src={step.image.src}
              alt={step.image.decorative ? "" : (step.image.alt ?? "")}
              {...(step.image.decorative ? { "aria-hidden": true } : {})}
              className="rounded-xl object-contain"
              style={{
                height: imageNaturalHeight
                  ? `min(100%, ${imageNaturalHeight * IMAGE_UPSCALE_CAP}px)`
                  : undefined,
                maxHeight: "100%",
                maxWidth: "100%",
              }}
            />
          ) : null}
        </div>
      ) : null}
      <div
        role="radiogroup"
        aria-label={tr("activity-options-label", "Answer options")}
        className="grid gap-3 md:gap-4"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        onKeyDown={(e) => {
          // Arrow keys move focus between options (ARIA radio-group pattern);
          // Enter/Space selects. Tab also works — every option is a tab stop.
          if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return
          const radios = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
          )
          const current = radios.indexOf(document.activeElement as HTMLElement)
          if (current === -1) return
          e.preventDefault()
          const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1
          radios[(current + delta + radios.length) % radios.length]?.focus()
        }}
      >
        {step.options.map((option, oi) => {
          const isSelected = selected === option.itemId
          const verdict = status !== undefined && isSelected ? option.correct : null
          const optionText = option.text ? resolveText(option.text, dict) : ""
          return (
            <button
              key={option.itemId}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(step.id, option.itemId)}
              className="relative cursor-pointer rounded-2xl p-4 text-left transition-all md:p-5"
              style={{
                border: `3px solid ${isSelected ? accentDark : "#E2E8F0"}`,
                backgroundColor: isSelected ? accentSoft : "#FFFFFF",
                color: INK,
                // Only set an inline outline for verdicts — `outline: none`
                // here would suppress the keyboard focus ring (FOCUS_CSS).
                ...(verdict !== null
                  ? {
                      outline: `3px solid ${verdict ? GREEN : RED}`,
                      outlineOffset: "2px",
                    }
                  : {}),
                boxShadow: isSelected ? "none" : "0 2px 6px rgba(0,0,0,0.06)",
              }}
            >
              <span className="flex items-center gap-4">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold"
                  style={{ border: `3px solid ${accentDark}`, color: accentDark }}
                  aria-hidden="true"
                >
                  {oi + 1}
                </span>
                <span className="min-w-0 flex-1">
                  {option.image ? (
                    <img
                      src={option.image.src}
                      alt={option.image.decorative ? "" : (option.image.alt ?? (optionText || ""))}
                      className="mx-auto rounded-lg object-contain"
                      style={{
                        maxHeight: optionImageMaxHeight,
                        width: option.image.widthPercent
                          ? `${option.image.widthPercent}%`
                          : undefined,
                        maxWidth: "100%",
                      }}
                    />
                  ) : null}
                  {optionText ? (
                    <span
                      className="block text-lg md:text-xl"
                      {...(option.text?.dataId ? { "data-id": option.text.dataId } : {})}
                    >
                      {optionText}
                    </span>
                  ) : null}
                </span>
              </span>
              {verdict !== null ? (
                <span
                  role="status"
                  aria-label={
                    verdict
                      ? tr("multiple-choice-correct-answer", "Correct")
                      : tr("multiple-choice-try-again", "Incorrect")
                  }
                  className="absolute flex items-center justify-center rounded-full text-sm text-white"
                  style={{
                    top: -13,
                    right: -13,
                    width: 28,
                    height: 28,
                    backgroundColor: verdict ? GREEN : RED,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                >
                  <i
                    className={verdict ? "fas fa-check" : "fas fa-times"}
                    aria-hidden="true"
                  />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OpenEndedStepView({
  step,
  dict,
  value,
  status,
  stageHeight,
  imageNaturalHeight,
  reserveImageSpace,
  accentDark,
  onChange,
}: {
  step: OpenEndedStep
  dict: Record<string, string>
  value: string
  status: StepStatus | undefined
  stageHeight: number
  imageNaturalHeight: number | undefined
  reserveImageSpace: boolean
  accentDark: string
  onChange: (stepId: string, value: string) => void
}): React.ReactElement {
  const promptText = resolveText(step.prompt, dict)
  // Open-ended sources are almost always multi-line writing areas; a single
  // short input is the exception, kept only when explicitly extracted as one.
  const multiline = step.multiline ?? true
  const borderColor = status === "incorrect" ? RED : status === "correct" ? GREEN : accentDark
  const shared = {
    value,
    placeholder: step.hint,
    "aria-label": tr("open-ended-answer-label", "Your answer"),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(step.id, e.target.value),
  }
  return (
    <div>
      {reserveImageSpace ? (
        <div
          className="mb-6 flex items-center justify-center"
          style={{ height: `min(${stageHeight}px, 38vh)` }}
        >
          {step.image ? (
            <img
              src={step.image.src}
              alt={step.image.decorative ? "" : (step.image.alt ?? "")}
              {...(step.image.decorative ? { "aria-hidden": true } : {})}
              className="rounded-xl object-contain"
              style={{
                height: imageNaturalHeight
                  ? `min(100%, ${imageNaturalHeight * IMAGE_UPSCALE_CAP}px)`
                  : undefined,
                maxHeight: "100%",
                maxWidth: "100%",
              }}
            />
          ) : null}
        </div>
      ) : null}
      {promptText ? (
        <p
          className="mb-5 text-center text-xl font-semibold md:text-2xl"
          {...(step.prompt?.dataId ? { "data-id": step.prompt.dataId } : {})}
        >
          {promptText}
        </p>
      ) : null}
      {multiline ? (
        <textarea
          {...shared}
          rows={4}
          autoComplete="off"
          className="w-full rounded-2xl bg-white px-5 py-3 text-lg leading-relaxed md:text-xl focus:outline-none focus:ring-4 focus:ring-blue-200"
          style={{ border: `3px solid ${borderColor}` }}
        />
      ) : (
        <input
          {...shared}
          type="text"
          autoComplete="off"
          className="w-full rounded-2xl bg-white px-5 py-3 text-lg md:text-xl focus:outline-none focus:ring-4 focus:ring-blue-200"
          style={{ border: `3px solid ${borderColor}` }}
        />
      )}
    </div>
  )
}

function UnderlineStepView({
  step,
  dict,
  selected,
  status,
  stageHeight,
  imageNaturalHeight,
  reserveImageSpace,
  accentDark,
  accentSoft,
  onToggle,
}: {
  step: UnderlineStep
  dict: Record<string, string>
  selected: string[]
  status: StepStatus | undefined
  stageHeight: number
  imageNaturalHeight: number | undefined
  reserveImageSpace: boolean
  accentDark: string
  accentSoft: string
  onToggle: (stepId: string, itemId: string) => void
}): React.ReactElement {
  const selectedSet = new Set(selected)
  const promptText = resolveText(step.prompt, dict)
  const checked = status !== undefined
  return (
    <div>
      {reserveImageSpace ? (
        <div
          className="mb-6 flex items-center justify-center"
          style={{ height: `min(${stageHeight}px, 38vh)` }}
        >
          {step.image ? (
            <img
              src={step.image.src}
              alt={step.image.decorative ? "" : (step.image.alt ?? "")}
              {...(step.image.decorative ? { "aria-hidden": true } : {})}
              className="rounded-xl object-contain"
              style={{
                height: imageNaturalHeight
                  ? `min(100%, ${imageNaturalHeight * IMAGE_UPSCALE_CAP}px)`
                  : undefined,
                maxHeight: "100%",
                maxWidth: "100%",
              }}
            />
          ) : null}
        </div>
      ) : null}
      {promptText ? (
        <p
          className="mb-5 text-center text-xl font-semibold md:text-2xl"
          {...(step.prompt?.dataId ? { "data-id": step.prompt.dataId } : {})}
        >
          {promptText}
        </p>
      ) : null}
      <p
        className="text-center text-2xl leading-relaxed md:text-3xl"
        style={{ color: INK }}
        {...(step.dataId ? { "data-id": step.dataId } : {})}
      >
        {step.tokens.map((token, i) => {
          if (!token.itemId) {
            return <React.Fragment key={i}>{token.text}</React.Fragment>
          }
          const itemId = token.itemId
          const isSelected = selectedSet.has(itemId)
          // Verdict shows only after checking, and only on the learner's own
          // picks — a missed correct word stays neutral so the answer is never
          // revealed on a wrong attempt (same rule as multiple-choice).
          const verdict = checked && isSelected ? Boolean(token.correct) : null
          // Distinct shapes, not color alone (WCAG 1.4.1): underline = right
          // pick, strike-through = wrong pick, plain = unselected.
          const decoration = !isSelected
            ? "none"
            : verdict === false
              ? "line-through"
              : "underline"
          const lineColor = verdict === null ? accentDark : verdict ? GREEN : RED
          const textColor = verdict === null ? INK : verdict ? GREEN_TEXT : RED_TEXT
          return (
            <button
              key={i}
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              aria-invalid={verdict === false}
              onClick={() => onToggle(step.id, itemId)}
              className="mx-0.5 inline cursor-pointer rounded px-1 transition-colors"
              style={{
                textDecorationLine: decoration,
                textDecorationColor: lineColor,
                textDecorationThickness: "3px",
                textUnderlineOffset: "0.18em",
                color: textColor,
                backgroundColor: isSelected
                  ? verdict === null
                    ? accentSoft
                    : verdict
                      ? "rgba(22,163,74,0.12)"
                      : "rgba(220,38,38,0.12)"
                  : "transparent",
              }}
            >
              {token.text}
            </button>
          )
        })}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Initializer
// ---------------------------------------------------------------------------

export function initializeStepperActivity(): (() => void) | null {
  if (typeof document === "undefined") return null
  const section = document.querySelector<HTMLElement>(
    'section[data-activity-variant="stepper"]',
  )
  if (!section) return null

  const script = section.querySelector<HTMLScriptElement>(
    'script[type="application/json"][data-editable-activity]',
  )
  const mount = section.querySelector<HTMLElement>("[data-stepper-root]")
  const payload = script?.textContent ? parseStepperPayload(script.textContent) : null
  if (!payload || !mount) return null

  const store = getDefaultStore()
  const root = createRoot(mount)
  root.render(
    <React.StrictMode>
      <JotaiProvider store={store}>
        <StepperActivity payload={payload} />
      </JotaiProvider>
    </React.StrictMode>,
  )

  return () => {
    root.unmount()
  }
}

// Re-exported for typing convenience in tests.
export type { EditableActivity }
