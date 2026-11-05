import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import { getDisplayName } from "@/lib/languages"
import { useFormatMeta } from "../ExportParts"
import { useOptionText } from "./optionMeta"
import type { ExportOptions } from "./useExportOptions"
import type { ExportFlow } from "../useExportFlow"

export type StepKey = "format" | "content" | "review"

export interface ExportStep {
  key: StepKey
  title: string
  value: string
  detail?: string
  short: string
  muted?: boolean
}

export const STEP_ORDER: StepKey[] = ["format", "content", "review"]

export function useExportSteps(flow: ExportFlow, options: ExportOptions) {
  const { t } = useLingui()
  const text = useOptionText()
  const meta = useFormatMeta(flow, flow.format)
  const [step, setStepState] = useState<StepKey>("format")
  const [reached, setReached] = useState(0)
  const [direction, setDirection] = useState<1 | -1>(1)

  const on = options.features.filter((feature) => feature.on).map((feature) => text.name[feature.slug])
  const { opensIn, included, all } = options.languages
  const languages = all.length > 1 && opensIn ? t`Opens in ${getDisplayName(opensIn)}` : undefined
  const done = options.readiness.filter((item) => item.done).length

  const featureCount = on.length
  const languageCount = included.length
  const contentShort =
    all.length > 1
      ? t`${plural(featureCount, { one: "# feature", other: "# features" })} · ${plural(languageCount, { one: "# language", other: "# languages" })}`
      : featureCount > 0
        ? t`${plural(featureCount, { one: "# feature", other: "# features" })}`
        : t`Text and images`
  const steps: ExportStep[] = [
    { key: "format", title: t`Format`, value: meta.label, short: meta.label },
    options.isProject
      ? { key: "content", title: t`What goes in`, value: t`Nothing to choose`, short: t`Nothing to choose`, muted: true }
      : {
          key: "content",
          title: t`What goes in`,
          value: on.length > 0 ? on.join(", ") : t`Text and images`,
          detail: languages,
          short: contentShort,
        },
    {
      key: "review",
      title: t`Review`,
      value: options.isProject ? t`Ready to export` : t`${done} of ${options.readiness.length} accessibility steps done`,
      short: options.isProject ? t`Ready to export` : t`${done} of ${options.readiness.length} ready`,
    },
  ]

  const index = STEP_ORDER.indexOf(step)
  const canOpen = (key: StepKey) => STEP_ORDER.indexOf(key) <= reached
  const setStep = (next: StepKey) => {
    const target = STEP_ORDER.indexOf(next)
    if (target > reached) return
    setDirection(target >= index ? 1 : -1)
    setStepState(next)
  }
  const skip = (key: StepKey) => options.isProject && key === "content"
  const neighbour = (step: 1 | -1) => {
    let target = index + step
    while (target > 0 && target < STEP_ORDER.length - 1 && skip(STEP_ORDER[target])) target += step
    return STEP_ORDER[Math.max(0, Math.min(STEP_ORDER.length - 1, target))]
  }
  return {
    steps,
    step,
    index,
    direction,
    setStep,
    canOpen,
    nextStep: steps.find((candidate) => candidate.key === neighbour(1)),
    next: () => {
      const target = neighbour(1)
      setReached((current) => Math.max(current, STEP_ORDER.indexOf(target)))
      setDirection(1)
      setStepState(target)
    },
    back: () => setStep(neighbour(-1)),
    isFirst: index === 0,
    isLast: index === STEP_ORDER.length - 1,
  }
}

export type ExportStepsState = ReturnType<typeof useExportSteps>
