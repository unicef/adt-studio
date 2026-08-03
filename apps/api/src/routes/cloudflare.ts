import { Hono } from "hono"
import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import {
  CloudflareOAuthAccountRequest,
  type CloudflareConnectionDeleteResponse,
  type CloudflareOAuthAccountResponse,
  type CloudflareOAuthStartResponse,
  type CloudflareOAuthStatusResponse,
  type ProvisionProgressEvent,
} from "@adt/types"
import { probeCloudflareAccess, toVerifyResponse } from "../services/cloudflare/access.js"
import {
  createCloudflareClient,
  type CloudflareClient,
  type FetchLike,
} from "../services/cloudflare/client.js"
import {
  createConnectionStore,
  resolvePublishStateDir,
  type ConnectionStore,
} from "../services/cloudflare/connection-store.js"
import {
  oauthErrorStatus,
  resolveCloudflareCredentials,
  type ResolvedCloudflareCredentials,
} from "../services/cloudflare/credentials.js"
import { isProvisionError } from "../services/cloudflare/errors.js"
import {
  createCloudflareOAuthService,
  isCloudflareOAuthError,
  type CloudflareOAuthService,
  type OAuthCallbackListenerFactory,
} from "../services/cloudflare/oauth.js"
import { provisionCloudflare } from "../services/cloudflare/provisioner.js"
import {
  disconnectedStatus,
  readAuthMethod,
  readConnectionStatus,
  teardownCloudflareResources,
} from "../services/cloudflare/status.js"
import {
  WorkerArtifactError,
  loadWorkerArtifact,
  resolveWorkerArtifactPaths,
  type WorkerArtifact,
} from "../services/cloudflare/worker-artifact.js"

const DeleteConnectionQuery = z.object({
  delete_resources: z.enum(["0", "1"]).optional(),
})

const OAuthStatusQuery = z.object({
  state: z.string().min(1),
})

const OAuthAccountBody = CloudflareOAuthAccountRequest.extend({
  state: z.string().min(1),
})

export interface CloudflareRoutesDeps {
  booksDir: string
  projectRoot: string
  stateDir?: string
  artifactDir?: string
  migrationsDir?: string
  fetchFn?: FetchLike
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
  generateSecret?: () => string
  healthAttempts?: number
  createClient?: (options: {
    token: string
    accountId: string
    fetchFn?: FetchLike
  }) => CloudflareClient
  loadArtifact?: () => WorkerArtifact
  oauthCallbackPort?: number
  oauthTokenUrl?: string
  oauthAuthUrl?: string
  oauthRevokeUrl?: string
  createOAuthListener?: OAuthCallbackListenerFactory
  oauthFlowTtlMs?: number
}

