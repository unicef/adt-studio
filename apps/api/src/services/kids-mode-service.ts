import fs from "node:fs"
import path from "node:path"
import {
  KIDS_BUDDY_IDS,
  KidsModeConfigSchema,
  KidsVoicesFileSchema,
  type KidsModeConfig,
  type KidsVoicesFile,
} from "@adt/types"

const KIDS_MODE_CONFIG_FILE = "kids-mode.json"
const KIDS_VOICES_CONFIG_FILE = "kids-voices.json"

export function readKidsModeConfig(bookDir: string): KidsModeConfig {
  const file = path.join(bookDir, KIDS_MODE_CONFIG_FILE)
  const fallback: KidsModeConfig = {
    enabled: false,
    buddies: [...KIDS_BUDDY_IDS],
  }
  if (!fs.existsSync(file)) return fallback
  try {
    const parsed = KidsModeConfigSchema.safeParse(
      JSON.parse(fs.readFileSync(file, "utf8")),
    )
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

export function writeKidsModeConfig(
  bookDir: string,
  config: KidsModeConfig,
): void {
  fs.writeFileSync(
    path.join(bookDir, KIDS_MODE_CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
  )
}

export function readKidsVoicesConfig(bookDir: string): KidsVoicesFile {
  const file = path.join(bookDir, KIDS_VOICES_CONFIG_FILE)
  const fallback: KidsVoicesFile = { overrides: {} }
  if (!fs.existsSync(file)) return fallback
  try {
    const parsed = KidsVoicesFileSchema.safeParse(
      JSON.parse(fs.readFileSync(file, "utf8")),
    )
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

export function writeKidsVoicesConfig(
  bookDir: string,
  config: KidsVoicesFile,
): void {
  fs.writeFileSync(
    path.join(bookDir, KIDS_VOICES_CONFIG_FILE),
    `${JSON.stringify(config, null, 2)}\n`,
  )
}
