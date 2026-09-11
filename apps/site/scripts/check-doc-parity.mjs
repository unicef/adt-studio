/**
 * Structural parity check for translated docs.
 *
 * `check-translations.mjs` verifies that a translated file *exists*. It cannot
 * tell whether that file still says the same things as its English source, so
 * a page can be rewritten in English — or condensed on the way into a locale —
 * and still report as 100% translated.
 *
 * This check compares the *shape* of each translation against its English
 * source: headings, code blocks, callouts, accordions, steps, table rows,
 * embedded snippets, and internal doc links. Prose length is deliberately not
 * compared (translations legitimately run 10–20% longer than English), but a
 * missing section, a dropped code sample, or a lost callout all change one of
 * these counts.
 *
 *   node apps/site/scripts/check-doc-parity.mjs            # report
 *   node apps/site/scripts/check-doc-parity.mjs --strict   # exit 1 on mismatch
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = path.join(siteRoot, "content", "docs");
const SOURCE = "en";
const strict = process.argv.includes("--strict");

/** Countable structures. A change in any of these means content moved or vanished. */
const SIGNALS = {
  headings2: /^## /gm,
  headings3: /^### /gm,
  codeBlocks: /```/g,
  callouts: /<Callout/g,
  accordions: /<Accordion\s/g,
  steps: /<Step>/g,
  tableRows: /^\|/gm,
  snippets: /<PackageSnippet/g,
  docLinks: /\]\(\/docs\//g,
};

function signature(file) {
  const src = fs.readFileSync(file, "utf-8");
  const out = {};
  for (const [name, re] of Object.entries(SIGNALS)) {
    const n = (src.match(re) ?? []).length;
    out[name] = name === "codeBlocks" ? n / 2 : n;
  }
  return out;
}

/** Every .mdx under a locale, as locale-relative paths. */
function pagesFor(locale) {
  const root = path.join(docsRoot, locale);
  if (!fs.existsSync(root)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".mdx")) out.push(path.relative(root, full));
    }
  };
  walk(root);
  return out.sort();
}

const locales = fs
  .readdirSync(docsRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== SOURCE)
  .map((e) => e.name)
  .sort();

const sourcePages = pagesFor(SOURCE);
const problems = [];

console.log(`\nDoc structure parity · ${sourcePages.length} English pages · vs ${locales.join(", ")}\n`);

for (const locale of locales) {
  const translated = new Set(pagesFor(locale));
  let mismatches = 0;

  for (const page of sourcePages) {
    if (!translated.has(page)) continue; // untranslated — check-translations.mjs owns that
    const en = signature(path.join(docsRoot, SOURCE, page));
    const loc = signature(path.join(docsRoot, locale, page));
    const diffs = Object.keys(en)
      .filter((k) => en[k] !== loc[k])
      .map((k) => `${k} ${en[k]}→${loc[k]}`);
    if (diffs.length) {
      problems.push(`${locale}/${page}: ${diffs.join(", ")}`);
      mismatches++;
    }
  }

  const checked = sourcePages.filter((p) => translated.has(p)).length;
  console.log(
    mismatches === 0
      ? `  ✔ ${locale.padEnd(6)} ${checked} page(s) structurally match English`
      : `  ✖ ${locale.padEnd(6)} ${mismatches} of ${checked} page(s) differ`,
  );
}

if (problems.length) {
  console.log("\nStructural differences (English → locale):\n");
  for (const p of problems) console.log(`  ${p}`);
  console.log(
    "\nA count that dropped usually means a section, code sample, or callout was\n" +
      "lost when the English page changed. Update the translation to match.\n",
  );
  if (strict) process.exit(1);
} else {
  console.log("\n✔ all translated pages structurally match their English source.\n");
}
