import { CLOUDFLARE_WORKER_NAME, workersDevUrl } from "@adt/types"
import { BOOK_WORKER_NAME_PREFIX, bookHostAuthorSecret, bookWorkerName } from "./book-host.js"
import { CloudflareApiError, retryCloudflareOperation, type CloudflareClient } from "./client.js"
import { prepareStaticAssets, type StaticAsset } from "./static-assets.js"
import type { WorkerArtifactBinding, BookHostArtifact } from "./worker-artifact.js"

export class BookHostDeployError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = "BookHostDeployError"
  }
}

/** Workers Free allows 100 Workers per account. The control plane holds one, so the rest is
 *  the ceiling on books that can be live at once. Deleting a book gives its slot back. */
export const FREE_PLAN_WORKER_LIMIT = 100
export const MAX_LIVE_BOOK_HOSTS = FREE_PLAN_WORKER_LIMIT - 1

function alreadyExists(error: unknown): boolean {
  return error instanceof CloudflareApiError && /already exists|duplicate/i.test(error.message)
}

/**
 * A book host's bindings. Deliberately narrower than the control plane's:
 *
 * - the room is bound with `script_name`, so the class stays declared once on the control
 *   plane. Workers Free allows 100 Durable Object classes and 100 Workers, so a class per book
 *   would reach both caps at the same book.
 * - `secret_text` gets the per-book author secret, never the account's own. The worker reads
 *   it only to decide `isAuthor`; a book host has no management route for it to unlock, and a
 *   leak from one host cannot be replayed against the control plane.
 */
export function resolveBookHostBindings(
  bindings: WorkerArtifactBinding[],
  context: { d1DatabaseUuid: string; controlPlaneName: string; authorSecret: string },
): Array<Record<string, unknown>> {
  return bindings.map((binding) => {
    switch (binding.type) {
      case "d1":
        return { type: "d1", name: binding.name, id: context.d1DatabaseUuid }
      case "assets":
        return { type: "assets", name: binding.name }
      case "durable_object_namespace":
        return {
          type: "durable_object_namespace",
          name: binding.name,
          class_name: binding.class_name,
          script_name: context.controlPlaneName,
        }
      case "secret_text":
        return { type: "secret_text", name: binding.name, text: context.authorSecret }
      default:
        throw new BookHostDeployError(
          `A book host must not carry a ${binding.type} binding (${binding.name}).`,
        )
    }
  })
}

export interface DeployBookHostOptions {
  client: CloudflareClient
  artifact: BookHostArtifact
  /** The publication this host serves. The Worker name is derived from it. */
  token: string
  assets: StaticAsset[]
  d1DatabaseUuid: string
  workersDevSubdomain: string
  /** The control plane's management secret. Never deployed as-is — the per-book author secret
   *  is derived from it. */
  controlPlaneSecret: string
  /** Defaults to the control plane, which is where `PublicationRoom` is declared. */
  controlPlaneName?: string
  /** Called after Cloudflare accepts an asset batch. The callback never invents file progress. */
  onAssetProgress?: (progress: { done: number; total: number }) => void | Promise<void>
  sleep?: (ms: number) => Promise<void>
}

export interface DeployedBookHost {
  workerName: string
  url: string
}

/**
 * Publishes one book by deploying its own Worker.
 *
 * Only this book's assets are registered, so the upload is the same size whatever else the
 * account hosts, and a failure here cannot touch another book's Worker or its live version.
 *
 * The Worker is created before the upload session because the session is opened against
 * `/workers/scripts/{name}/assets-upload-session`, which needs the script to exist.
 */
export async function deployBookHost(
  options: DeployBookHostOptions,
): Promise<DeployedBookHost> {
  const {
    client,
    artifact,
    token,
    assets,
    d1DatabaseUuid,
    workersDevSubdomain,
    controlPlaneSecret,
    controlPlaneName = CLOUDFLARE_WORKER_NAME,
    onAssetProgress,
    sleep,
  } = options

  if (assets.length === 0) {
    throw new BookHostDeployError("A book host needs at least one asset to serve.")
  }

  const name = bookWorkerName(token)

  /** One listing answers both questions: whether this book already has a host, and whether
   *  there is room for another. Without the second, reaching the cap surfaces as whatever
   *  Cloudflare says when a Worker create is refused, after the whole export has run. */
  const scripts = await client.listWorkerScripts().catch(() => null)
  const alreadyDeployed = scripts?.some((script) => script.id === name) ?? false

  if (scripts && !alreadyDeployed) {
    const liveBooks = scripts.filter((script) =>
      script.id.startsWith(BOOK_WORKER_NAME_PREFIX),
    ).length
    if (liveBooks >= MAX_LIVE_BOOK_HOSTS) {
      throw new BookHostDeployError(
        `This Cloudflare account is already hosting ${liveBooks} published books, which is as ` +
          `many as the free plan allows. Delete a book you no longer need — that frees its ` +
          `slot — then publish this one again.`,
      )
    }
  }

  if (!alreadyDeployed) {
    try {
      await client.createWorker(name)
    } catch (error) {
      if (!alreadyExists(error)) {
        throw new BookHostDeployError(
          `Cloudflare would not create the Worker for this book: ${describe(error)}`,
          error,
        )
      }
    }
  }

  const staticAssets = await prepareStaticAssets(client, name, assets, { onProgress: onAssetProgress, sleep })

  const bindings = resolveBookHostBindings(artifact.metadata.bindings, {
    d1DatabaseUuid,
    controlPlaneName,
    authorSecret: bookHostAuthorSecret(controlPlaneSecret, token),
  })

  try {
    await retryCloudflareOperation(
      () => client.uploadWorkerScript({
        name,
        script: artifact.script,
        metadata: {
          main_module: artifact.metadata.main_module,
          compatibility_date: artifact.metadata.compatibility_date,
          bindings,
          /** Never a path list. Anything Cloudflare's asset layer can answer is answered before
           * the Worker runs, so any path the list omits is served with no access code, no expiry
           * and no revocation check. */
          assets: { jwt: staticAssets.completionJwt, config: { run_worker_first: true } },
        },
      }),
      { attempts: 5, sleep },
    )
  } catch (error) {
    throw new BookHostDeployError(
      `Cloudflare would not deploy this book's Worker: ${describe(error)}`,
      error,
    )
  }

  try {
    await retryCloudflareOperation(() => client.enableScriptSubdomain(name), { attempts: 5, sleep })
  } catch (error) {
    throw new BookHostDeployError(
      `This book's Worker deployed but has no web address yet: ${describe(error)}`,
      error,
    )
  }

  return { workerName: name, url: workersDevUrl(name, workersDevSubdomain) }
}

/**
 * Frees the Worker slot a book was occupying.
 *
 * Called before the control plane forgets the publication, so a failure here leaves a book
 * that is still recorded and still reachable rather than a public Worker serving a book
 * nothing remembers. A Worker that is already gone is a completed step, not an error, so a
 * retried delete finishes the half it has left.
 */
export async function deleteBookHost(client: CloudflareClient, token: string): Promise<void> {
  try {
    await client.deleteWorkerScript(bookWorkerName(token))
  } catch (error) {
    if (error instanceof CloudflareApiError && error.isNotFound) return
    throw new BookHostDeployError(
      `Cloudflare would not remove this book's Worker: ${describe(error)}`,
      error,
    )
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
