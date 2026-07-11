export interface WorkspaceConfig {
  accountId: string
  d1DatabaseId: string
  r2BucketName: string
  teacherId: string
  connectedAt: string
}

const KEY = "adt_teacher_workspace"
const CLIENT_ID = import.meta.env.VITE_CLOUDFLARE_OAUTH_CLIENT_ID ?? "bf042bdb8de5fae03d9b02b41d0b9d18"
const REDIRECT_URI = `${window.location.origin}/workspace/callback`
const AUTH_URL = "https://dash.cloudflare.com/oauth2/auth"
const TOKEN_URL = "https://dash.cloudflare.com/oauth2/token"
const USERINFO_URL = "https://dash.cloudflare.com/oauth2/userinfo"

export function getWorkspace(): WorkspaceConfig | null {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) as WorkspaceConfig : null } catch { return null }
}
export function connectWorkspace(config: WorkspaceConfig): void { localStorage.setItem(KEY, JSON.stringify(config)) }
export function disconnectWorkspace(): void { localStorage.removeItem(KEY); sessionStorage.removeItem("adt.cloudflare.access-token") }
export function getTeacherId(): string | null { return getWorkspace()?.teacherId ?? null }

function base64Url(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") }
async function challenge(verifier: string): Promise<string> { return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))) }
export async function beginCloudflareLogin(): Promise<void> {
  const state = crypto.randomUUID(); const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  sessionStorage.setItem("adt.cloudflare.oauth-state", state); sessionStorage.setItem("adt.cloudflare.pkce-verifier", verifier)
  const query = new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: "openid profile email", state, code_challenge: await challenge(verifier), code_challenge_method: "S256" })
  window.location.assign(`${AUTH_URL}?${query.toString()}`)
}
export async function completeCloudflareLogin(search: string): Promise<{ teacherId: string }> {
  const params = new URLSearchParams(search); const code = params.get("code"), state = params.get("state"), verifier = sessionStorage.getItem("adt.cloudflare.pkce-verifier")
  if (!code || !state || state !== sessionStorage.getItem("adt.cloudflare.oauth-state") || !verifier) throw new Error("The Cloudflare sign-in response could not be verified.")
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: CLIENT_ID, code, redirect_uri: REDIRECT_URI, code_verifier: verifier }) })
  if (!response.ok) throw new Error("Cloudflare could not complete the sign-in request.")
  const token = await response.json() as { access_token: string }
  sessionStorage.setItem("adt.cloudflare.access-token", token.access_token); sessionStorage.removeItem("adt.cloudflare.oauth-state"); sessionStorage.removeItem("adt.cloudflare.pkce-verifier")
  const profile = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${token.access_token}` } })
  if (!profile.ok) throw new Error("Cloudflare sign-in succeeded but profile retrieval failed.")
  const claims = await profile.json() as { sub?: string }
  if (!claims.sub) throw new Error("Cloudflare did not provide a user identity.")
  return { teacherId: claims.sub }
}
