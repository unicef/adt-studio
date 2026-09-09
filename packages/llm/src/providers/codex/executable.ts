import { join } from "node:path"
import {
  commonCliDirs,
  findCliExecutable,
  resolveCliExecutable,
  type CliExecutableProbe,
} from "../shared/cli-executable.js"

export type CodexExecutableProbe = CliExecutableProbe

export const CODEX_CLI_INSTALL_HINT =
  "Install the Codex CLI (npm install -g @openai/codex) or the ChatGPT desktop app and sign in (from Settings → Providers or with `codex login`), or set CODEX_EXECUTABLE to the executable's full path."

export const MISSING_CODEX_CLI_MESSAGE = `Codex CLI not found on this machine. ${CODEX_CLI_INSTALL_HINT}`

/** The ChatGPT desktop app for macOS ships a full Codex CLI inside its bundle. */
export function chatGptAppCodexPaths(home: string): string[] {
  return [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "codex"),
  ]
}

const CODEX_CLI = {
  name: "codex",
  knownDirs: commonCliDirs,
  // Anyone with the ChatGPT app has Codex without installing anything.
  extraCandidates: (home: string, platform: NodeJS.Platform) =>
    platform === "darwin" ? chatGptAppCodexPaths(home) : [],
}

/** PATH, then the common install locations a GUI app's PATH misses, then the ChatGPT app bundle on macOS. */
export function findCodexExecutable(probe: CodexExecutableProbe = {}): string | undefined {
  return findCliExecutable(CODEX_CLI, probe)
}

/** The explicit CODEX_EXECUTABLE override wins; otherwise a Codex installation is discovered. */
export function resolveCodexExecutable(probe: CodexExecutableProbe = {}): string | undefined {
  return resolveCliExecutable("CODEX_EXECUTABLE", CODEX_CLI, probe)
}
