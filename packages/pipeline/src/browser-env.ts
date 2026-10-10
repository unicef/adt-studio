/**
 * Chromium does not need provider credentials. Keep them out of its inherited
 * environment so a browser child cannot expose server secrets to page content
 * or a renderer running for another request.
 */
const SECRET_ENV_KEY = /(?:^|_)(?:API_KEY|API_TOKEN|AUTH_TOKEN|SPEECH_KEY|SPEECH_REGION)$/

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
