import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"

import { afterEach } from "vitest"
import { strToU8, unzipSync, zipSync } from "fflate"
import { canonicalJson } from "@adt/types/fingerprint"

import { extractAdtBundleArchiveFiles, readAdtBundle } from "../adt-bundle-reader.js"
import { assessAdtImportCompatibility } from "../adt-import-compatibility.js"
import {
  seedImportedAdtProject,
  type ImportedAdtSeedResult,
} from "../adt-import-seed/index.js"

/** Every suite here writes real books to disk; each registers its temp root
 * so one shared hook can clean up after every test. */
export const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

export function makeBooksDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  temporaryRoots.push(dir)
  return dir
}


/** Mirrors what `importAdtProject` does around the seeder: read the archive
 * once, then project it into the label the manifest asks for. */
export function seedFromArchive(
  zipBuffer: Buffer,
  booksDir: string,
  sourceFileName?: string,
  activityDecisions?: ReadonlyArray<{ sectionId: string; type: string | null }>,
): ImportedAdtSeedResult {
  const bundle = readAdtBundle(zipBuffer)
  const files = extractAdtBundleArchiveFiles(zipBuffer)
  return seedImportedAdtProject(bundle.manifest.book.label, booksDir, bundle, files, {
    sourceFileName,
    activityDecisions,
  })
}

export function assessArchive(zipBuffer: Buffer) {
  return assessAdtImportCompatibility(
    readAdtBundle(zipBuffer),
    extractAdtBundleArchiveFiles(zipBuffer),
  )
}


export const json = (value: unknown) => strToU8(JSON.stringify(value))
export const sha256 = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex")
export const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
)

export function makeBundle(): Buffer {
  const sourceTexts = {
    pg001_n001: "Old text",
    pg001_n002: "Deleted outside Studio",
    gl001: "Hyena",
    gl001_def: "An animal",
  }
  const files = {
    "manifest.json": json({
      formatVersion: 1,
      book: { label: "hyena-and-raven", title: "Hyena and Raven" },
      languages: { source: "en", output: ["en", "es"] },
      baselines: {
        glossary: 1,
        tocGeneration: 1,
        textCatalogTranslations: { es: 1 },
      },
      textCatalog: { version: 1, idFingerprint: sha256(Object.keys(sourceTexts)) },
      translatableText: { idFingerprint: sha256(Object.keys(sourceTexts)) },
    }),
    "assets/config.json": json({
      title: "Hyena and Raven",
      features: { readAloud: true, highlight: true },
    }),
    "assets/offline-preloader.js": strToU8(`(function () {
  var INLINE = {};
  var BASE_DIR = "";
})();
`),
    "assets/scorm.js": strToU8("void window.parent.API"),
    "assets/book-showcase.css": strToU8(".storybook-page { color: rebeccapurple; }"),
    "assets/book-showcase.js": strToU8("window.__bookShowcase = true"),
    "showcase-assets/paper.png": onePixelPng,
    "content/pages.json": json([{ section_id: "pg001_sec001", href: "index.html", page_number: 1 }]),
    "content/toc.json": json([{ section_id: "pg001_sec001", href: "index.html", title: "Story", chapter_id: "c1" }]),
    "content/i18n/en/texts.json": json(sourceTexts),
    "content/i18n/en/audios.json": json({ pg001_n001: "original.mp3" }),
    "content/i18n/en/audio/original.mp3": strToU8("original audio"),
    "content/i18n/en/timecode/timecode_output.json": json({
      pg001_n001: {
        timecodes: [null, { word_timestamps: [{ text: "Edited", start: 0, end: 0.4 }] }],
      },
    }),
    "content/i18n/es/texts.json": json({
      pg001_n001: "Texto anterior",
      pg001_n002: "Eliminado fuera de Studio",
      gl001: "Hiena",
      gl001_def: "Un animal",
    }),
    "content/i18n/en/glossary.json": json({
      Hyena: { word: "Hyena", definition: "An animal", variations: [], emoji: "", id: "gl001" },
    }),
    "content/i18n/es/glossary.json": json({
      Hiena: { word: "Hiena", definition: "Un animal", variations: [], emoji: "", id: "gl001" },
    }),
    "images/pg001_im001.png": onePixelPng,
    "index.html": strToU8(`<!doctype html><html><head>
      <link href="./assets/book-showcase.css" rel="stylesheet">
    </head><body>
      <main id="content">
        <section data-section-id="pg001_sec001" data-section-type="text_and_single_image">
          <p data-id="pg001_n001">Edited outside Studio</p>
          <p data-id="new-unstable-id">New text without a catalog id</p>
          <img data-id="pg001_im001" src="images/pg001_im001.png" alt="A raven">
        </section>
      </main>
      <script src="./assets/book-showcase.js"></script>
    </body></html>`),
  }
  return Buffer.from(zipSync(files))
}

