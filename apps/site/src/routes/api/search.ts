import { createFileRoute } from '@tanstack/react-router';
import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';
import { DOCS_ENABLED } from '@/lib/flags';
import { ORAMA_LANGUAGE } from '@/i18n/locales';

// One index partition per locale, each tokenized in its own language.
// (Orama rejects BCP-47 tags like "pt-BR", so locales are mapped explicitly.)
// https://docs.orama.com/docs/orama-js/supported-languages
const server = createFromSource(source, {
  language: 'english',
  localeMap: ORAMA_LANGUAGE,
});

export const Route = createFileRoute('/api/search')({
  server: {
    handlers: {
      GET: () =>
        DOCS_ENABLED
          ? server.staticGET()
          : new Response(null, { status: 404 }),
    },
  },
});
