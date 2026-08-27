import { describe, expect, it } from "vitest"
import {
  PUBLISH_WORKER_VERSION,
  Publication,
  PublicationCreateRequest,
  PublicationToken,
  PublicationVersion,
  publicationStateAt,
} from "../publication.js"
import {
  CommentAnchor,
  PublishComment,
  PublishCommentCreateRequest,
  PublishCommentListQuery,
  PUBLISH_COMMENT_BODY_MAX_LENGTH,
} from "../publish-comment.js"

const token = "aBcDeFgHiJkLmNoPqRsTuVwXyZ012345"

describe("publication schemas", () => {
  it("exposes a semver worker version", () => {
    expect(PUBLISH_WORKER_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("accepts url-safe tokens and rejects short or unsafe ones", () => {
    expect(PublicationToken.safeParse(token).success).toBe(true)
    expect(PublicationToken.safeParse("too-short").success).toBe(false)
    expect(PublicationToken.safeParse(`${token}/../etc`).success).toBe(false)
  })

  it("requires explicit nulls for expiry and revocation on stored records", () => {
    const parsed = Publication.parse({
      token,
      title: "Raven and the Sun",
      book_label: "raven",
      current_version: 2,
      created_at: "2026-08-03T10:00:00.000Z",
      expires_at: null,
      revoked_at: null,
    })
    expect(parsed.current_version).toBe(2)

    expect(
      Publication.safeParse({
        token,
        title: "Raven and the Sun",
        book_label: "raven",
        current_version: 1,
        created_at: "2026-08-03T10:00:00.000Z",
      }).success,
    ).toBe(false)
  })

  it("parses a version page manifest with optional page numbers", () => {
    const version = PublicationVersion.parse({
      version: 1,
      page_manifest: [
        { section_id: "sec-1", href: "content/pages/page-1.html", page_number: 1 },
        { section_id: "sec-2", href: "content/pages/page-2.html" },
      ],
      created_at: "2026-08-03T10:00:00.000Z",
    })
    expect(version.page_manifest).toHaveLength(2)
    expect(version.page_manifest[1]?.page_number).toBeUndefined()
  })

  it("treats expiry in the past as expired and revocation as terminal", () => {
    const now = new Date("2026-08-03T12:00:00.000Z")
    expect(publicationStateAt({ expires_at: null, revoked_at: null }, now)).toBe("active")
    expect(
      publicationStateAt({ expires_at: "2026-08-04T00:00:00.000Z", revoked_at: null }, now),
    ).toBe("active")
    expect(
      publicationStateAt({ expires_at: "2026-08-03T11:59:59.000Z", revoked_at: null }, now),
    ).toBe("expired")
    expect(
      publicationStateAt(
        { expires_at: "2026-08-04T00:00:00.000Z", revoked_at: "2026-08-03T09:00:00.000Z" },
        now,
      ),
    ).toBe("revoked")
  })

  it("validates the publish request metadata envelope", () => {
    const parsed = PublicationCreateRequest.parse({
      token,
      title: "Raven and the Sun",
      book_label: "raven",
      page_manifest: [{ section_id: "sec-1", href: "content/pages/page-1.html" }],
    })
    expect(parsed.expires_at).toBeUndefined()

    expect(
      PublicationCreateRequest.safeParse({
        token,
        title: "",
        book_label: "raven",
        page_manifest: [],
      }).success,
    ).toBe(false)
  })
})

describe("publish comment schemas", () => {
  it("bounds pin offsets to a percentage of the anchor element", () => {
    expect(CommentAnchor.safeParse({ selector: "#content > p:nth-child(2)", xOffsetPct: 0, yOffsetPct: 100 }).success).toBe(true)
    expect(CommentAnchor.safeParse({ selector: "#content", xOffsetPct: -1, yOffsetPct: 0 }).success).toBe(false)
    expect(CommentAnchor.safeParse({ selector: "#content", xOffsetPct: 0, yOffsetPct: 101 }).success).toBe(false)
  })

  it("carries denormalized author identity on read models", () => {
    const comment = PublishComment.parse({
      id: "cmt-1",
      token,
      version: 1,
      page_section_id: "sec-1",
      parent_id: null,
      session_id: "ses-1",
      author_name: "Ana",
      author_color: "#0091ff",
      body: "The alt text here is missing.",
      anchor: { selector: "#content img", xOffsetPct: 50, yOffsetPct: 50 },
      resolved_at: null,
      edited_at: null,
      deleted_at: null,
      created_at: "2026-08-03T10:00:00.000Z",
    })
    expect(comment.author_name).toBe("Ana")
    expect(comment.anchor?.selector).toBe("#content img")
  })

  it("trims bodies and enforces the length cap on writes", () => {
    const parsed = PublishCommentCreateRequest.parse({
      page_section_id: "sec-1",
      body: "  needs a caption  ",
    })
    expect(parsed.body).toBe("needs a caption")

    expect(
      PublishCommentCreateRequest.safeParse({
        page_section_id: "sec-1",
        body: "x".repeat(PUBLISH_COMMENT_BODY_MAX_LENGTH + 1),
      }).success,
    ).toBe(false)

    expect(
      PublishCommentCreateRequest.safeParse({ page_section_id: "sec-1", body: "   " }).success,
    ).toBe(false)
  })

  it("coerces list query strings from the URL", () => {
    const parsed = PublishCommentListQuery.parse({
      page_section_id: "sec-1",
      version: "2",
      include_resolved: "true",
    })
    expect(parsed.version).toBe(2)
    expect(parsed.include_resolved).toBe(true)

    expect(PublishCommentListQuery.parse({}).include_resolved).toBeUndefined()
  })
})