export function makeBundleWithUnchangedHtmlCatalog(): Buffer {
  const files = unzipSync(makeBundle())
  files["content/i18n/en/texts.json"] = json({
    pg001_n001: "Edited outside Studio",
    "new-unstable-id": "New text without a catalog id",
    pg001_im001: "A raven",
    gl001: "Hyena",
    gl001_def: "An animal",
  })
  return Buffer.from(zipSync(files))
}

export function makeBundleWithTwoSectionsOnOnePage(): Buffer {
  const files = unzipSync(makeBundle())
  files["content/pages.json"] = json([
    { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
    { section_id: "pg001_sec002", href: "pg001_sec002.html", page_number: 1 },
  ])
  files["pg001_sec002.html"] = strToU8(`<!doctype html><html><body>
    <main id="content">
      <section data-section-id="pg001_sec002" data-section-type="content">
        <p data-id="pg001_n003">Second section on the same page</p>
      </section>
    </main>
  </body></html>`)
  return Buffer.from(zipSync(files))
}

export function makeCurrentBundleWithCanonicalImageDescription(): Buffer {
  const files = unzipSync(makeBundleWithUnchangedHtmlCatalog())
  const sourceTexts = JSON.parse(new TextDecoder().decode(
    files["content/i18n/en/texts.json"],
  )) as Record<string, string>
  sourceTexts.pg001_im001 = "A detailed description stored in the text catalog"
  files["content/i18n/en/texts.json"] = json(sourceTexts)
  const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]))
  manifest.editingContract = {
    version: 1,
    pageOrder: [{ sectionId: "pg001_sec001", href: "index.html" }],
    pageDataIds: {
      "index.html": ["pg001_n001", "new-unstable-id", "pg001_im001"],
    },
  }
  manifest.frozen = {
    sourceTextsFingerprint: sha256(sourceTexts),
    pageHtmlFingerprints: {
      "index.html": createHash("sha256").update(files["index.html"]).digest("hex"),
    },
  }
  files["manifest.json"] = json(manifest)
  return Buffer.from(zipSync(files))
}

export function makeCurrentBundleWithLegacyQuizMarkup(): Buffer {
  const fingerprint = "0".repeat(64)
  return Buffer.from(zipSync({
    "manifest.json": json({
      formatVersion: 1,
      editingContract: {
        version: 1,
        pageOrder: [{ sectionId: "qz001", href: "index.html" }],
        pageDataIds: { "index.html": [] },
      },
      book: { label: "quiz-book", title: "Quiz Book" },
      languages: { source: "en", output: ["en"] },
      baselines: { glossary: null, tocGeneration: null, textCatalogTranslations: {} },
      textCatalog: { version: 1, idFingerprint: fingerprint },
      translatableText: { idFingerprint: fingerprint },
    }),
    "assets/config.json": json({ title: "Quiz Book", features: { activities: true } }),
    "content/pages.json": json([{ section_id: "qz001", href: "index.html" }]),
    "content/toc.json": json([]),
    "content/i18n/en/texts.json": json({ qz001_que: "Question" }),
    "index.html": strToU8(`<!doctype html><div id="content">
      <section data-id="qz001" data-section-type="activity_quiz">
        <p data-id="qz001_que">Question</p>
      </section>
    </div>`),
  }))
}

