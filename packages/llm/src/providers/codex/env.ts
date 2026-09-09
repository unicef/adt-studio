/** The CLI prefers either of these over its own login, so only a resolved credential may set one. */
export const CLI_CREDENTIAL_ENV_KEYS = ["CODEX_API_KEY", "OPENAI_API_KEY"] as const

/**
 * The child gets an explicit environment, so `process.env` is spread in for
 * PATH/HOME and `CODEX_HOME`. Credential variables are dropped first: with a
 * resolved key that key is the one that must be billed, and without one the
 * CLI's own login is the sanctioned fallback — an ambient key nobody configured
 * here must not bill a third party.
 */
export function buildCodexEnv(apiKey: string | undefined): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value
  }
  for (const key of CLI_CREDENTIAL_ENV_KEYS) delete env[key]
  if (apiKey) env.CODEX_API_KEY = apiKey
  return env
}
