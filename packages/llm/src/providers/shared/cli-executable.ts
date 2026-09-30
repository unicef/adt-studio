import { statSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"

export interface CliExecutableProbe {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDir?: string
  fileExists?: (path: string) => boolean
}

export interface CliExecutableSpec {
  /** Bare command name, e.g. "codex"; Windows looks for `<name>.exe` only. */
  name: string
  /** Absolute directories tried after PATH, per platform. */
  knownDirs: (home: string, platform: NodeJS.Platform) => string[]
  /** Last-resort absolute paths (e.g. a CLI bundled inside another app), per platform. */
  extraCandidates?: (home: string, platform: NodeJS.Platform) => string[]
}

/** A real file, not a directory that happens to carry the command's name. */
export function isExecutableFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

/**
 * Locate a locally installed CLI. GUI-launched apps (the desktop build) see a
 * minimal PATH, so after PATH the provider's known install locations are tried,
 * then any bundled fallbacks. Windows looks for `<name>.exe` only: the CLI is
 * spawned without a shell, which cannot start the `.cmd` shims npm global
 * installs create.
 */
export function findCliExecutable(
  spec: CliExecutableSpec,
  probe: CliExecutableProbe = {},
): string | undefined {
  const env = probe.env ?? process.env
  const platform = probe.platform ?? process.platform
  const fileExists = probe.fileExists ?? isExecutableFile
  const home = probe.homeDir?.trim() || homedir()

  const names = platform === "win32" ? [`${spec.name}.exe`] : [spec.name]
  const pathDirs = (env.PATH ?? env.Path ?? "").split(delimiter).filter(Boolean)

  for (const dir of [...pathDirs, ...spec.knownDirs(home, platform)]) {
    for (const name of names) {
      const candidate = join(dir, name)
      if (fileExists(candidate)) return candidate
    }
  }
  for (const candidate of spec.extraCandidates?.(home, platform) ?? []) {
    if (fileExists(candidate)) return candidate
  }
  return undefined
}

/**
 * An explicit `<ENV_VAR>` override wins unconditionally (its existence is the
 * operator's responsibility); otherwise the CLI is discovered.
 */
export function resolveCliExecutable(
  envVar: string,
  spec: CliExecutableSpec,
  probe: CliExecutableProbe = {},
): string | undefined {
  const env = probe.env ?? process.env
  const explicit = env[envVar]?.trim()
  if (explicit) return explicit
  return findCliExecutable(spec, probe)
}

/** The install locations both CLI providers share: native installer, Homebrew, /usr/local. */
export function commonCliDirs(home: string, platform: NodeJS.Platform): string[] {
  return platform === "win32"
    ? [join(home, ".local", "bin")]
    : [join(home, ".local", "bin"), "/usr/local/bin", "/opt/homebrew/bin"]
}
