import type { AppConfig } from "@adt/types"
import { isFixedLayoutBook } from "./fixed-layout-rendering.js"

// Publication binds content-generation inputs, not unrelated output stages or
// scheduling preferences. Keep these projections alongside the generation
// builders when adding a new input to Sectioning or Storyboard.
const common = ["default_model", "base_prompt_model", "editing_language", "output_languages", "start_page", "end_page", "generate_activities"] as const satisfies readonly (keyof AppConfig)[]
const sectioning = [...common, "structure_types", "role_types", "section_types", "pruned_role_types", "pruned_section_types", "disabled_section_types", "page_sectioning", "translation", "book_outline"] as const satisfies readonly (keyof AppConfig)[]
const storyboard = [...common, "default_render_strategy", "render_strategies", "section_render_strategies", "storyboard_effort", "storyboard_activity_mode", "visual_review_prompt", "visual_review_max_iterations", "styleguide", "reflowable_font"] as const satisfies readonly (keyof AppConfig)[]

export function sectioningConfigInputs(config: AppConfig) {
  return { ...Object.fromEntries(sectioning.map(key => [key, config[key]])), fixedLayout: isFixedLayoutBook(config) }
}

export function storyboardConfigInputs(config: AppConfig) {
  return { ...Object.fromEntries(storyboard.map(key => [key, config[key]])), sectioningMode: config.page_sectioning?.mode ?? "dynamic" }
}
