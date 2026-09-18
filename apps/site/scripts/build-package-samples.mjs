/**
 * Build the sample-package data consumed by <PackageExplorer /> on
 * /docs/reader-support/packages.
 *
 * Two modes:
 *
 *   node scripts/build-package-samples.mjs --extract <dir>
 *     <dir> holds unpacked WebPub and EPUB exports used as a verified reference, as
 *     <dir>/webpub and <dir>/epub. Curated excerpts are written to
 *     content/samples/, then the highlighted module is generated from them.
 *
 *   node scripts/build-package-samples.mjs
 *     Regenerates the highlighted module from the committed content/samples/.
 *
 * The excerpts are committed, so regeneration never needs the original
 * exports. Re-extract when the packagers change shape or a new reference is
 * selected for the collection.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const samplesDir = path.join(siteRoot, "content", "samples");
const outFile = path.join(siteRoot, "src", "data", "package-samples.generated.ts");

/** Language folder inside the sample book. */
const LANG = "en-US";

/**
 * Curated file list per format. `mode` decides which part of the file is
 * shown — most real files are dominated by boilerplate (reader-override CSS,
 * 300-entry resource lists) that teaches nothing.
 */
const FORMATS = [
  {
    id: "webpub",
    label: "WebPub",
    blurb:
      "The ADT data layer sits at the package root. EPUB is derived from this shape.",
    files: [
      {
        path: "manifest.json",
        lang: "json",
        note: "The entry point. Build navigation from readingOrder, toc, and pageList rather than from file names. metadata.conformsTo declares the Readium EPUB profile — Readium's own toolkits gate fixed-layout handling on it.",
        mode: { type: "jsonPick", arrayLimit: 3 },
      },
      {
        path: "assets/config.json",
        lang: "json",
        note: "The ADT manifest — read this first. Every features flag tells you whether data exists for that capability; false means nothing was produced, so hide the control rather than showing a dead one.",
        mode: { type: "full" },
      },
      {
        path: "content/pages.json",
        lang: "json",
        note: "The reading-order source: one entry per rendered section, with the printed page number where the book had one.",
        mode: { type: "jsonArray", keep: 4 },
      },
      {
        path: "pg003_sec001.html",
        lang: "html",
        note: "A content page, body only (the head is mostly reader-override CSS). Note data-section-type and data-section-id on the section, and data-id on every text and image node — those ids are the join key for the entire data layer.",
        mode: { type: "body", maxLines: 30 },
      },
      {
        path: "qz001.html",
        lang: "html",
        note: "A quiz activity page. The activity runtime reads its data-section-type, answer keys, and option data attributes; the page also contains its own nav container, which a host reader can replace with its own chrome.",
        mode: { type: "body", maxLines: 42 },
      },
      {
        path: `content/i18n/${LANG}/texts.json`,
        lang: "json",
        note: "The text map. Swapping these values into the matching data-id elements is how language switching and Easy Read both work. Keys ending _easy_read are the simplified variant of the same node.",
        mode: { type: "jsonKeys", keep: 10 },
      },
      {
        path: `content/i18n/${LANG}/glossary.json`,
        lang: "json",
        note: "Glossary terms, keyed by word. variations are the inflected forms to match in the text; image and video are optional per-term extras.",
        mode: { type: "jsonKeys", keep: 3 },
      },
      {
        path: `content/i18n/${LANG}/audios.json`,
        lang: "json",
        note: "Read-aloud clips, node id to file name. The files live alongside in audio/.",
        mode: { type: "jsonKeys", keep: 8 },
      },
      {
        path: `content/i18n/${LANG}/videos.json`,
        lang: "json",
        note: "Sign-language clips — the one file NOT keyed by node id. Ignore the video-<n> key and read the section id out of the filename instead.",
        mode: { type: "full" },
      },
      {
        // Taken from an export of the same book built with image localization
        // enabled. Shown for pt-BR because variants only exist for target
        // languages — the source-language map is always `{}`.
        path: "content/i18n/pt-BR/images.json",
        lang: "json",
        note: "Localized image variants. The key is the image node's data-id; the value is the translated file, which sits beside the original in images/. Images absent from the map have no translated version and keep their original src.",
        mode: { type: "full" },
      },
    ],
  },
  {
    id: "epub",
    label: "EPUB",
    blurb:
      "A standard EPUB 3 container. The same data layer rides inside OEBPS/, and two features are lowered into EPUB-native constructs.",
    files: [
      {
        path: "META-INF/container.xml",
        lang: "xml",
        note: "Standard OCF entry point — points at the OPF, which is what fixes the ADT data base at OEBPS/.",
        mode: { type: "full" },
      },
      {
        path: "OEBPS/content.opf",
        lang: "xml",
        note: "The package document. In a reflowable book every content document carries properties=\"scripted\", not just the activity pages. When a book has word timings, the media-overlay attribute appears on each content document's manifest <item> — never on the spine itemref. This book has none.",
        mode: { type: "xmlSections", maxLines: 40 },
      },
      {
        path: "OEBPS/glossary.xhtml",
        lang: "html",
        note: "The glossary lowered into the EPUB 3 Dictionaries and Glossaries model. In-text terms link here as <a epub:type=\"glossref\">, and a landmarks entry lets readers surface a Glossary tab. Because it is lowered, glossary.json is removed from the EPUB's language folders.",
        mode: { type: "body", maxLines: 26 },
      },
      {
        path: "OEBPS/pg003_sec001.xhtml",
        lang: "html",
        note: "The same page as the WebPub tab, converted to XHTML. The markup and the data-id values are identical — only the file extension and the glossref anchors differ.",
        mode: { type: "body", maxLines: 30 },
      },
      {
        path: "OEBPS/assets/config.json",
        lang: "json",
        note: "The same file one directory deeper — but not byte-identical to the WebPub copy: only the WebPub packager forces showNavigationControls and showTutorial to false. Compare this against the WebPub tab.",
        mode: { type: "full" },
      },
      {
        path: `OEBPS/content/i18n/${LANG}/texts.json`,
        lang: "json",
        note: "Also identical to the WebPub copy. A loader that resolves the base path once needs no other per-format branching.",
        mode: { type: "jsonKeys", keep: 8 },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Excerpting
// ---------------------------------------------------------------------------

const ELIDE = (n, what) => `… ${n} more ${what}`;

function excerpt(raw, mode, lang) {
  switch (mode.type) {
    case "full":
      return { text: raw.trimEnd(), truncated: false };

    case "jsonKeys": {
      const obj = JSON.parse(raw);
      const keys = Object.keys(obj);
      const kept = keys.slice(0, mode.keep);
      const out = {};
      for (const k of kept) out[k] = obj[k];
      let text = JSON.stringify(out, null, 2);
      const rest = keys.length - kept.length;
      if (rest > 0) {
        text = text.replace(/\n\}$/, `,\n\n  // ${ELIDE(rest, "entries")}\n}`);
      }
      return { text, truncated: rest > 0 };
    }

    case "jsonArray": {
      const arr = JSON.parse(raw);
      const kept = arr.slice(0, mode.keep);
      let text = JSON.stringify(kept, null, 2);
      const rest = arr.length - kept.length;
      if (rest > 0) text = text.replace(/\n\]$/, `,\n\n  // ${ELIDE(rest, "entries")}\n]`);
      return { text, truncated: rest > 0 };
    }

    case "jsonPick": {
      // Whole-object shape, but every long array collapsed to a few items.
      const obj = JSON.parse(raw);
      let elided = 0;
      const walk = (v) => {
        if (Array.isArray(v)) {
          if (v.length > mode.arrayLimit) {
            elided += v.length - mode.arrayLimit;
            return [...v.slice(0, mode.arrayLimit).map(walk), `__ELIDE__${v.length - mode.arrayLimit}`];
          }
          return v.map(walk);
        }
        if (v && typeof v === "object") {
          return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
        }
        return v;
      };
      const text = JSON.stringify(walk(obj), null, 2).replace(
        /"__ELIDE__(\d+)"/g,
        (_, n) => `// ${ELIDE(n, "entries")}`,
      );
      return { text, truncated: elided > 0 };
    }

    case "body": {
      const m = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const inner = m ? `<body${raw.match(/<body([^>]*)>/i)[1]}>${m[1]}</body>` : raw;
      return clampLines(dedent(inner), mode.maxLines);
    }

    case "headMeta": {
      const m = raw.match(/<head[^>]*>[\s\S]*?<\/head>/i);
      return clampLines(dedent(m ? m[0] : raw), mode.maxLines);
    }

    case "xmlSections": {
      // Keep the metadata block whole, then a taste of manifest and spine.
      const meta = raw.match(/<metadata[\s\S]*?<\/metadata>/i)?.[0] ?? "";
      const manifestItems = [...raw.matchAll(/^\s*<item\b[^>]*\/>/gim)].map((x) => x[0]);
      const spineItems = [...raw.matchAll(/^\s*<itemref\b[^>]*\/>/gim)].map((x) => x[0]);
      const head = raw.slice(0, raw.indexOf("<metadata"));
      const parts = [head.trimEnd(), meta];
      if (manifestItems.length) {
        parts.push(
          "  <manifest>",
          ...manifestItems.slice(0, 4),
          `    <!-- ${ELIDE(manifestItems.length - 4, "items")} -->`,
          "  </manifest>",
        );
      }
      if (spineItems.length) {
        parts.push(
          '  <spine toc="ncx">',
          ...spineItems.slice(0, 4),
          `    <!-- ${ELIDE(spineItems.length - 4, "itemrefs")} -->`,
          "  </spine>",
        );
      }
      parts.push("</package>");
      return clampLines(parts.join("\n"), mode.maxLines);
    }

    default:
      throw new Error(`unknown excerpt mode: ${mode.type}`);
  }
}

/** Strip the common leading indentation so excerpts don't start half-way across. */
function dedent(text) {
  const lines = text.split("\n");
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min)).join("\n");
}