export function createCloudflareRoutes(deps: CloudflareRoutesDeps): Hono {
  const app = new Hono()

  const store: ConnectionStore = createConnectionStore(
    deps.stateDir ?? resolvePublishStateDir(deps.booksDir),
  )

  const oauth: CloudflareOAuthService = createCloudflareOAuthService({
    store,
    ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }),
    ...(deps.now === undefined ? {} : { now: deps.now }),
    ...(deps.oauthCallbackPort === undefined
      ? {}
      : { callbackPort: deps.oauthCallbackPort }),
    ...(deps.oauthAuthUrl === undefined ? {} : { authUrl: deps.oauthAuthUrl }),
    ...(deps.oauthTokenUrl === undefined ? {} : { tokenUrl: deps.oauthTokenUrl }),
    ...(deps.oauthRevokeUrl === undefined ? {} : { revokeUrl: deps.oauthRevokeUrl }),
    ...(deps.createOAuthListener === undefined
      ? {}
      : { createListener: deps.createOAuthListener }),
    ...(deps.oauthFlowTtlMs === undefined ? {} : { flowTtlMs: deps.oauthFlowTtlMs }),
  })

  const clientFor = ({
    token,
    accountId,
  }: Pick<ResolvedCloudflareCredentials, "token" | "accountId">): CloudflareClient =>
    deps.createClient
      ? deps.createClient({ token, accountId, fetchFn: deps.fetchFn })
      : createCloudflareClient({ token, accountId, fetchFn: deps.fetchFn })

  const readCredentials = (c: Context): Promise<ResolvedCloudflareCredentials> =>
    resolveCloudflareCredentials(c, { store, oauth })

  const oauthFailure = (c: Context, error: unknown): Response => {
    if (!isCloudflareOAuthError(error)) throw error
    return c.json({ error: error.message, code: error.code }, oauthErrorStatus(error))
  }

  const loadArtifact = (): WorkerArtifact => {
    if (deps.loadArtifact) return deps.loadArtifact()
    return loadWorkerArtifact(
      resolveWorkerArtifactPaths(deps.projectRoot, {
        ...(deps.artifactDir === undefined ? {} : { artifactDir: deps.artifactDir }),
        ...(deps.migrationsDir === undefined ? {} : { migrationsDir: deps.migrationsDir }),
      }),
    )
  }

  // POST /cloudflare/oauth/start — begin the PKCE flow and listen for the callback
  app.post("/cloudflare/oauth/start", async (c) => {
    try {
      const flow = await oauth.start()
      const response: CloudflareOAuthStartResponse = {
        auth_url: flow.authUrl,
        state: flow.state,
      }
      return c.json(response)
    } catch (error) {
      return oauthFailure(c, error)
    }
  })

  // GET /cloudflare/oauth/status — poll a flow while the user is in the browser
  app.get("/cloudflare/oauth/status", (c) => {
    const parsedQuery = OAuthStatusQuery.safeParse({ state: c.req.query("state") })
    if (!parsedQuery.success) {
      throw new HTTPException(400, { message: "Missing state query param" })
    }

    const flow = oauth.status(parsedQuery.data.state)
    const response: CloudflareOAuthStatusResponse = {
      status: flow.status,
      account_choice_required: flow.accountChoiceRequired,
      account_id: flow.accountId,
      ...(flow.errorCode === null ? {} : { error: flow.errorCode }),
      ...(flow.errorMessage === null ? {} : { error_message: flow.errorMessage }),
      ...(flow.accounts.length === 0 ? {} : { accounts: flow.accounts }),
    }
    return c.json(response)
  })

  // POST /cloudflare/oauth/account — pick the account when the login covers several
  app.post("/cloudflare/oauth/account", async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = OAuthAccountBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid body: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
      })
    }

    try {
      const account = await oauth.selectAccount(parsed.data.state, parsed.data.account_id)
      const response: CloudflareOAuthAccountResponse = {
        account_id: account.id,
        account_name: account.name || null,
      }
      return c.json(response)
    } catch (error) {
      return oauthFailure(c, error)
    }
  })

  // POST /cloudflare/verify — validate the credential scopes and account id
  app.post("/cloudflare/verify", async (c) => {
    let credentials: ResolvedCloudflareCredentials
    try {
      credentials = await readCredentials(c)
    } catch (error) {
      return oauthFailure(c, error)
    }

    const probe = await probeCloudflareAccess(clientFor(credentials), {
      verifyToken: credentials.authMethod !== "oauth",
    })
    if (probe.accountNotFound) {
      throw new HTTPException(404, {
        message: `Cloudflare account ${credentials.accountId} was not found, or the token cannot read it.`,
      })
    }
    return c.json(toVerifyResponse(probe))
  })

  // POST /cloudflare/provision — idempotent create-or-upgrade, per-step progress over SSE
  app.post("/cloudflare/provision", async (c) => {
    let credentials: ResolvedCloudflareCredentials
    try {
      credentials = await readCredentials(c)
    } catch (error) {
      return oauthFailure(c, error)
    }

    let artifact: WorkerArtifact
    try {
      artifact = loadArtifact()
    } catch (error) {
      if (error instanceof WorkerArtifactError) {
        throw new HTTPException(500, { message: error.message })
      }
      throw error
    }

    const client = clientFor(credentials)

    return streamSSE(c, async (stream) => {
      const emit = async (event: ProvisionProgressEvent) => {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
      }

      try {
        await provisionCloudflare({
          client,
          artifact,
          store,
          emit,
          authMethod: credentials.authMethod,
          ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }),
          ...(deps.sleep === undefined ? {} : { sleep: deps.sleep }),
          ...(deps.now === undefined ? {} : { now: deps.now }),
          ...(deps.generateSecret === undefined
            ? {}
            : { generateSecret: deps.generateSecret }),
          ...(deps.healthAttempts === undefined
            ? {}
            : { healthAttempts: deps.healthAttempts }),
        })
      } catch (error) {
        const event: ProvisionProgressEvent = isProvisionError(error)
          ? {
              type: "error",
              code: error.code,
              message: error.message,
              step_id: error.stepId,
              resume_from_step: error.resumeFromStep,
              ...(error.missingScopes === undefined
                ? {}
                : { missing_scopes: error.missingScopes }),
            }
          : {
              type: "error",
              code: "partial_provision",
              message: error instanceof Error ? error.message : String(error),
              step_id: null,
              resume_from_step: null,
            }
        await emit(event)
      }
    })
  })

  // GET /cloudflare/connection — local record plus the live worker version
  app.get("/cloudflare/connection", async (c) => {
    const status = await readConnectionStatus(store, {
      ...(deps.fetchFn === undefined ? {} : { fetchFn: deps.fetchFn }),
    })
    return c.json(status)
  })

  // DELETE /cloudflare/connection — forget locally, optionally tear the resources down
  app.delete("/cloudflare/connection", async (c) => {
    const parsedQuery = DeleteConnectionQuery.safeParse({
      delete_resources: c.req.query("delete_resources") || undefined,
    })
    if (!parsedQuery.success) {
      throw new HTTPException(400, {
        message: `Invalid query params: ${parsedQuery.error.issues.map((issue) => issue.message).join(", ")}`,
      })
    }
    const deleteResources = parsedQuery.data.delete_resources === "1"

    const record = store.read()
    if (!record) {
      const oauthCleared = await oauth.signOut()
      const response: CloudflareConnectionDeleteResponse = {
        forgotten: false,
        deleted_resources: false,
        oauth_cleared: oauthCleared,
      }
      return c.json({ ...response, connection: disconnectedStatus(readAuthMethod(store)) })
    }

    if (deleteResources) {
      let credentials: ResolvedCloudflareCredentials
      try {
        credentials = await readCredentials(c)
      } catch (error) {
        return oauthFailure(c, error)
      }
      const { failures } = await teardownCloudflareResources(clientFor(credentials), record)
      if (failures.length > 0) {
        throw new HTTPException(502, {
          message: `Cloudflare teardown was incomplete, the connection was kept so you can retry: ${failures.join("; ")}`,
        })
      }
    }

    store.clear()
    const oauthCleared = await oauth.signOut()
    const response: CloudflareConnectionDeleteResponse = {
      forgotten: true,
      deleted_resources: deleteResources,
      oauth_cleared: oauthCleared,
    }
    return c.json({ ...response, connection: disconnectedStatus(readAuthMethod(store)) })
  })

  return app
}
