import { DEFAULT_OPENAI_BOOK_OUTLINE_MODEL_ID } from "@adt/pipeline"
import {
  DEFAULT_LLM_MODEL_ID,
  STEP_TASK_MODEL_TARGETS,
  type AppConfig,
  type ReasoningEffort,
  type TaskModelEntry,
} from "@adt/types"

const RENDER_STRATEGY_ID_PREFIX = "render_strategies."

interface StepSettings {
  prompt?: string
  model?: string
  reasoning_effort?: ReasoningEffort
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

export function listTaskModels(config: AppConfig): TaskModelEntry[] {
  const settings = config as Record<string, unknown>
  const steps = STEP_TASK_MODEL_TARGETS.map((target): TaskModelEntry => {
    const step = settings[target.configKey] as StepSettings | undefined
    const promptOverride = target.promptKey ? settings[target.promptKey] : step?.prompt
    return {
      id: target.configKey,
      kind: "step",
      configKey: target.configKey,
      ...(target.step ? { step: target.step } : {}),
      prompts: unique([
        typeof promptOverride === "string" ? promptOverride : target.defaultPrompt,
        ...target.extraPrompts,
      ]),
      model: step?.model ?? null,
      reasoningEffort: step?.reasoning_effort ?? null,
      inheritsFrom: [...(target.inheritsFrom ?? [])],
      defaultModelOverride: target.configKey === "book_outline"
        ? { whenDefaultModel: DEFAULT_LLM_MODEL_ID, model: DEFAULT_OPENAI_BOOK_OUTLINE_MODEL_ID }
        : null,
    }
  })

  const strategies = Object.entries(config.render_strategies ?? {})
    .filter(([, strategy]) => strategy.render_type === "llm" || strategy.render_type === "activity")
    .map(([name, strategy]): TaskModelEntry => {
      const strategyConfig = strategy.config
      return {
        id: `${RENDER_STRATEGY_ID_PREFIX}${name}`,
        kind: "render-strategy",
        configKey: name,
        prompts: unique([strategyConfig?.prompt ?? "web_generation_html", strategyConfig?.answer_prompt]),
        model: strategyConfig?.model ?? null,
        reasoningEffort: strategyConfig?.reasoning_effort ?? null,
        inheritsFrom: [],
        defaultModelOverride: null,
      }
    })

  return [...steps, ...strategies]
}

export function taskConfigPath(task: TaskModelEntry, field: "model" | "reasoning_effort"): string[] {
  return task.kind === "step"
    ? [task.configKey, field]
    : ["render_strategies", task.configKey, "config", field]
}
