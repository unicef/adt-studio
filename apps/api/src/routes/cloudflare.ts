import { Hono } from "hono"
import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import {
  CLOUDFLARE_ACCOUNT_ID_HEADER,
  CLOUDFLARE_TOKEN_HEADER,
  type CloudflareConnectionDeleteResponse,
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
import { isProvisionError } from "../services/cloudflare/errors.js"
import { provisionCloudflare } from "../services/cloudflare/provisioner.js"
import {
  disconnectedStatus,
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
}

interface CloudflareCredentials {
  token: string
  accountId: string
}

function readCredentials(c: Context): CloudflareCredentials {
  const token = c.req.header(CLOUDFLARE_TOKEN_HEADER)?.trim()
  const accountId = c.req.header(CLOUDFLARE_ACCOUNT_ID_HEADER)?.trim()
  if (!token) {
    throw new HTTPException(400, { message: `Missing ${CLOUDFLARE_TOKEN_HEADER} header` })
  }
  if (!accountId) {
    throw new HTTPException(400, {
      message: `Missing ${CLOUDFLARE_ACCOUNT_ID_HEADER} header`,
    })
  }
  return { token, accountId }
}

export function createCloudflareRoutes(deps: CloudflareRoutesDeps): Hono {
  const app = new Hono()

  const store: ConnectionStore = createConnectionStore(
    deps.stateDir ?? resolvePublishStateDir(deps.booksDir),
  )

  const clientFor = ({ token, accountId }: CloudflareCredentials): CloudflareClient =>
    deps.createClient
      ? deps.createClient({ token, accountId, fetchFn: deps.fetchFn })
      : createCloudflareClient({ token, accountId, fetchFn: deps.fetchFn })

  const loadArtifact = (): WorkerArtifact => {
    if (deps.loadArtifact) return deps.loadArtifact()
    return loadWorkerArtifact(
      resolveWorkerArtifactPaths(deps.projectRoot, {
        ...(deps.artifactDir === undefined ? {} : { artifactDir: deps.artifactDir }),
        ...(deps.migrationsDir === undefined ? {} : { migrationsDir: deps.migrationsDir }),
      }),
    )
  }

  // POST /cloudflare/verify — validate the token scopes and account id
  app.post("/cloudflare/verify", async (c) => {
    const credentials = readCredentials(c)
    const probe = await probeCloudflareAccess(clientFor(credentials))
    if (probe.accountNotFound) {
      throw new HTTPException(404, {
        message: `Cloudflare account ${credentials.accountId} was not found, or the token cannot read it.`,
      })
    }
    return c.json(toVerifyResponse(probe))
  })

  // POST /cloudflare/provision — idempotent create-or-upgrade, per-step progress over SSE
  app.post("/cloudflare/provision", async (c) => {
    const credentials = readCredentials(c)

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
      const response: CloudflareConnectionDeleteResponse = {
        forgotten: false,
        deleted_resources: false,
      }
      return c.json({ ...response, connection: disconnectedStatus() })
    }

    if (deleteResources) {
      const credentials = readCredentials(c)
      const { failures } = await teardownCloudflareResources(clientFor(credentials), record)
      if (failures.length > 0) {
        throw new HTTPException(502, {
          message: `Cloudflare teardown was incomplete, the connection was kept so you can retry: ${failures.join("; ")}`,
        })
      }
    }

    store.clear()
    const response: CloudflareConnectionDeleteResponse = {
      forgotten: true,
      deleted_resources: deleteResources,
    }
    return c.json({ ...response, connection: disconnectedStatus() })
  })

  return app
}
