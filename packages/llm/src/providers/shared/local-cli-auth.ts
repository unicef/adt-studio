import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export interface LocalCliAuthProbe {
  env?: NodeJS.ProcessEnv
  homeDir?: string
  fileExists?: (path: string) => boolean
  platform?: NodeJS.Platform
  /** Injected by tests; production spawns `security` (darwin only). */
  keychainHasItem?: (service: string) => boolean
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

const CLAUDE_KEYCHAIN_SERVICE = "Claude Code-credentials"

/**
 * Existence only, like the file probe: without `-w` the `security` tool prints
 * item metadata, never the secret, and a zero exit status means the item is
 * there. The CLI owns reading and refreshing the credential itself.
 */
function keychainHasGenericPassword(service: string): boolean {
  try {
    const result = spawnSync("security", ["find-generic-password", "-s", service], {
      stdio: "ignore",
      timeout: 3_000,
    })
    return result.status === 0
  } catch {
    return false
  }
}

/**
 * Whether this machine has a Claude Code login. On macOS the CLI stores its
 * OAuth credentials in the login Keychain rather than `.credentials.json`
 * (the file store used on Linux/Windows/WSL), so a file-only probe reports a
 * perfectly logged-in Mac as logged out.
 */
export function hasClaudeCliLogin(probe: LocalCliAuthProbe = {}): boolean {
  if (hasLocalCliLogin(claudeCliCredentialPaths(probe), probe)) return true
  const platform = probe.platform ?? process.platform
  if (platform !== "darwin") return false
  return (probe.keychainHasItem ?? keychainHasGenericPassword)(CLAUDE_KEYCHAIN_SERVICE)
}
