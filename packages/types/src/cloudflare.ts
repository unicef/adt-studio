import { z } from "zod"

export const CLOUDFLARE_TOKEN_HEADER = "X-Cloudflare-Token"
export const CLOUDFLARE_ACCOUNT_ID_HEADER = "X-Cloudflare-Account-Id"

export const CLOUDFLARE_WORKER_NAME = "adt-publish"
export const CLOUDFLARE_D1_DATABASE_NAME = "adt-publish"
export const CLOUDFLARE_R2_BUCKET_NAME = "adt-publish-snapshots"

export const CloudflareTokenScope = z.enum([
  "Workers Scripts:Edit",
  "D1:Edit",
  "R2:Edit",
  "Account:Read",
])
export type CloudflareTokenScope = z.infer<typeof CloudflareTokenScope>

export const CLOUDFLARE_REQUIRED_SCOPES: readonly CloudflareTokenScope[] = [
  "Account:Read",
  "Workers Scripts:Edit",
  "D1:Edit",
  "R2:Edit",
]

export const CloudflareVerifyResponse = z.object({
  ok: z.boolean(),
  account_name: z.string().nullable(),
  missing_scopes: z.array(CloudflareTokenScope),
  workers_dev_subdomain: z.string().nullable(),
})
export type CloudflareVerifyResponse = z.infer<typeof CloudflareVerifyResponse>

export const ProvisionStepId = z.enum([
  "verify-token",
  "find-or-create-d1",
  "apply-migrations",
  "find-or-create-r2",
  "upload-worker",
  "set-mgmt-secret",
  "enable-workers-dev",
  "verify-deployment",
])
export type ProvisionStepId = z.infer<typeof ProvisionStepId>

export const ProvisionStepStatus = z.enum([
  "pending",
  "running",
  "done",
  "skipped",
  "error",
])
export type ProvisionStepStatus = z.infer<typeof ProvisionStepStatus>

export const ProvisionStepDescriptor = z.object({
  id: ProvisionStepId,
  number: z.number().int().min(1).max(8),
  label: z.string().min(1),
})
export type ProvisionStepDescriptor = z.infer<typeof ProvisionStepDescriptor>

export const PROVISION_STEPS: readonly ProvisionStepDescriptor[] = [
  { id: "verify-token", number: 1, label: "Verify API token and account" },
  { id: "find-or-create-d1", number: 2, label: "Find or create the D1 database" },
  { id: "apply-migrations", number: 3, label: "Apply database migrations" },
  { id: "find-or-create-r2", number: 4, label: "Find or create the snapshot bucket" },
  { id: "upload-worker", number: 5, label: "Upload the publish worker" },
  { id: "set-mgmt-secret", number: 6, label: "Set the management secret" },
  { id: "enable-workers-dev", number: 7, label: "Enable the workers.dev route" },
  { id: "verify-deployment", number: 8, label: "Verify the deployment" },
]

export const PROVISION_STEP_COUNT = PROVISION_STEPS.length

export const ProvisionErrorCode = z.enum([
  "bad_token_scope",
  "account_not_found",
  "no_workers_subdomain",
  "name_collision",
  "migration_failed",
  "upload_failed",
  "stale_deployment",
  "partial_provision",
])
export type ProvisionErrorCode = z.infer<typeof ProvisionErrorCode>

export const CloudflareConnectionResources = z.object({
  account_id: z.string().min(1),
  account_name: z.string().nullable(),
  worker_name: z.string().min(1),
  workers_dev_subdomain: z.string().nullable(),
  d1_database_name: z.string().min(1),
  d1_database_uuid: z.string().min(1),
  r2_bucket_name: z.string().min(1),
})
export type CloudflareConnectionResources = z.infer<typeof CloudflareConnectionResources>

export const CloudflareAuthMethod = z.enum(["oauth", "token"])
export type CloudflareAuthMethod = z.infer<typeof CloudflareAuthMethod>

