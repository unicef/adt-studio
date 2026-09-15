import { describe, expect, it } from "vitest"

import {
  ARCHIVE_SAFETY_LIMITS,
  formatArchiveByteLimit,
} from "./archive-safety.js"

describe("archive safety limits", () => {
  it("allows media-rich book archives while retaining finite memory bounds", () => {
    expect(ARCHIVE_SAFETY_LIMITS).toMatchObject({
      compressedBytes: 512 * 1024 * 1024,
      expandedBytes: 1024 * 1024 * 1024,
    })
  })

  it("formats binary limits for actionable API errors", () => {
    expect(formatArchiveByteLimit(512 * 1024 * 1024)).toBe("512 MiB")
    expect(formatArchiveByteLimit(1024 * 1024 * 1024)).toBe("1 GiB")
  })
})
