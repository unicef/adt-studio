import { useState, useEffect, useCallback, useMemo } from "react"
import type { ComponentType, ReactNode, SVGProps } from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import {
  AlignLeft,
  BookCopy,
  Check,
  Layers,
  LayoutTemplate,
  Sparkles,
  Square,
  Wand2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { TwoColumnStoryStrategyIcon } from "@/components/wizard/icons/TwoColumnStoryStrategyIcon"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n as linguiI18n } from "@lingui/core"
import type { MessageDescriptor } from "@lingui/core"
import { LandingPageShell } from "@/components/pipeline/components/LandingPageShell"
import { CascadeWarning } from "@/components/pipeline/components/CascadeWarning"
import { LandingPageWarning } from "@/components/pipeline/components/LandingPageWarning"
import { SettingExplainer } from "@/components/pipeline/components/SettingExplainer"
import { SettingsCard, SettingsField } from "@/components/pipeline/components/SettingsCard"
import { SegmentedControl } from "@/components/ui/segmented-control"
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useBookConfig } from "@/hooks/use-book-config"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import {
  listDefaultRenderStrategies,
  normalizeDefaultRenderStrategy,
} from "@/lib/render-strategy"
import { RenderStrategyVisual } from "./components/RenderStrategyVisual"
import { StoryboardPreview } from "./components/StoryboardPreview"

const STRATEGY_LABEL_MSGS: Record<string, MessageDescriptor> = {
  single_column: msg`Template One Column`,
  llm: msg`AI Generated`,
  "llm-overlay": msg`Dynamic Overlay`,
  fixed_layout: msg`Fixed Layout`,
  two_column_story: msg`Two Column Story`,
}

type LandingStrategyEntry = {
  id: string
  description: MessageDescriptor
  comingSoon?: boolean
}

const LANDING_STRATEGY_ITEMS: LandingStrategyEntry[] = [
  {
    id: "single_column",
    description: msg`One column for every section. Clean and predictable.`,
  },
  {
    id: "llm",
    description: msg`AI lays out images and text per section, matching the original book's design as closely as possible.`,
  },
  {
    id: "llm-overlay",
    description: msg`Title and image with text overlaid as a caption — AI matches the source book's visual style.`,
  },
  {
    id: "fixed_layout",
    description: msg`Preserves the source PDF's exact page layout — images and positioned text rendered in place.`,
  },
  {
    id: "two_column_story",
    description: msg`Side-by-side image and narrative.`,
  },
]

const AI_STRATEGIES = new Set(["llm", "llm-overlay", "fixed_layout"])

type StrategyIcon = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>

const STRATEGY_ICONS: Record<string, StrategyIcon> = {
  single_column: AlignLeft,
  llm: Sparkles,
  "llm-overlay": Layers,
  fixed_layout: Square,
  two_column_story: TwoColumnStoryStrategyIcon,
}

type EffortKey = "high" | "medium" | "relaxed"
type ActivityModeKey = "dynamic" | "match_source" | "template"

type ActivityModeOption = {
  id: ActivityModeKey
  Icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>
  label: MessageDescriptor
  description: MessageDescriptor
}

const ACTIVITY_MODE_OPTIONS: readonly ActivityModeOption[] = [
  {
    id: "dynamic",
    Icon: Wand2,
    label: msg`Dynamic`,
    description: msg`AI generates fresh interactive activities from each section.`,
  },
  {
    id: "match_source",
    Icon: BookCopy,
    label: msg`Match Source`,
    description: msg`Mirrors the original book's activity layout as closely as possible.`,
  },
  {
    id: "template",
    Icon: LayoutTemplate,
    label: msg`Template`,
    description: msg`Renders activities from a fixed template for consistent styling.`,
  },
]

function strategyDisplayName(slug: string): string {
  const descriptor = STRATEGY_LABEL_MSGS[slug]
  if (descriptor) return linguiI18n._(descriptor)
  return slug
}

// Effort field hidden for now while we evaluate the per-strategy scaling.
// State + persistence stay live so "medium" is the implicit default and
// re-enabling is a single flag flip.
const SHOW_EFFORT_FIELD = false

