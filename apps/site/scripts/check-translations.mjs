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

// ── Presentation helpers ──────────────────────────────────────────────────────
const IN_CI = process.env.GITHUB_ACTIONS === "true";
const useColor = !process.env.NO_COLOR && (IN_CI || process.stdout.isTTY);
const paint = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const red = paint("31");
const green = paint("32");
const yellow = paint("33");
const cyan = paint("36");
const bold = paint("1");
const dim = paint("2");

const ICON = { ok: green("✔"), bad: red("✖"), warn: yellow("▲") };

// GitHub Actions annotations show up inline on the PR (Checks / Files tabs).
// Capped at ~10 per type per run, so we emit a small, high-signal set.
const annotations = [];
const annotate = (level, message, file) =>
  annotations.push({ level, message, file });
const flushAnnotations = () => {
  if (!IN_CI) return;
  for (const a of annotations.slice(0, 10)) {
    const loc = a.file ? ` file=${a.file}` : "";
    console.log(`::${a.level}${loc}::${a.message}`);
  }
};

const section = (p) => (p.includes("/") ? p.split("/")[0] : "(root)");
const leaf = (p) => (p.includes("/") ? p.split("/").slice(1).join("/") : p);

function printBySection(paths, indent = "    ") {
  const groups = new Map();
  for (const p of paths.sort()) {
    const s = section(p);
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(leaf(p));
  }
  const pad = Math.max(...[...groups.keys()].map((k) => k.length));
  for (const [s, items] of groups)
    console.log(
      `${indent}${cyan(s.padEnd(pad))}  ${dim(String(items.length).padStart(2))}  ${dim(items.join(", "))}`,
    );
}

const errors = []; // always fail the build
const gaps = []; // fail only under --strict (incomplete, but not structurally broken)

// ── Filesystem helpers ────────────────────────────────────────────────────────
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

const bodyOf = (abs) =>
  readFileSync(abs, "utf8").replace(/^---[\s\S]*?\n---\s*/, ""); // strip frontmatter

const isStub = (abs) => {
  const body = bodyOf(abs).toLowerCase();
  return STUB_MARKERS.some((m) => body.includes(m));
};

