import { describe, expect, it } from "vitest"
import {
  AdtBundleGlossary,
  AdtBundleToc,
  AdtBundleTexts,
  AdtRoundTripManifest,
} from "../adt-round-trip.js"

const HASH = "a".repeat(64)

describe("ADT round-trip archive schemas", () => {
  it("accepts the runtime projections emitted by packageAdtWeb", () => {
    expect(AdtBundleToc.parse([
      {
        section_id: "pg001_sec001",
        href: "index.html",
        title: "Chapter one",
        chapter_id: "pg001_t001",
        level: 1,
      },
    ])).toHaveLength(1)

    expect(AdtBundleGlossary.parse({
      Soil: {
        word: "Soil",
        definition: "The top layer of earth",
        variations: ["soils"],
        emoji: "🪨",
        id: "gl001",
        image: "images/soil.png",
      },
    }).Soil.id).toBe("gl001")

    expect(AdtBundleTexts.parse({ pg001_t001: "Hello" })).toEqual({
      pg001_t001: "Hello",
    })
  })

  it("allows heading-derived TOCs to omit level", () => {
    expect(AdtBundleToc.safeParse([
      {
        section_id: "pg001_sec001",
        href: "index.html",
        title: "Chapter one",
        chapter_id: "pg001_t001",
      },
    ]).success).toBe(true)
  })

  it("rejects duplicate table of contents section ids", () => {
    expect(AdtBundleToc.safeParse([
      { section_id: "s1", href: "index.html", title: "One", chapter_id: "c1" },
      { section_id: "s1", href: "index.html", title: "Again", chapter_id: "c1" },
    ]).success).toBe(false)
  })

  it("rejects duplicate glossary ids even when object keys differ", () => {
    const parsed = AdtBundleGlossary.safeParse({
      Soil: {
        word: "Soil",
        definition: "Earth",
        variations: [],
        emoji: "",
        id: "gl001",
      },
      Ground: {
        word: "Ground",
        definition: "Earth",
        variations: [],
        emoji: "",
        id: "gl001",
      },
    })

    expect(parsed.success).toBe(false)
  })

  it("requires unique output languages and allows translation-only exports", () => {
    const base = {
      formatVersion: 1,
      book: { label: "sample-book" },
      baselines: {
        glossary: 2,
        tocGeneration: 3,
        textCatalogTranslations: { es: 4 },
      },
      textCatalog: { version: 5, idFingerprint: HASH },
      translatableText: { idFingerprint: HASH },
    }

    expect(AdtRoundTripManifest.safeParse({
      ...base,
      editingContract: { version: 1 },
      languages: { source: "en", output: ["en", "es"] },
    }).success).toBe(true)

    expect(AdtRoundTripManifest.safeParse({
      ...base,
      languages: { source: "en", output: ["es"] },
    }).success).toBe(true)

    expect(AdtRoundTripManifest.safeParse({
      ...base,
      languages: { source: "en", output: ["en", "en"] },
    }).success).toBe(false)
  })

  it("rejects malformed hashes and unsupported manifest versions", () => {
    const manifest = {
      formatVersion: 2,
      book: { label: "sample-book" },
      languages: { source: "en", output: ["en"] },
      baselines: {
        glossary: null,
        tocGeneration: null,
        textCatalogTranslations: {},
      },
      textCatalog: { version: 1, idFingerprint: "not-a-hash" },
      translatableText: { idFingerprint: HASH },
    }

    expect(AdtRoundTripManifest.safeParse(manifest).success).toBe(false)
  })

  it("accepts export lineage while keeping older manifests compatible", () => {
    const base = {
      formatVersion: 1,
      book: { label: "sample-book", title: "Sample book" },
      languages: { source: "en", output: ["en"] },
      baselines: {
        glossary: null,
        tocGeneration: null,
        textCatalogTranslations: {},
      },
      textCatalog: { version: 1, idFingerprint: HASH },
      translatableText: { idFingerprint: HASH },
    }

    expect(AdtRoundTripManifest.safeParse(base).success).toBe(true)
    expect(AdtRoundTripManifest.safeParse({
      ...base,
      lineage: {
        originProjectId: "234fdd34-315b-4c4d-a491-7708b22b45d2",
        sourceKind: "pdf",
        sourceFingerprint: HASH,
        publicationId: "e8bd672c-9eb5-4780-83bb-75974d45f4ad",
        exportedAt: "2026-08-06T12:00:00.000Z",
      },
    }).success).toBe(true)
    expect(AdtRoundTripManifest.safeParse({
      ...base,
      lineage: {
        originProjectId: "not-a-uuid",
        sourceKind: "pdf",
        sourceFingerprint: HASH,
        publicationId: "e8bd672c-9eb5-4780-83bb-75974d45f4ad",
        exportedAt: "2026-08-06T12:00:00.000Z",
      },
    }).success).toBe(false)
  })

  it("accepts a v2 activity inventory and rejects duplicate section declarations", () => {
    const manifest = {
      formatVersion: 1,
      editingContract: {
        version: 2,
        activities: [{
          sectionId: "pg001_sec001",
          href: "index.html",
          type: "activity_multiple_choice",
        }],
      },
      book: { label: "sample-book" },
      languages: { source: "en", output: ["en"] },
      baselines: {
        glossary: null,
        tocGeneration: null,
        textCatalogTranslations: {},
      },
      textCatalog: { version: 1, idFingerprint: HASH },
      translatableText: { idFingerprint: HASH },
    }

    expect(AdtRoundTripManifest.safeParse(manifest).success).toBe(true)
    expect(AdtRoundTripManifest.safeParse({
      ...manifest,
      editingContract: {
        version: 2,
        activities: [
          ...manifest.editingContract.activities,
          {
            sectionId: "pg001_sec001",
            href: "other.html",
            type: "activity_custom_crossword",
          },
        ],
      },
    }).success).toBe(false)
  })
})
