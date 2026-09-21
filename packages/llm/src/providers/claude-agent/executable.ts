import {
  commonCliDirs,
  findCliExecutable,
  resolveCliExecutable,
  type CliExecutableProbe,
} from "../shared/cli-executable.js"

export type ClaudeAgentExecutableProbe = CliExecutableProbe

export const MISSING_CLAUDE_CLI_MESSAGE =
  "Claude Code CLI not found on this machine. Install Claude Code, or set CLAUDE_AGENT_EXECUTABLE to the executable's full path."

const CLAUDE_CLI = { name: "claude", knownDirs: commonCliDirs }

/** PATH, then Claude Code's native installer location (`~/.local/bin`) and the usual package-manager dirs. */
export function findClaudeAgentExecutable(
  probe: ClaudeAgentExecutableProbe = {},
): string | undefined {
  return findCliExecutable(CLAUDE_CLI, probe)
}

/** The explicit CLAUDE_AGENT_EXECUTABLE override wins; otherwise a Claude Code installation is discovered. */
export function resolveClaudeAgentExecutable(
  probe: ClaudeAgentExecutableProbe = {},
): string | undefined {
  return resolveCliExecutable("CLAUDE_AGENT_EXECUTABLE", CLAUDE_CLI, probe)
}
