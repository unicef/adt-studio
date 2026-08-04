import type { Context } from "hono"
import { getCookie, setCookie } from "hono/cookie"
import {
  COMMENTER_SESSION_COOKIE,
  COMMENTER_SESSION_MAX_AGE_SECONDS,
  type CommenterSession,
} from "@adt/types"
import type { Env } from "./env.js"
import {
  commenterColor,
  hashPin,
  nameKey,
  sessionCookieValue,
  sessionIdFromCookie,
} from "./identity.js"
import type { PublicationVariables } from "./middleware/publication-lookup.js"
import type { PublicationStore, StoredCommenterSession } from "./store.js"

/**
 * Commenter-session mechanics, shared by the two doors that mint one: `POST /p/:token/session`
 * (the reader's composer, when there is no access code to pass) and `POST /p/:token/access`
 * (the gate, which collects the visitor's name on the way in). Both must behave identically —
 * a returning visitor is renamed, never duplicated — so the rule lives here once.
 */

export type SessionAppEnv = { Bindings: Env; Variables: PublicationVariables }

type SessionContext = Context<SessionAppEnv>

export interface SessionDeps {
  resolveStore: (env: Env) => PublicationStore
  timestamp: () => string
  newId: () => string
}

export function commenterOf(session: StoredCommenterSession): CommenterSession {
  return { id: session.id, name: session.name, color: session.color, is_author: false }
}

/** A cookie can only ever carry a commenter: `is_author` rows are reachable through
 *  `MGMT_SECRET` alone, because `session_id` is public in every comment payload. */
export async function storedCommenterFromCookie(
  c: SessionContext,
  store: PublicationStore,
  token: string,
): Promise<StoredCommenterSession | null> {
  const secret = c.env?.MGMT_SECRET
  const cookie = getCookie(c, COMMENTER_SESSION_COOKIE)
  if (!secret || cookie === undefined) return null

  const sessionId = await sessionIdFromCookie(cookie, secret)
  if (sessionId === null) return null

  const session = await store.findSession(sessionId)
  if (!session || session.token !== token || session.is_author) return null

  return session
}

export async function commenterFromCookie(
  c: SessionContext,
  store: PublicationStore,
  token: string,
): Promise<CommenterSession | null> {
  const session = await storedCommenterFromCookie(c, store, token)
  return session ? commenterOf(session) : null
}

export async function issueSessionCookie(
  c: SessionContext,
  token: string,
  sessionId: string,
  secret: string,
): Promise<void> {
  setCookie(c, COMMENTER_SESSION_COOKIE, await sessionCookieValue(sessionId, secret), {
    path: `/p/${token}`,
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: COMMENTER_SESSION_MAX_AGE_SECONDS,
  })
}

/** Name reservation shrank in M3.5 to **sessions that set a PIN**, and only those.
 *
 *  The access code now gates who reaches the book at all, so a name is no longer a scarce
 *  resource to be defended against strangers: two invited Marias must both be able to
 *  comment. A PIN is different — it is a lookup key, and two pinned Marias would make a
 *  claim ambiguous — so pinned names still reserve, exactly as in M2.5. Author rows never
 *  reserve: the author's display name is a Studio-side label, not a claimable identity. */
export async function pinnedHolderOf(
  store: PublicationStore,
  token: string,
  name: string,
  exceptSessionId: string | null,
): Promise<StoredCommenterSession | null> {
  const key = nameKey(name)
  const sessions = await store.listCommenterSessions(token)
  return (
    sessions.find(
      (session) =>
        session.id !== exceptSessionId && session.pin !== null && nameKey(session.name) === key,
    ) ?? null
  )
}

export type CommenterSessionOutcome =
  | { ok: true; session: CommenterSession }
  | { ok: false; takenBy: string }

export interface UpsertCommenterSessionInput {
  store: PublicationStore
  deps: SessionDeps
  token: string
  name: string
  pin?: string
  /** The session the request already carries, if any — the difference between a rename and a
   *  second identity for the same person. */
  existing: StoredCommenterSession | null
}

/**
 * The one place a commenter identity is created or renamed. An existing session is renamed in
 * place, keeping its id, its color and every pin it has already dropped; only a request with no
 * usable session cookie creates a row.
 */
export async function upsertCommenterSession({
  store,
  deps,
  token,
  name,
  pin,
  existing,
}: UpsertCommenterSessionInput): Promise<CommenterSessionOutcome> {
  /** Only a session that will *have* a PIN can collide, and only with another pinned one. */
  const willHavePin = pin !== undefined || (existing?.pin ?? null) !== null
  if (willHavePin) {
    const taken = await pinnedHolderOf(store, token, name, existing?.id ?? null)
    if (taken) return { ok: false, takenBy: taken.name }
  }

  if (existing) {
    /** Narrowed by hand: `existing` carries the stored `pin`, and the response body is
     *  serialised from whatever object lands here. */
    let session: CommenterSession =
      (await store.renameSession(existing.id, name)) ?? commenterOf(existing)
    if (pin !== undefined) {
      session = (await store.setSessionPin(existing.id, await hashPin(pin))) ?? session
    }
    return { ok: true, session }
  }

  return {
    ok: true,
    session: await store.createSession({
      id: deps.newId(),
      token,
      name,
      color: commenterColor(await store.countCommenterSessions(token)),
      isAuthor: false,
      createdAt: deps.timestamp(),
      ...(pin === undefined ? {} : { pin: await hashPin(pin) }),
    }),
  }
}