export function makeCurrentBundleWithExternallyAddedPage(): Buffer {
  const sourceTexts = {
    pg001_t001: "Original page",
    pg002_t001: "Page added outside Studio",
  }
  const pageOneHtml = `<!doctype html><html><body><main id="content">
    <section data-section-id="pg001_sec001" data-section-type="content">
      <p data-id="pg001_t001">Original page</p>
    </section>
  </main></body></html>`
  const pageTwoHtml = `<!doctype html><html><body><main id="content">
    <section data-section-id="pg002_sec001" data-section-type="content">
      <p data-id="pg002_t001">Page added outside Studio</p>
    </section>
  </main></body></html>`
  return Buffer.from(zipSync({
    "manifest.json": json({
      formatVersion: 1,
      editingContract: {
        version: 2,
        pageOrder: [
          { sectionId: "pg001_sec001", href: "index.html" },
          { sectionId: "pg002_sec001", href: "pg002_sec001.html" },
        ],
        pageDataIds: {
          "index.html": ["pg001_t001"],
          "pg002_sec001.html": ["pg002_t001"],
        },
        activities: [],
        nonActivities: [],
      },
      book: { label: "expanded-book", title: "Expanded Book" },
      languages: { source: "en", output: ["en"] },
      baselines: { glossary: null, tocGeneration: null, textCatalogTranslations: {} },
      textCatalog: { version: 1, idFingerprint: sha256(Object.keys(sourceTexts)) },
      translatableText: { idFingerprint: sha256(Object.keys(sourceTexts)) },
      frozen: {
        sourceTextsFingerprint: sha256(sourceTexts),
        // A new page deliberately has no frozen fingerprint: it did not exist
        // in the Studio export that the external editor started from.
        pageHtmlFingerprints: {
          "index.html": createHash("sha256").update(pageOneHtml).digest("hex"),
        },
      },
    }),
    "assets/config.json": json({
      title: "Expanded Book",
      languages: { available: ["en"], default: "en" },
      features: {},
    }),
    ".build-hash": strToU8("package-input-hash"),
    ".build-version": strToU8("package-version"),
    "content/pages.json": json([
      { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
      { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
    ]),
    "content/toc.json": json([]),
    "content/i18n/en/texts.json": json(sourceTexts),
    "index.html": strToU8(pageOneHtml),
    "pg002_sec001.html": strToU8(pageTwoHtml),
  }))
}

/** A fixed-layout export, mixing a positioned story page with the reflowable
 * pages Studio emits even in a fixed-layout book (a generated quiz, and an
 * activity page that keeps flowing markup). */
export function makeFixedLayoutBundle(): Buffer {
  const sourceTexts = {
    pg001_p000: "Ready for eruptions",
    pg002_p000: "Flowing activity copy",
    qz001_que: "Which rock is molten?",
    qz001_o0: "1) Granite",
    qz001_o0_exp: "Not quite.",
    qz001_o1: "2) Lava",
    qz001_o1_exp: "Correct!",
    qz001_o2: "3) Slate",
    qz001_o2_exp: "Try again.",
  }
  const segments = JSON.stringify([
    { text: "Ready for eruptions", style: { "font-family": "Chokle,serif", "font-size": "20px" } },
  ]).replaceAll("&", "&amp;").replaceAll('"', "&quot;")
  const storyPage = `<!doctype html><html><head>
    <meta name="viewport" content="width=1145, height=692" />
    <link href="./content/tailwind_output.css" rel="stylesheet">
  </head><body><main>
    <div id="content" data-fl-reference-width="1145" style="position:relative;width:1145px;height:692px;margin:0 auto;overflow:hidden">
  <img src="images/pg001_im001.png" alt="A volcano" data-id="pg001_im001" style="position:absolute;top:0px;left:0px;width:575px;height:692px">
  <p data-id="pg001_p000" data-segments="${segments}" data-adt-fit="1" style="position:absolute;top:597px;left:121px;line-height:20px;width:290px;height:20px;text-align:center">Ready for eruptions</p>
  <script src="./assets/auto-fit.js"></script>
</div>
  </main><script src="./assets/base.bundle.local.js"></script></body></html>`
  const reflowablePage = (
    sectionId: string,
    nodeId: string,
    text: string,
    sectionType = "activity_multiple_choice",
  ) => `<!doctype html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head><body><main>
    <div id="content" class="container content mx-auto w-full min-h-screen px-8 py-8 opacity-0">
      <section data-section-id="${sectionId}" data-section-type="${sectionType}">
        <p data-id="${nodeId}">${text}</p>
      </section>
    </div>
  </main></body></html>`
  return Buffer.from(zipSync({
    "assets/config.json": json({
      title: "Volcanoes",
      bundleVersion: "1",
      languages: { available: ["en"], default: "en" },
      features: { activities: true },
      fixedLayout: true,
    }),
    "content/pages.json": json([
      { section_id: "pg001_sec001", href: "index.html", page_number: 1 },
      { section_id: "pg002_sec001", href: "pg002_sec001.html", page_number: 2 },
      { section_id: "qz001", href: "qz001.html" },
    ]),
    "content/toc.json": json([]),
    "content/i18n/en/texts.json": json(sourceTexts),
    "images/pg001_im001.png": onePixelPng,
    "index.html": strToU8(storyPage),
    "pg002_sec001.html": strToU8(
      reflowablePage("pg002_sec001", "pg002_p000", "Flowing activity copy"),
    ),
    "qz001.html": strToU8(
      `${reflowablePage("qz001", "qz001_que", "Which rock is molten?", "activity_quiz")}
       <script>window.correctAnswers = JSON.parse('{"qz001_o0":false,"qz001_o1":true,"qz001_o2":false}')</script>`,
    ),
  }))
}

