import { useLingui } from "@lingui/react/macro"
import { ArrowRight, Check, GripVertical, PencilLine } from "lucide-react"
import type { ACTIVITY_PRESETS } from "./activity-presets"
import { ActivityTemplateIllustration } from "./ActivityTemplateIllustration"

/** Presentation only. These examples contain no form controls or generation actions. */
export function ActivityTemplatePreview({ presetKey }: { presetKey: typeof ACTIVITY_PRESETS[number]["key"] }) {
  const { t } = useLingui()
  const plants = [t`Seed`, t`Sprout`, t`Plant`]
  const choices = presetKey === "true-false" ? [t`True`, t`False`]
    : presetKey === "multi-select" ? [t`Bird`, t`Butterfly`, t`Fish`] : [t`Fish`, t`Cat`, t`Bird`, t`Butterfly`]
  const question = presetKey === "multiple-choice" ? t`Which animal lives in water?`
    : presetKey === "multi-select" ? t`Select the animals that can fly.`
    : presetKey === "true-false" ? t`A butterfly is an insect.`
    : presetKey === "fill-in-the-blank" ? t`Complete the sentence.`
    : presetKey === "matching" ? t`Match each animal to its home.`
    : presetKey === "sorting" ? t`Place each item in a group.`
    : presetKey === "ordering" ? t`Put the stages of a plant in order.`
    : presetKey === "table" ? t`Complete the number pattern.`
    : presetKey === "underline" ? t`Select the action word.` : t`What helps a plant grow?`
  const rows = presetKey === "matching" ? [t`Fish`, t`Bird`] : [t`Apple`, t`Carrot`]
  const destinations = presetKey === "matching" ? [t`Water`, t`Nest`] : [t`Fruit`, t`Vegetable`]

  if (presetKey === "replicate") return (
    <div className="space-y-4 rounded-xl border bg-background p-5">
      <ActivityTemplateIllustration presetKey={presetKey} />
      <p className="text-sm leading-relaxed">{t`Recreates an exercise from your selected page. Its layout depends on the original exercise.`}</p>
    </div>
  )

  return (
    <div className="space-y-5 rounded-xl border bg-background p-5 shadow-sm">
      <p className="text-base font-semibold">{question}</p>
      {["multiple-choice", "multi-select", "true-false"].includes(presetKey) && (
        <ul className="space-y-2">
          {choices.map((label, index) => {
            const selected = index === 0 || (presetKey === "multi-select" && index === 1)
            return (
              <li key={label} className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm ${selected ? "border-primary bg-primary/5" : ""}`}>
                <span aria-hidden="true" className={`flex size-4 shrink-0 items-center justify-center border ${presetKey === "multi-select" ? "rounded-sm" : "rounded-full"} ${selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground"}`}>
                  {selected && <Check className="size-3" />}
                </span>
                {label}
              </li>
            )
          })}
        </ul>
      )}
      {presetKey === "fill-in-the-blank" && (
        <div className="space-y-3 text-sm">
          <p>{t`A ___ grows into a plant. (Seed / Water)`}</p>
          <div className="rounded-lg border border-dashed px-3 py-3 text-muted-foreground">{plants[0]}</div>
        </div>
      )}
      {presetKey === "matching" && rows.map((label, index) => (
        <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
          <span className="rounded-lg border bg-muted p-3 font-medium">{label}</span>
          <ArrowRight aria-hidden="true" className="size-4 text-primary" />
          <span className="rounded-lg border border-primary/40 bg-primary/5 p-3">{destinations[index]}</span>
        </div>
      ))}
      {presetKey === "sorting" && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          {destinations.map((label, index) => (
            <div key={label} className="space-y-4 rounded-lg border border-dashed bg-muted/40 p-3">
              <p className="font-medium">{label}</p>
              <p className="rounded-md border bg-background p-2 shadow-sm">{rows[index]}</p>
            </div>
          ))}
        </div>
      )}
      {presetKey === "ordering" && (
        <ol className="space-y-2">
          {plants.map((label, index) => (
            <li key={label} className="flex min-h-12 items-center gap-3 rounded-lg border p-3 text-sm">
              <span className="text-muted-foreground">{index + 1}</span>
              <span className="flex-1 font-medium">{label}</span>
              <GripVertical aria-hidden="true" className="size-4 text-muted-foreground" />
            </li>
          ))}
        </ol>
      )}
      {presetKey === "table" && (
        <table className="w-full text-left text-sm">
          <thead><tr><th scope="col" className="p-2">{t`Number`}</th><th scope="col" className="p-2">{t`Double`}</th></tr></thead>
          <tbody>{[2, 3].map((number) => (
            <tr key={number}><th scope="row" className="p-2">{number}</th><td className="p-2"><span className="block rounded-lg border border-dashed px-3 py-2">{number * 2}</span></td></tr>
          ))}</tbody>
        </table>
      )}
      {presetKey === "underline" && (
        <p className="flex flex-wrap gap-2 rounded-lg bg-muted/50 p-4 text-base">
          <span>{t`Birds`}</span><span className="font-medium text-primary underline decoration-2 underline-offset-4">{t`fly`}</span><span>{t`high`}</span>
        </p>
      )}
      {presetKey === "open-ended" && (
        <div aria-hidden="true" className="space-y-4 rounded-lg border p-4">
          <PencilLine className="size-4 text-muted-foreground" />
          <div className="h-px bg-border" /><div className="h-px bg-border" /><div className="h-px w-2/3 bg-border" />
        </div>
      )}
      <div aria-hidden="true" className="border-t pt-4">
        <span className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">{presetKey === "open-ended" ? t`Submit response` : t`Check answer`}</span>
      </div>
    </div>
  )
}
