import type { ReaderSourceVersionData } from "@adt/types"

export interface ReaderSourceVersion {
  version: number
  data: ReaderSourceVersionData
}

export interface LatestReaderSource extends ReaderSourceVersion {
  path: string
}

export class ReaderSourceConflictError extends Error {
  constructor(sourcePath: string) {
    super(`${sourcePath} changed since it was opened. Reload it and try again.`)
  }
}

export class ReaderSourceStateError extends Error {}

export function assertBaseVersion(sourcePath: string, current: number | null, expected: number | null): void {
  if (current !== expected) throw new ReaderSourceConflictError(sourcePath)
}
