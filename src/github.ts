// Talking to GitHub as the App: webhook signatures, the App's JWT, installation
// tokens and API calls. Web Crypto and fetch only, no dependencies.

export type AppEnv = { APP_ID: string; APP_PRIVATE_KEY: string }

// GitHub signs every delivery with the webhook secret (HMAC SHA-256); anything
// without a valid signature did not come from GitHub.
export async function verifySignature(secret: string, body: string, signature: string | null) {
  if (!secret || !signature?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const bytes = new Uint8Array(signature.slice(7).match(/../g)?.map((h) => parseInt(h, 16)) ?? [])
  return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(body))
}

// A short-lived JWT signed with the App's private key: proves we are the App.
// The key must be PKCS#8 ("BEGIN PRIVATE KEY"); GitHub's download is PKCS#1,
// converted once with `openssl pkcs8 -topk8 -nocrypt` (see the README).
export async function appJwt(env: AppEnv) {
  const now = Math.floor(Date.now() / 1000)
  const part = (o: unknown) => base64url(new TextEncoder().encode(JSON.stringify(o)))
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iat: now - 60, exp: now + 540, iss: env.APP_ID })}`
  const der = Uint8Array.from(atob(env.APP_PRIVATE_KEY.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)))
  return `${unsigned}.${base64url(signature)}`
}

// A token for one installation of the App: valid for an hour, with only the
// permissions the App was given, on only the repos it was installed on.
export async function installationToken(env: AppEnv, installation: number) {
  const res = (await api(await appJwt(env), 'POST', `/app/installations/${installation}/access_tokens`)) as { token: string }
  return res.token
}

// GitHub sometimes fails for a moment (502, 503, 504), rate-limits (429), or
// drops the connection. Those are retried, a few times with a growing pause;
// any other error is final. Retrying is safe for everything the bot does except
// creating a comment, which `postComment` guards against posting twice.
export const RETRY_DELAYS_MS = [500, 1500, 4000]
const TRANSIENT = new Set([429, 502, 503, 504])

export class GitHubError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message)
  }
  get transient() {
    return this.status === null || TRANSIENT.has(this.status)
  }
}

export async function api(token: string, method: string, path: string, body?: unknown, opts: { retry?: boolean } = {}): Promise<any> {
  const delays = opts.retry === false ? [] : RETRY_DELAYS_MS
  for (let attempt = 0; ; attempt++) {
    try {
      return await request(token, method, path, body)
    } catch (err) {
      const e = err instanceof GitHubError ? err : new GitHubError(`${method} ${path}: ${(err as Error).message}`, null)
      if (!e.transient || attempt >= delays.length) throw e
      console.warn(`${e.message.slice(0, 120)}; retrying (${attempt + 1}/${delays.length})`)
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }
  }
}

async function request(token: string, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'adt-backlog-wizard',
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new GitHubError(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`, res.status)
  // Webhook delivery ids do not fit in a JS number: keep long ids as strings.
  const json = text ? JSON.parse(text.replace(/"id":(\d{16,})/g, '"id":"$1"')) : null
  if (json?.errors?.length) throw new GitHubError(`${path}: ${json.errors.map((e: { message: string }) => e.message).join('; ')}`, res.status)
  return json
}

// A 502 can mean GitHub created the comment but failed to say so; posting it
// again would leave two. So after a transient failure, look for it first.
export async function postComment(token: string, issuePath: string, body: string, author: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api(token, 'POST', `${issuePath}/comments`, { body }, { retry: false })
    } catch (err) {
      if (!(err instanceof GitHubError) || !err.transient || attempt >= RETRY_DELAYS_MS.length) throw err
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
      const recent = (await api(token, 'GET', `${issuePath}/comments?per_page=10&sort=created&direction=desc`)) as { body: string; user: { login: string } | null }[]
      const posted = recent.find((c) => c.user?.login === author && c.body === body)
      if (posted) return posted
      console.warn(`POST ${issuePath}/comments failed (${err.status}) and the comment is not there; posting again`)
    }
  }
}

export async function graphql(token: string, query: string, variables: Record<string, unknown>) {
  return (await api(token, 'POST', '/graphql', { query, variables })).data
}

function base64url(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
