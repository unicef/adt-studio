import { createFileRoute } from '@tanstack/react-router';
import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';
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
      GET: () => server.staticGET(),
    },
  },
});
