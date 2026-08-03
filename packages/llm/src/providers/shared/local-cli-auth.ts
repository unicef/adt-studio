import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export interface LocalCliAuthProbe {
  env?: NodeJS.ProcessEnv
  homeDir?: string
  fileExists?: (path: string) => boolean
}

function resolveHomeDir(probe: LocalCliAuthProbe): string {
  return probe.homeDir?.trim() || homedir()
}

export function claudeCliCredentialPaths(probe: LocalCliAuthProbe = {}): string[] {
  const env = probe.env ?? process.env
  const configDir = env.CLAUDE_CONFIG_DIR?.trim()
  return [
    ...(configDir ? [join(configDir, ".credentials.json")] : []),
    join(resolveHomeDir(probe), ".claude", ".credentials.json"),
  ]
}

export function codexCliCredentialPaths(probe: LocalCliAuthProbe = {}): string[] {
  const env = probe.env ?? process.env
  const codexHome = env.CODEX_HOME?.trim()
  return [
    codexHome
      ? join(codexHome, "auth.json")
      : join(resolveHomeDir(probe), ".codex", "auth.json"),
  ]
}

/**
 * Existence only. These files hold live OAuth tokens, so they are never opened —
 * the CLI owns reading, refreshing and rotating them. The result feeds error
 * messages, never an authentication decision.
 */
export function hasLocalCliLogin(
  paths: readonly string[],
  probe: LocalCliAuthProbe = {},
): boolean {
  const fileExists = probe.fileExists ?? existsSync
  return paths.some((path) => fileExists(path))
}