export const CloudflareConnectionStatus = z.object({
  connected: z.boolean(),
  auth_method: CloudflareAuthMethod.nullable(),
  worker_url: z.string().nullable(),
  worker_version: z.string().nullable(),
  latest_version: z.string().min(1),
  upgrade_available: z.boolean(),
  worker_reachable: z.boolean(),
  resources: CloudflareConnectionResources.nullable(),
  provisioned_at: z.string().datetime().nullable(),
  updated_at: z.string().datetime().nullable(),
})
export type CloudflareConnectionStatus = z.infer<typeof CloudflareConnectionStatus>

export const CloudflareConnectionDeleteResponse = z.object({
  forgotten: z.boolean(),
  deleted_resources: z.boolean(),
  oauth_cleared: z.boolean(),
})
export type CloudflareConnectionDeleteResponse = z.infer<
  typeof CloudflareConnectionDeleteResponse
>

export const CloudflareOAuthErrorCode = z.enum([
  "oauth_port_busy",
  "oauth_flow_pending",
  "oauth_denied",
  "oauth_expired",
  "oauth_state_mismatch",
  "oauth_exchange_failed",
  "oauth_no_accounts",
  "reconnect_required",
  "account_choice_required",
])
export type CloudflareOAuthErrorCode = z.infer<typeof CloudflareOAuthErrorCode>

export const CloudflareOAuthStartResponse = z.object({
  auth_url: z.string().min(1),
  state: z.string().min(1),
})
export type CloudflareOAuthStartResponse = z.infer<typeof CloudflareOAuthStartResponse>

export const CloudflareOAuthAccount = z.object({
  id: z.string().min(1),
  name: z.string(),
})
export type CloudflareOAuthAccount = z.infer<typeof CloudflareOAuthAccount>

export const CloudflareOAuthFlowStatus = z.enum(["pending", "complete", "error", "expired"])
export type CloudflareOAuthFlowStatus = z.infer<typeof CloudflareOAuthFlowStatus>

export const CloudflareOAuthStatusResponse = z.object({
  status: CloudflareOAuthFlowStatus,
  error: CloudflareOAuthErrorCode.optional(),
  error_message: z.string().optional(),
  accounts: z.array(CloudflareOAuthAccount).optional(),
  account_choice_required: z.boolean(),
  account_id: z.string().nullable().optional(),
})
export type CloudflareOAuthStatusResponse = z.infer<typeof CloudflareOAuthStatusResponse>

export const CloudflareOAuthAccountRequest = z.object({
  account_id: z.string().min(1),
})
export type CloudflareOAuthAccountRequest = z.infer<typeof CloudflareOAuthAccountRequest>

export const CloudflareOAuthAccountResponse = z.object({
  account_id: z.string().min(1),
  account_name: z.string().nullable(),
})
export type CloudflareOAuthAccountResponse = z.infer<typeof CloudflareOAuthAccountResponse>

export const ProvisionProgressEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("step"),
    id: ProvisionStepId,
    number: z.number().int().min(1).max(8),
    label: z.string().min(1),
    status: ProvisionStepStatus,
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal("complete"),
    connection: CloudflareConnectionStatus,
  }),
  z.object({
    type: z.literal("error"),
    code: ProvisionErrorCode,
    message: z.string(),
    step_id: ProvisionStepId.nullable(),
    resume_from_step: z.number().int().min(1).max(8).nullable(),
    missing_scopes: z.array(CloudflareTokenScope).optional(),
  }),
])
export type ProvisionProgressEvent = z.infer<typeof ProvisionProgressEvent>

export function provisionStep(id: ProvisionStepId): ProvisionStepDescriptor {
  const step = PROVISION_STEPS.find((candidate) => candidate.id === id)
  if (!step) {
    throw new Error(`Unknown provisioning step: ${id}`)
  }
  return step
}

export function workersDevUrl(workerName: string, subdomain: string): string {
  return `https://${workerName}.${subdomain}.workers.dev`
}
