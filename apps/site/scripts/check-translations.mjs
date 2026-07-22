#!/usr/bin/env node
// Translation completeness linter for apps/site. Covers both halves of the
// site's i18n:
//   1. UI strings  — the Lingui catalogs in src/locales/<locale>.po
//   2. Docs pages  — the per-locale MDX under content/docs/<locale>/ (fumadocs
//                    `parser: 'dir'`): content/docs/en/… is the source, and
//                    content/docs/<locale>/… mirrors it.
//
// This script:
//   • ALWAYS FAILS on structural errors:
//       - an orphan translation (a <locale>/<path> with no en/<path> source)
//       - a translated page missing a `title` in its frontmatter
//       - an unknown top-level folder (not a known locale)
//   • ALWAYS REPORTS per-locale coverage (UI strings + docs pages).
//   • With --strict (used by CI) additionally FAILS when translations are not
//     fully done, so an incomplete PR is blocked:
//       - a target-locale .po catalog has any empty msgstr
//       - a docs page has no translation in some target locale
//       - a translated docs page is only a placeholder stub
//
// Run: node apps/site/scripts/check-translations.mjs            (report only)
//      node apps/site/scripts/check-translations.mjs --strict   (CI blocker)
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const STRICT = process.argv.includes("--strict");

const SITE = fileURLToPath(new URL("..", import.meta.url));
const DOCS = join(SITE, "content/docs");
const LOCALES_DIR = join(SITE, "src/locales");

// Keep in sync with src/i18n/locales.ts (can't import TS from a plain script).
const SOURCE_LOCALE = "en";
const TARGET_LOCALES = ["pt-BR", "es", "fr"];
const ALL_LOCALES = new Set([SOURCE_LOCALE, ...TARGET_LOCALES]);

// Phrases used by placeholder pages ("this page is under construction"), across
// the supported locales. A translated page containing one of these is not done.
const STUB_MARKERS = [
  "under construction",
  "en construcción",
  "en cours de rédaction",
  "em construção",
];

const errors = []; // always fail the build
const gaps = []; // fail only under --strict (incomplete, but not structurally broken)

function walk(dir, base = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...walk(full, rel));
    else if (/\.mdx?$/.test(entry)) out.push(rel);
  }
  return out;
}

const hasTitle = (abs) =>
  /(^|\n)title:\s*\S/.test(readFileSync(abs, "utf8").slice(0, 400));

const bodyOf = (abs) => {
  const raw = readFileSync(abs, "utf8");
  return raw.replace(/^---[\s\S]*?\n---\s*/, ""); // strip frontmatter
};

const isStub = (abs) => {
  const body = bodyOf(abs).toLowerCase();
  return STUB_MARKERS.some((m) => body.includes(m));
};

// ── UI strings: Lingui .po catalogs ──────────────────────────────────────────
// A message is untranslated when its msgstr is empty. We ignore the header
// entry (empty msgid) and obsolete entries (commented out with `#~`).
function emptyMsgstrCount(poText) {
  let missing = 0;
  for (const block of poText.split("\n\n")) {
    if (!/^msgid /m.test(block)) continue;
    if (/^#~ /m.test(block)) continue; // obsolete entry
    const idMatch = block.match(/^msgid ((?:"(?:[^"\\]|\\.)*"\s*)+)/m);
    const strMatch = block.match(/^msgstr ((?:"(?:[^"\\]|\\.)*"\s*)+)/m);
    if (!idMatch || !strMatch) continue;
    const unquote = (s) => (s.match(/"((?:[^"\\]|\\.)*)"/g) || []).map((q) => q.slice(1, -1)).join("");
    if (unquote(idMatch[1]) === "") continue; // header
    if (unquote(strMatch[1]) === "") missing += 1;
  }
  return missing;
}

console.log("UI strings (src/locales/*.po):");
for (const loc of TARGET_LOCALES) {
  const po = join(LOCALES_DIR, `${loc}.po`);
  if (!existsSync(po)) {
    errors.push(`missing catalog src/locales/${loc}.po`);
    continue;
  }
  const missing = emptyMsgstrCount(readFileSync(po, "utf8"));
  console.log(`  ${loc.padEnd(6)} ${missing === 0 ? "complete" : `${missing} untranslated`}`);
  if (missing > 0)
    gaps.push(`${loc}.po has ${missing} untranslated message(s) — run 'pnpm --filter @adt/site extract' and fill the empty msgstr`);
}

// ── Docs pages: per-locale MDX ────────────────────────────────────────────────
// Unknown top-level folders (everything must be a locale folder).
for (const entry of readdirSync(DOCS)) {
  if (!statSync(join(DOCS, entry)).isDirectory()) continue;
  if (!ALL_LOCALES.has(entry)) {
    const guess = [...ALL_LOCALES].find((l) => l.toLowerCase() === entry.toLowerCase());
    errors.push(
      `unknown top-level folder "${entry}"` +
        (guess ? ` — did you mean "${guess}"?` : " — docs are organized in per-locale folders (en/, pt-BR/, …)"),
    );
  }
}

const enDir = join(DOCS, SOURCE_LOCALE);
if (!existsSync(enDir)) {
  console.error(`✗ missing source folder content/docs/${SOURCE_LOCALE}/`);
  process.exit(1);
}
const enPages = walk(enDir);
console.log(`\nDocs pages (content/docs/${SOURCE_LOCALE}/): ${enPages.length}`);

for (const loc of TARGET_LOCALES) {
  const dir = join(DOCS, loc);
  const have = new Set(existsSync(dir) ? walk(dir) : []);
  const stubs = [];
  for (const t of have) {
    if (!enPages.includes(t)) {
      errors.push(`orphan: ${loc}/${t} has no ${SOURCE_LOCALE}/${t} source (page renamed or deleted?)`);
      continue;
    }
    if (!hasTitle(join(dir, t)))
      errors.push(`${loc}/${t} is missing a "title" in its frontmatter`);
    if (isStub(join(dir, t))) stubs.push(t);
  }
  const translated = enPages.filter((p) => have.has(p));
  const missing = enPages.filter((p) => !have.has(p));
  const pct = Math.round((translated.length / Math.max(enPages.length, 1)) * 100);
  console.log(`  ${loc.padEnd(6)} ${translated.length}/${enPages.length} (${pct}%)${stubs.length ? `, ${stubs.length} stub(s)` : ""}`);
  if (missing.length) console.log(`         missing: ${missing.join(", ")}`);
  if (stubs.length) console.log(`         stubs:   ${stubs.join(", ")}`);
  if (missing.length)
    gaps.push(`${loc} docs: ${missing.length} page(s) not translated (${missing.join(", ")})`);
  for (const s of stubs)
    gaps.push(`${loc}/${s} is a placeholder stub — translate it or delete it so it falls back to English`);
}

// ── Verdict ───────────────────────────────────────────────────────────────────
if (errors.length) {
  console.error(`\n✗ ${errors.length} structural translation error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (STRICT && gaps.length) {
  console.error(`\n✗ ${gaps.length} incomplete translation(s) (--strict):`);
  for (const g of gaps) console.error(`  - ${g}`);
  process.exit(1);
}

if (gaps.length) {
  console.log(`\n⚠ ${gaps.length} incomplete translation(s) — warnings (run with --strict to enforce):`);
  for (const g of gaps) console.log(`  - ${g}`);
}

console.log("\n✓ no structural translation errors");