function clampLines(text, max) {
  const lines = text.split("\n").filter((l, i, a) => !(l.trim() === "" && a[i - 1]?.trim() === ""));
  if (lines.length <= max) return { text: lines.join("\n").trimEnd(), truncated: false };
  return {
    text: `${lines.slice(0, max).join("\n").trimEnd()}\n\n<!-- ${ELIDE(lines.length - max, "lines")} -->`,
    truncated: true,
  };
}

// ---------------------------------------------------------------------------
// Extract → content/samples/
// ---------------------------------------------------------------------------

function extract(sourceDir) {
  // Public examples live in these format folders. Keep any non-public reference
  // material (such as PNLD fixtures used by LIP) outside this regeneration.
  for (const format of FORMATS) {
    fs.rmSync(path.join(samplesDir, format.id), { recursive: true, force: true });
  }
  let count = 0;
  for (const format of FORMATS) {
    for (const file of format.files) {
      const src = path.join(sourceDir, format.id, file.path);
      if (!fs.existsSync(src)) {
        console.warn(`  ! missing, skipped: ${format.id}/${file.path}`);
        file.__missing = true;
        continue;
      }
      const { text, truncated } = excerpt(fs.readFileSync(src, "utf-8"), file.mode, file.lang);
      const dest = path.join(samplesDir, format.id, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, `${text}\n`);
      file.__truncated = truncated;
      count++;
    }
  }
  fs.writeFileSync(
    path.join(samplesDir, "README.md"),
    [
      "# Sample package excerpts",
      "",
      "Curated excerpts from verified ADT exports, rendered by `<PackageExplorer />`",
      "on /docs/reader-support/packages. The collection is a reference set, not a",
      "required file naming convention, and may contain more than one source export.",
      "",
      "These are **excerpts**, not whole files — long resource lists and boilerplate",
      "are elided so each file shows the part that teaches something.",
      "",
      "Regenerate from a fresh set of exports:",
      "",
      "```bash",
      "node apps/site/scripts/build-package-samples.mjs --extract <dir-with-webpub-epub>",
      "```",
      "",
      "Re-highlight without re-extracting (e.g. after a theme change):",
      "",
      "```bash",
      "node apps/site/scripts/build-package-samples.mjs",
      "```",
      "",
      "Not scanned by fumadocs — only `content/docs/` is.",
      "",
    ].join("\n"),
  );
  console.log(`Extracted ${count} excerpts to content/samples/`);
}

