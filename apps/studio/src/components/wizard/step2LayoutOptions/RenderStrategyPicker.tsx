import type { MessageDescriptor } from "@lingui/core"
import type { ElementType } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useStore } from "@tanstack/react-form"
import { cn } from "@/lib/utils"
import { useWizardForm } from "@/components/wizard/wizardForm"
import {
  RENDER_STRATEGIES,
  PRESETS,
  STRATEGY_CATEGORIES,
  getPresetAccent,
  type PresetAccent,
  type RenderStrategyId,
  type StrategyCategory,
} from "@/components/wizard/constants"

const RADIO_NAME = "renderStrategy"

const CATEGORY_CHIP: Record<StrategyCategory, MessageDescriptor> = {
  template: STRATEGY_CATEGORIES.template.label,
  ai: STRATEGY_CATEGORIES.ai.label,
}

function StrategyRadio({
  id,
  Icon,
  title,
  description,
  category,
  selected,
  onSelect,
  accent,
}: {
  id: RenderStrategyId
  Icon: ElementType
  title: MessageDescriptor
  description: MessageDescriptor
  category: StrategyCategory
  selected: boolean
  onSelect: () => void
  accent: PresetAccent
}) {
  const { i18n } = useLingui()
  const chip = CATEGORY_CHIP[category]
  const categoryHint = STRATEGY_CATEGORIES[category].description

  return (
    <label
      htmlFor={`strategy-${id}`}
      className={cn(
        "flex w-full cursor-pointer items-stretch gap-2 rounded-lg p-2 text-left",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        selected ? "border" : "border border-border bg-card hover:bg-muted/40",
      )}
      style={
        selected
          ? { borderColor: accent.bg, backgroundColor: `${accent.bg}12`, transition: "border-color 0.4s ease, background-color 0.4s ease" }
          : { transition: "border-color 0.4s ease, background-color 0.4s ease" }
      }
      title={i18n._(categoryHint)}
    >
      <input
        type="radio"
        id={`strategy-${id}`}
        name={RADIO_NAME}
        value={id}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <div className="flex size-14 shrink-0 items-center justify-center">
        <Icon
          className={cn("size-10 shrink-0", !selected && "text-muted-foreground/70")}
          style={selected ? { color: accent.text, transition: "color 0.4s ease" } : { transition: "color 0.4s ease" }}
          strokeWidth={1.5}
          aria-hidden
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 pr-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold leading-5 text-foreground">{i18n._(title)}</span>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none",
              category === "template"
                ? "border-border bg-muted/60 text-muted-foreground"
                : "border-brand-200 bg-brand-50 text-brand-700",
            )}
          >
            {i18n._(chip)}
          </span>
        </div>
        <span className="text-xs font-normal leading-4 text-muted-foreground whitespace-normal">
          {i18n._(description)}
        </span>
      </div>
    </label>
  )
}

export function RenderStrategyPicker() {
  const { i18n, t } = useLingui()
  const form = useWizardForm()
  const renderStrategy = useStore(form.store, (s) => s.values.renderStrategy)
  const selectedPresetId = useStore(form.store, (s) => s.values.selectedPreset)
  const preset = PRESETS.find((p) => p.id === selectedPresetId)

  const allowedIds = preset?.renderStrategies
  const recommended = preset?.recommendedStrategies
  const presetLabel = preset?.title
  const accent = getPresetAccent(selectedPresetId)

  const visibleStrategies = RENDER_STRATEGIES.filter(
    (s) => !("hidden" in s && s.hidden),
  )
  const strategies = allowedIds
    ? visibleStrategies.filter((s) => allowedIds.includes(s.id))
    : visibleStrategies

  const recommendedStrategies = recommended?.length
    ? strategies.filter((s) => recommended.includes(s.id))
    : []
  const otherStrategies = recommended?.length
    ? strategies.filter((s) => !recommended.includes(s.id))
    : strategies

  function handleSelect(id: RenderStrategyId) {
    form.setFieldValue("renderStrategy", id)
  }

  return (
    <fieldset id="wizard-render-strategy" className="flex w-full flex-col gap-2 border-0 p-0">
      <legend className="flex w-full items-center gap-1 pb-2">
        <span className="text-sm font-medium leading-[14px] text-foreground">
          <Trans>Render Strategy</Trans>
        </span>
        <span className="text-sm font-medium leading-[14px] text-destructive" aria-hidden>
          *
        </span>
      </legend>
      <p className="pb-1 text-xs leading-relaxed text-muted-foreground">
        <Trans>Pick one layout approach.</Trans>{" "}
        <span className="text-foreground/80">{i18n._(STRATEGY_CATEGORIES.template.label)}</span>{" "}
        <Trans>options are deterministic;</Trans>{" "}
        <span className="text-foreground/80">{i18n._(STRATEGY_CATEGORIES.ai.label)}</span>{" "}
        <Trans>options generate a fresh layout per page.</Trans>
      </p>

      <div className="flex flex-col gap-3">
        {recommendedStrategies.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-3">
            <p className="flex items-center gap-1.5 px-1 text-xs font-medium text-foreground/80">
              <span aria-hidden>↓</span>
              {presetLabel
                ? t`Best for ${i18n._(presetLabel)}`
                : t`Best for your preset`}
            </p>
            {recommendedStrategies.map((strategy) => (
              <StrategyRadio
                key={strategy.id}
                id={strategy.id}
                Icon={strategy.Icon}
                title={strategy.title}
                description={strategy.description}
                category={strategy.category}
                selected={renderStrategy === strategy.id}
                onSelect={() => handleSelect(strategy.id)}
                accent={accent}
              />
            ))}
          </div>
        )}

        {otherStrategies.length > 0 && (
          <div className="flex flex-col gap-2">
            {recommendedStrategies.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <div className="h-px flex-1 bg-muted" />
                <span className="text-[11px] font-medium text-muted-foreground/70">
                  <Trans>Other options</Trans>
                </span>
                <div className="h-px flex-1 bg-muted" />
              </div>
            )}
            {otherStrategies.map((strategy) => (
              <StrategyRadio
                key={strategy.id}
                id={strategy.id}
                Icon={strategy.Icon}
                title={strategy.title}
                description={strategy.description}
                category={strategy.category}
                selected={renderStrategy === strategy.id}
                onSelect={() => handleSelect(strategy.id)}
                accent={accent}
              />
            ))}
          </div>
        )}
      </div>
    </fieldset>
  )
}
