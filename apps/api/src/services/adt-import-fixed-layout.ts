import fs from "node:fs"
import path from "node:path"

import yaml from "js-yaml"

/** Section type the fixed-layout renderer and packaging key off. Imported
 * fixed-layout pages carry it so they are indistinguishable downstream from
 * pages this pipeline sectioned itself. */
export const FIXED_LAYOUT_SECTION_TYPE = "fixed-layout-page"

/** Book config that makes `isFixedLayoutBook()` true. Written for imported
 * fixed-layout projects so packaging, font resolution and re-export all take
 * the fixed-layout path; it deliberately says nothing about extraction, which
 * stays unavailable for imported ADTs (there is no source PDF). */
export const FIXED_LAYOUT_CONFIG = {
  render_strategies: { fixed_layout: { render_type: "fixed_layout" } },
  default_render_strategy: "fixed_layout",
} as const


/**
 * Merge the fixed-layout render strategy into an existing book config, leaving
 * every other key (editing language, narration languages, speech settings) as
 * the user left it.
 */
export function applyFixedLayoutBookConfig(bookDir: string): void {
  const configPath = path.join(bookDir, "config.yaml")
  let existing: Record<string, unknown> = {}
  if (fs.existsSync(configPath)) {
    const loaded = yaml.load(fs.readFileSync(configPath, "utf8"))
    if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
      existing = loaded as Record<string, unknown>
    }
  }
  const strategies = existing.render_strategies
  fs.writeFileSync(configPath, yaml.dump({
    ...existing,
    ...FIXED_LAYOUT_CONFIG,
    render_strategies: {
      ...(strategies && typeof strategies === "object" && !Array.isArray(strategies)
        ? strategies
        : {}),
      ...FIXED_LAYOUT_CONFIG.render_strategies,
    },
  }))
}

