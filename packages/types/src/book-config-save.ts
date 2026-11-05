import { z } from "zod"
import { AppConfig } from "./config.js"

/** Exact persisted overrides and effective baseline acknowledged by one Save. */
export const BookConfigSaveReceipt = z.object({
  config: z.record(z.string(), z.unknown()),
  activeConfig: z.object({ merged: AppConfig, hasBookOverride: z.boolean() }),
})
export type BookConfigSaveReceipt = z.infer<typeof BookConfigSaveReceipt>