// A message is untranslated when its msgstr is empty. Ignore the header entry
// (empty msgid) and obsolete entries (commented out with `#~`).
function emptyMsgstrCount(poText) {
  let missing = 0;
  for (const block of poText.split("\n\n")) {
    if (!/^msgid /m.test(block)) continue;
    if (/^#~ /m.test(block)) continue; // obsolete entry
    const idMatch = block.match(/^msgid ((?:"(?:[^"\\]|\\.)*"\s*)+)/m);
    const strMatch = block.match(/^msgstr ((?:"(?:[^"\\]|\\.)*"\s*)+)/m);
    if (!idMatch || !strMatch) continue;
    const unquote = (s) =>
      (s.match(/"((?:[^"\\]|\\.)*)"/g) || []).map((q) => q.slice(1, -1)).join("");
    if (unquote(idMatch[1]) === "") continue; // header
    if (unquote(strMatch[1]) === "") missing += 1;
  }
  return missing;
}

console.log(bold(`\nTranslation check${STRICT ? " (strict)" : ""}\n`));

// ── UI strings: Lingui .po catalogs ──────────────────────────────────────────
console.log(bold("UI strings ") + dim("· src/locales/*.po"));
for (const loc of TARGET_LOCALES) {
  const po = join(LOCALES_DIR, `${loc}.po`);
  if (!existsSync(po)) {
    errors.push(`missing catalog src/locales/${loc}.po`);
    console.log(`  ${ICON.bad} ${loc.padEnd(6)} catalog missing`);
    continue;
  }
  const missing = emptyMsgstrCount(readFileSync(po, "utf8"));
  if (missing === 0) {
    console.log(`  ${ICON.ok} ${loc.padEnd(6)} ${dim("all messages translated")}`);
  } else {
    console.log(`  ${ICON.bad} ${loc.padEnd(6)} ${red(`${missing} untranslated`)}`);
    gaps.push(`${loc}.po: ${missing} untranslated message(s)`);
    annotate("error", `${loc}.po has ${missing} untranslated message(s). Run 'pnpm --filter @adt/site extract' and fill the empty msgstr.`, `apps/site/src/locales/${loc}.po`);
  }
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
  console.error(red(`\n${ICON.bad} missing source folder content/docs/${SOURCE_LOCALE}/`));
  process.exit(1);
}
const enPages = walk(enDir);

console.log(bold("\nDocs pages ") + dim(`· content/docs · ${enPages.length} source pages`));
const perLocale = {};
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
  const missing = enPages.filter((p) => !have.has(p));
  const done = enPages.length - missing.length - stubs.length;
  perLocale[loc] = { missing, stubs };

  const pct = Math.round((done / Math.max(enPages.length, 1)) * 100);
  const icon = missing.length === 0 && stubs.length === 0 ? ICON.ok : ICON.bad;
  const bits = [`${done}/${enPages.length} done`];
  if (missing.length) bits.push(red(`${missing.length} missing`));
  if (stubs.length) bits.push(yellow(`${stubs.length} stub`));
  console.log(`  ${icon} ${loc.padEnd(6)} ${dim(`${pct}%`)}  ${bits.join(dim(" · "))}`);
}

// Detail — printed once if every locale is missing the same set (the common
// case), otherwise per locale. Keeps the log short instead of repeating 24×3.
const missingSets = TARGET_LOCALES.map((l) => JSON.stringify(perLocale[l].missing.sort()));
const sameMissing = missingSets.every((s) => s === missingSets[0]);
const anyMissing = TARGET_LOCALES.some((l) => perLocale[l].missing.length);
const anyStub = TARGET_LOCALES.some((l) => perLocale[l].stubs.length);

if (anyMissing) {
  if (sameMissing) {
    console.log(dim(`\n  Untranslated in all locales (${perLocale[TARGET_LOCALES[0]].missing.length}):`));
    printBySection(perLocale[TARGET_LOCALES[0]].missing);
  } else {
    for (const loc of TARGET_LOCALES) {
      if (!perLocale[loc].missing.length) continue;
      console.log(dim(`\n  ${loc} — untranslated (${perLocale[loc].missing.length}):`));
      printBySection(perLocale[loc].missing);
    }
  }
  for (const loc of TARGET_LOCALES)
    if (perLocale[loc].missing.length)
      gaps.push(`${loc}: ${perLocale[loc].missing.length} docs page(s) untranslated`);
  // One annotation per locale (concise, stays under the annotation cap).
  for (const loc of TARGET_LOCALES)
    if (perLocale[loc].missing.length)
      annotate("error", `${loc}: ${perLocale[loc].missing.length} docs page(s) not translated. Mirror them from content/docs/en/ under content/docs/${loc}/.`);
}

if (anyStub) {
  const stubUnion = [...new Set(TARGET_LOCALES.flatMap((l) => perLocale[l].stubs))].sort();
  console.log(yellow(`\n  Placeholder stubs (translate or delete so they fall back to English):`));
  for (const loc of TARGET_LOCALES)
    for (const s of perLocale[loc].stubs) {
      gaps.push(`${loc}/${s} is a placeholder stub`);
      annotate("warning", `${loc}/${s} is a placeholder stub — translate it or delete it so it falls back to English.`, `apps/site/content/docs/${loc}/${s}`);
    }
  console.log(`    ${dim(stubUnion.join(", "))}`);
}

// ── Verdict ───────────────────────────────────────────────────────────────────
console.log("");
if (errors.length) {
  console.error(red(bold(`${ICON.bad} ${errors.length} structural error(s) — these always block:`)));
  for (const e of errors) console.error(`    ${red("•")} ${e}`);
  errors.slice(0, 8).forEach((e) => annotate("error", e));
}

const blocked = errors.length || (STRICT && gaps.length);

if (blocked) {
  if (STRICT && gaps.length)
    console.error(red(bold(`${ICON.bad} translations are incomplete — PR blocked (${gaps.length} issue(s) above).`)));
  console.error(dim("\n  To fix:"));
  console.error(dim("    • Translate the pages listed above (mirror content/docs/en/… under each locale)."));
  console.error(dim("    • Replace or delete any placeholder stubs."));
  console.error(dim("    • Fill empty msgstr, then: pnpm --filter @adt/site extract"));
  console.error(dim("    • Re-check: node apps/site/scripts/check-translations.mjs --strict"));
  flushAnnotations();
  process.exit(1);
}

if (gaps.length) {
  console.log(yellow(bold(`${ICON.warn} ${gaps.length} incomplete translation(s) — warnings (run with --strict to enforce).`)));
} else {
  console.log(green(bold(`${ICON.ok} translations complete.`)));
}
flushAnnotations();
