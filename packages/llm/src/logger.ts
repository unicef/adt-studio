export type LogLevel = "silent" | "error" | "info"

const PRIORITY: Record<LogLevel, number> = { silent: 0, error: 1, info: 2 }

export interface Logger {
  info: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export function createLogger(level: LogLevel = "info"): Logger {
  const p = PRIORITY[level]
  return {
    info: (...args: unknown[]) => { if (p >= 2) console.log(...args) },
    error: (...args: unknown[]) => { if (p >= 1) console.error(...args) },
  }
}