// ---------------------------------------------------------------------------
// Highlight → src/data/package-samples.generated.ts
// ---------------------------------------------------------------------------

async function generate() {
  const require = createRequire(import.meta.url);
  const { getHighlighter } = await import(
    require.resolve("fumadocs-core/highlight", { paths: [siteRoot] })
  );
  const highlighter = await getHighlighter("js", {
    langs: ["json", "xml", "html"],
    themes: ["github-light", "github-dark"],
  });

  const formats = [];
  for (const format of FORMATS) {
    const files = [];
    for (const file of format.files) {
      const src = path.join(samplesDir, format.id, file.path);
      if (!fs.existsSync(src)) continue;
      const code = fs.readFileSync(src, "utf-8").trimEnd();
      const html = highlighter.codeToHtml(code, {
        lang: file.lang,
        themes: { light: "github-light", dark: "github-dark" },
        defaultColor: false,
      });
      files.push({
        path: file.path,
        note: file.note,
        lang: file.lang,
        lines: code.split("\n").length,
        html,
      });
    }
    formats.push({ id: format.id, label: format.label, blurb: format.blurb, files });
  }

  const banner = [
    "// GENERATED FILE — do not edit by hand.",
    "// Source: apps/site/content/samples/ · Script: apps/site/scripts/build-package-samples.mjs",
    "// Regenerate: node apps/site/scripts/build-package-samples.mjs",
    "",
    "export type PackageSampleFile = {",
    "  path: string;",
    "  note: string;",
    "  lang: string;",
    "  lines: number;",
    "  /** Pre-highlighted by Shiki at build time (github-light / github-dark). */",
    "  html: string;",
    "};",
    "",
    "export type PackageSampleFormat = {",
    "  id: string;",
    "  label: string;",
    "  blurb: string;",
    "  files: PackageSampleFile[];",
    "};",
    "",
  ].join("\n");

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(
    outFile,
    `${banner}export const PACKAGE_SAMPLES: PackageSampleFormat[] = ${JSON.stringify(formats, null, 2)};\n`,
  );

  const total = formats.reduce((n, f) => n + f.files.length, 0);
  const kb = Math.round(fs.statSync(outFile).size / 1024);
  console.log(`Generated ${total} highlighted files → src/data/package-samples.generated.ts (${kb} KB)`);
}

const extractFlag = process.argv.indexOf("--extract");
if (extractFlag !== -1) {
  const dir = process.argv[extractFlag + 1];
  if (!dir) throw new Error("--extract needs a directory containing webpub/ and epub/");
  extract(path.resolve(dir));
}
await generate();
