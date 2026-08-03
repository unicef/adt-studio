import type { PublishErrorResponse } from "@adt/types"
import type { Env } from "./env.js"

export class PublicationRoom {
  private readonly state: DurableObjectState
  private readonly env: Env

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(_request: Request): Promise<Response> {
    const body: PublishErrorResponse = { error: "not_implemented" }
    return new Response(JSON.stringify(body), {
      status: 501,
      headers: { "content-type": "application/json" },
    })
  }
}
