import { CLOUDFLARE_WORKER_NAME, workersDevUrl } from "@adt/types"
import { bookWorkerName } from "./book-host.js"
import { CloudflareApiError, type CloudflareClient } from "./client.js"
import { prepareStaticAssets, type StaticAsset } from "./static-assets.js"
import type { WorkerArtifactBinding, BookHostArtifact } from "./worker-artifact.js"

export class BookHostDeployError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = "BookHostDeployError"
  }
}

function alreadyExists(error: unknown): boolean {
  return error instanceof CloudflareApiError && /already exists|duplicate/i.test(error.message)
}

/**
 * A book host's bindings. Deliberately narrower than the control plane's:
 *
 * - the room is bound with `script_name`, so the class stays declared once on the control
 *   plane. Workers Free allows 100 Durable Object classes and 100 Workers, so a class per book
 *   would reach both caps at the same book.
 * - there is no `secret_text` case. A book host serves public reader traffic and has no
 *   management route, so a secret reaching one would be a credential on a public surface —
 *   this throws rather than forwards it.
 */
export function resolveBookHostBindings(
  bindings: WorkerArtifactBinding[],
  context: { d1DatabaseUuid: string; controlPlaneName: string },
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
  /** Defaults to the control plane, which is where `PublicationRoom` is declared. */
  controlPlaneName?: string
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
    controlPlaneName = CLOUDFLARE_WORKER_NAME,
  } = options

  if (assets.length === 0) {
    throw new BookHostDeployError("A book host needs at least one asset to serve.")
  }

  const name = bookWorkerName(token)

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

  const staticAssets = await prepareStaticAssets(client, name, assets)

  const bindings = resolveBookHostBindings(artifact.metadata.bindings, {
    d1DatabaseUuid,
    controlPlaneName,
  })

  try {
    await client.uploadWorkerScript({
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
    })
  } catch (error) {
    throw new BookHostDeployError(
      `Cloudflare would not deploy this book's Worker: ${describe(error)}`,
      error,
    )
  }

  try {
    await client.enableScriptSubdomain(name)
  } catch (error) {
    throw new BookHostDeployError(
      `This book's Worker deployed but has no web address yet: ${describe(error)}`,
      error,
    )
  }

  return { workerName: name, url: workersDevUrl(name, workersDevSubdomain) }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
