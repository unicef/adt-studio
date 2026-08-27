import type { D1Migration } from "@cloudflare/vitest-pool-workers"
import type { Env } from "../src/env.js"

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    TEST_MIGRATIONS: D1Migration[]
  }
}
