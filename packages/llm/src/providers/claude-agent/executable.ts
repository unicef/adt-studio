import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"

export interface ClaudeAgentExecutableProbe {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDir?: string
  fileExists?: (path: string) => boolean
}

export const MISSING_CLAUDE_CLI_MESSAGE =
  "Claude Code CLI not found on this machine. Install Claude Code, or set CLAUDE_AGENT_EXECUTABLE to the executable's full path."

/**
 * Windows looks for `claude.exe` only: the CLI is spawned without a shell,
 * which cannot start the `claude.cmd` shims npm global installs create.
 * The `.local/bin` fallback covers Claude Code's native installer location,
 * which GUI-launched apps often miss because it enters PATH via shell profiles.
 */
export function findClaudeAgentExecutable(
  probe: ClaudeAgentExecutableProbe = {},
): string | undefined {
  const env = probe.env ?? process.env
  const platform = probe.platform ?? process.platform
  const fileExists = probe.fileExists ?? existsSync
  const home = probe.homeDir?.trim() || homedir()

  const names = platform === "win32" ? ["claude.exe"] : ["claude"]
  const pathDirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)
  const knownDirs =
    platform === "win32"
      ? [join(home, ".local", "bin")]
      : [join(home, ".local", "bin"), "/usr/local/bin", "/opt/homebrew/bin"]

  for (const dir of [...pathDirs, ...knownDirs]) {
    for (const name of names) {
      const candidate = join(dir, name)
      if (fileExists(candidate)) return candidate
    }
  }
  return undefined
}

/**
 * The explicit CLAUDE_AGENT_EXECUTABLE override wins unconditionally (its
 * existence is the operator's responsibility, matching CODEX_EXECUTABLE);
 * otherwise a Claude Code installation is discovered on the machine.
 */
export function resolveClaudeAgentExecutable(
  probe: ClaudeAgentExecutableProbe = {},
): string | undefined {
  const env = probe.env ?? process.env
  const explicit = env.CLAUDE_AGENT_EXECUTABLE?.trim()
  if (explicit) return explicit
  return findClaudeAgentExecutable(probe)
}
