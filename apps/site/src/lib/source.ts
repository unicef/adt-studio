import { loader } from 'fumadocs-core/source';
import { defineI18n } from 'fumadocs-core/i18n';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docs } from 'collections/server';
import { docsRoute } from './shared';
import { DEFAULT_LOCALE, LOCALES, type AppLocale } from '@/i18n/locales';

/**
 * Docs i18n. Translations live in per-locale folders (`parser: 'dir'`), so a
 * file like `fr/pipeline/extract.mdx` is the French *variant* of
 * `pipeline/extract` — not a separate page. `hideLocale: 'always'` keeps one
 * clean URL per page (we drive the active locale from client state, shared with
 * the landing page, rather than from the URL). Untranslated pages fall back to
 * English. This also makes the search index locale-partitioned.
 */
export const i18n = defineI18n({
  languages: [...LOCALES],
  defaultLanguage: DEFAULT_LOCALE,
  fallbackLanguage: DEFAULT_LOCALE,
  parser: 'dir',
  hideLocale: 'always',
});

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: docsRoute,
  i18n,
  plugins: [lucideIconsPlugin()],
});

export function markdownPathToSlugs(segs: string[]) {
  if (segs.length === 0) return [];

  const out = [...segs];
  out[out.length - 1] = out[out.length - 1].replace(/\.md$/, '');
  if (out.length === 1 && out[0] === 'index') out.pop();
  return out;
}

export function slugsToMarkdownPath(slugs: string[]) {
  const segments = [...slugs];
  if (segments.length === 0) {
    segments.push('index.md');
  } else {
    segments[segments.length - 1] += '.md';
  }

  return {
    segments,
    url: `${docsRoute}/${segments.join('/')}`,
  };
}

export async function getLLMText(page: (typeof source)['$inferPage']) {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title} (${page.url})

${processed}`;
}

/**
 * Build the complete, deterministic documentation corpus for one locale.
 * Fumadocs supplies the English fallback for any missing translated page.
 */
export async function getLLMFullText(locale: AppLocale) {
  const pages = [...source.getPages(locale)].sort((a, b) =>
    a.url.localeCompare(b.url),
  );
  const scanned = await Promise.all(pages.map(getLLMText));
  return scanned.join('\n\n');
}
