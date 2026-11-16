import { HTTPException } from "hono/http-exception"

/** Shared optimistic-write conflict, rendered consistently by the API. */
export class EditConflictError extends HTTPException {
  readonly code = "VERSION_CONFLICT"
  constructor(readonly currentVersion: number) {
    super(409, { message: "Content changed. Your draft has not been saved. Refresh before retrying." })
  }
}
