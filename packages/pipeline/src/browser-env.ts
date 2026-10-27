/**
 * Playwright launches Chromium as a child process. Page JavaScript cannot read
 * this environment, but removing credential-like variables limits exposure if
 * a renderer is compromised and in Chromium crash reports or child processes.
 * This helper covers Playwright launches only; Electron BrowserWindow paths are
 * separate.
 */
const SECRET_ENV_KEY = /(?:^|_)(?:TOKEN|SECRET|PASSWORD|ACCESS_KEY|KEY|SPEECH_REGION)$/i

export function buildBrowserChildEnv(
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && !SECRET_ENV_KEY.test(key)) {
      env[key] = value
    }
  }
  return env
}