export function StoryboardLandingPage({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const status = useStageStatus("storyboard")
  const sectioningStatus = useStageStatus("sectioning")
  const extractStatus = useStageStatus("extract")
  const sectioningReady = sectioningStatus.isCompleted
  // "Covered" = already done, running, or queued — it will produce its output
  // without us starting it, so we can queue Storyboard behind it instead of
  // pulling it into the run.
  const extractCovered = extractStatus.isCompleted || extractStatus.isRunning
  const sectioningCovered =
    sectioningStatus.isCompleted || sectioningStatus.isRunning
  const upstreamCovered = extractCovered && sectioningCovered

  const [defaultRenderStrategy, setDefaultRenderStrategy] = useState("")
  const [renderStrategyItems, setRenderStrategyItems] = useState<LandingStrategyEntry[]>([])
  const [effort, setEffort] = useState<EffortKey>("medium")
  const [activityMode, setActivityMode] = useState<ActivityModeKey>("dynamic")
  const [hoveredStrategy, setHoveredStrategy] = useState<string | null>(null)

  const hasActiveActivities = useMemo(() => {
    if (!activeConfigData) return false
    const m = activeConfigData.merged as Record<string, unknown>
    const sectionTypes = (m.section_types ?? {}) as Record<string, unknown>
    const strategies = (m.render_strategies ?? {}) as Record<
      string,
      { render_type?: string }
    >
    const disabled = new Set(
      Array.isArray(m.disabled_section_types)
        ? (m.disabled_section_types as string[])
        : [],
    )
    const names = new Set<string>()
    for (const key of Object.keys(sectionTypes)) {
      if (key.startsWith("activity_")) names.add(key)
    }
    for (const [name, strat] of Object.entries(strategies)) {
      if (strat?.render_type === "activity") names.add(name)
    }
    return Array.from(names).some((name) => !disabled.has(name))
  }, [activeConfigData])

  useEffect(() => {
    if (!activeConfigData) return
    const m = activeConfigData.merged as Record<string, unknown>
    const strategies = (
      m.render_strategies && typeof m.render_strategies === "object"
        ? m.render_strategies
        : {}
    ) as Record<string, { render_type?: string }>
    const normalized = normalizeDefaultRenderStrategy(
      typeof m.default_render_strategy === "string" ? m.default_render_strategy : "",
      strategies,
    )
    setDefaultRenderStrategy(normalized)
    const selectable = new Set(listDefaultRenderStrategies(strategies))
    setRenderStrategyItems(
      LANDING_STRATEGY_ITEMS.filter(
        (item) => item.comingSoon || selectable.has(item.id),
      ),
    )
    if (m.storyboard_effort === "high" || m.storyboard_effort === "medium" || m.storyboard_effort === "relaxed") {
      setEffort(m.storyboard_effort)
    }
    if (
      m.storyboard_activity_mode === "dynamic" ||
      m.storyboard_activity_mode === "match_source" ||
      m.storyboard_activity_mode === "template"
    ) {
      setActivityMode(m.storyboard_activity_mode)
    }
  }, [activeConfigData])

  const handleStrategyChange = (value: string) => {
    setDefaultRenderStrategy(value)
    setHoveredStrategy(null)
    persist({ default_render_strategy: value })
  }

  const previewStrategy = hoveredStrategy ?? defaultRenderStrategy ?? "llm"

  const handleEffortChange = (value: EffortKey) => {
    setEffort(value)
    persist({ storyboard_effort: value })
  }

  const handleActivityModeChange = (value: ActivityModeKey) => {
    setActivityMode(value)
    persist({ storyboard_activity_mode: value })
  }

  const handleRun = () => {
    if (!hasApiKey || status.isRunning) return
    // Cue from here even if upstream stages haven't run. Queue from the first
    // upstream stage that isn't already covered (done/running/queued) so we
    // never try to re-run a stage that's mid-flight.
    const fromStage = !extractCovered
      ? "extract"
      : !sectioningCovered
        ? "sectioning"
        : "storyboard"
    queueRun({ fromStage, toStage: "storyboard", apiKey, viewAfter: true })
  }

  const isAi = AI_STRATEGIES.has(defaultRenderStrategy)

  const effortOptions = useMemo(
    () => [
      { value: "relaxed" as const, label: t`Relaxed`, icon: <SignalBars level={1} /> },
      { value: "medium" as const, label: t`Medium`, icon: <SignalBars level={2} /> },
      { value: "high" as const, label: t`High`, icon: <SignalBars level={3} /> },
    ],
    [t],
  )

  const activeActivityMode = ACTIVITY_MODE_OPTIONS.find(
    (option) => option.id === activityMode,
  )

  const disabledReason = !hasApiKey ? (
    <Trans>Add an API key in Book settings to run storyboard.</Trans>
  ) : undefined

  return (
    <LandingPageShell
      bookLabel={bookLabel}
      stageSlug="storyboard"
      settingsTab="general"
      colorClass="bg-violet-600 hover:bg-violet-700"
      accentColor="#7c3aed"
      accentColorSoft="#ede9fe"
      isRunning={status.isRunning}
      isCompleted={status.isCompleted}
      hasError={status.hasError}
      canRun={true}
      extraDisabled={!hasApiKey}
      disabledReason={disabledReason}
      runLabel={<Trans>Run Storyboard</Trans>}
      rerunLabel={<Trans>Re-run</Trans>}
      previewLabel={t`Storyboard Preview`}
      onRun={handleRun}
      preview={<StoryboardPreview strategy={previewStrategy} />}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
          <Trans>Storyboard</Trans>
        </h1>
        <p className="text-[14px] text-[#737373] leading-relaxed">
          <Trans>
            Render each typed section into an interactive HTML page. Pick a
            layout strategy that matches the book and let storyboard handle
            the rest.
          </Trans>
        </p>
      </div>

      {sectioningReady ? (
        <CascadeWarning stageSlug="storyboard" />
      ) : !upstreamCovered ? (
        <LandingPageWarning
          variant="prereq"
          title={<Trans>Earlier stages haven't run yet</Trans>}
          description={
            <Trans>
              Running Storyboard will run the earlier core stages it depends on
              first, then render the typed sections.
            </Trans>
          }
        />
      ) : null}

      <SettingsCard>
        <SettingsField
          label={<Trans>Render Strategy</Trans>}
          labelAction={
            <SettingExplainer
              visual={<RenderStrategyVisual />}
              accentColor="#7c3aed"
              accentColorSoft="#ede9fe"
            />
          }
          hint={
            <Trans>
              Sets the default layout used when a section has no specific
              strategy assigned.
            </Trans>
          }
          htmlFor="storyboard-render-strategy"
        >
          <Select
            value={defaultRenderStrategy}
            onValueChange={handleStrategyChange}
            onOpenChange={(open) => {
              if (!open) setHoveredStrategy(null)
            }}
          >
            <SelectTrigger
              id="storyboard-render-strategy"
              className="h-10 w-full"
            >
              <SelectValue placeholder={t`Select strategy...`}>
                {defaultRenderStrategy ? (
                  <span className="flex items-center gap-2">
                    <StrategyIcon id={defaultRenderStrategy} />
                    {strategyDisplayName(defaultRenderStrategy)}
                  </span>
                ) : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              align="start"
              className="w-[var(--radix-select-trigger-width)] min-w-[320px]"
            >
              {renderStrategyItems.map((item) => {
                const Icon = STRATEGY_ICONS[item.id] ?? AlignLeft
                return (
                  <RichSelectItem
                    key={item.id}
                    value={item.id}
                    Icon={Icon}
                    label={strategyDisplayName(item.id)}
                    description={linguiI18n._(item.description)}
                    disabled={item.comingSoon}
                    onMouseEnter={() => {
                      if (!item.comingSoon) setHoveredStrategy(item.id)
                    }}
                    onFocus={() => {
                      if (!item.comingSoon) setHoveredStrategy(item.id)
                    }}
                    trailing={
                      item.comingSoon ? (
                        <span className="ml-auto inline-flex items-center gap-1 text-[9.5px] font-medium uppercase tracking-wider text-[#a3a3a3]">
                          <span
                            className="h-1 w-1 rounded-full bg-[#d4d4d4]"
                            aria-hidden
                          />
                          <Trans>Coming soon</Trans>
                        </span>
                      ) : undefined
                    }
                  />
                )
              })}
            </SelectContent>
          </Select>
        </SettingsField>

        <CollapsibleField shown={isAi && SHOW_EFFORT_FIELD}>
          <SettingsField
            label={<Trans>Effort</Trans>}
            hint={
              effort === "high" ? (
                <Trans>
                  Tries hard to match the original book design.
                </Trans>
              ) : effort === "medium" ? (
                <Trans>
                  Matches the original book design with some flexibility.
                </Trans>
              ) : (
                <Trans>
                  Takes liberties and produces something similar.
                </Trans>
              )
            }
          >
            <SegmentedControl
              options={effortOptions}
              value={effort}
              onValueChange={handleEffortChange}
            />
          </SettingsField>
        </CollapsibleField>
      </SettingsCard>

      {/* {hasActiveActivities && (  disabled while we dont have the activities section */}
      { false && (
        <SettingsCard>
          <SettingsField
            label={<Trans>Activity Types</Trans>}
            hint={<Trans>How activities are rendered in each section.</Trans>}
            htmlFor="storyboard-activity-mode"
          >
            <Select
              value={activityMode}
              onValueChange={handleActivityModeChange}
            >
              <SelectTrigger
                id="storyboard-activity-mode"
                className="h-10 w-full"
              >
                <SelectValue placeholder={t`Select activity mode...`}>
                  {activeActivityMode && (
                    <span className="flex items-center gap-2">
                      {(() => {
                        const Icon = activeActivityMode!.Icon
                        return (
                          <Icon
                            className="h-4 w-4 shrink-0 text-[#525252]"
                            strokeWidth={1.75}
                            aria-hidden
                          />
                        )
                      })()}
                      {linguiI18n._(activeActivityMode!.label)}
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                align="start"
                className="w-[var(--radix-select-trigger-width)] min-w-[320px]"
              >
                {ACTIVITY_MODE_OPTIONS.map((option) => (
                  <RichSelectItem
                    key={option.id}
                    value={option.id}
                    Icon={option.Icon}
                    label={linguiI18n._(option.label)}
                    description={linguiI18n._(option.description)}
                  />
                ))}
              </SelectContent>
            </Select>
          </SettingsField>
        </SettingsCard>
      )}
    </LandingPageShell>
  )
}

function RichSelectItem({
  value,
  Icon,
  label,
  description,
  disabled,
  trailing,
  onMouseEnter,
  onFocus,
}: {
  value: string
  Icon: ComponentType<SVGProps<SVGSVGElement> & { className?: string }>
  label: ReactNode
  description: ReactNode
  disabled?: boolean
  trailing?: ReactNode
  onMouseEnter?: () => void
  onFocus?: () => void
}) {
  return (
    <SelectPrimitive.Item
      value={value}
      disabled={disabled}
      onMouseEnter={onMouseEnter}
      onFocus={onFocus}
      className="relative flex w-full cursor-default select-none items-start rounded-sm py-2 pl-8 pr-3 outline-none focus:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
    >
      <span className="absolute left-2 top-2.5 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4 text-[var(--accent-color,#525252)]" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <Icon
        className="mt-0.5 mr-2.5 h-4 w-4 shrink-0 text-[#525252]"
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <SelectPrimitive.ItemText asChild>
            <span className="text-sm font-medium leading-tight text-[#0a0a0a]">
              {label}
            </span>
          </SelectPrimitive.ItemText>
          {trailing}
        </span>
        <span className="text-[12px] leading-snug text-[#737373]">
          {description}
        </span>
      </span>
    </SelectPrimitive.Item>
  )
}

function StrategyIcon({ id }: { id: string }) {
  const Icon = STRATEGY_ICONS[id]
  if (!Icon) return null
  return (
    <Icon
      className="h-4 w-4 shrink-0 text-[#525252]"
      strokeWidth={1.75}
      aria-hidden
    />
  )
}

function CollapsibleField({
  shown,
  children,
}: {
  shown: boolean
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity,margin] duration-300 ease-out motion-reduce:transition-none",
        shown
          ? "grid-rows-[1fr] opacity-100"
          : "-my-2.5 grid-rows-[0fr] opacity-0",
      )}
      aria-hidden={!shown}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}


function SignalBars({ level }: { level: 1 | 2 | 3 }) {
  const heights = ["4px", "7px", "10px"] as const
  return (
    <span className="inline-flex items-end gap-[2px]" style={{ height: 10 }}>
      {heights.map((h, i) => (
        <span
          key={i}
          className="block w-[3px] rounded-[1px] bg-current"
          style={{ height: h, opacity: i < level ? 1 : 0.25 }}
        />
      ))}
    </span>
  )
}

