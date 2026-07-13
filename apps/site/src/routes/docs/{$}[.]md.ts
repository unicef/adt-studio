import { createFileRoute, notFound } from '@tanstack/react-router';
import { getLLMText, markdownPathToSlugs, source } from '@/lib/source';
import { DOCS_ENABLED } from '@/lib/flags';
import { DEFAULT_LOCALE } from '@/i18n/locales';

export const Route = createFileRoute('/docs/{$}.md')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!DOCS_ENABLED) throw notFound();
        const slugs = markdownPathToSlugs(params._splat?.split('/') ?? []);
        const page = source.getPage(slugs, DEFAULT_LOCALE);
        if (!page) throw notFound();

        return new Response(await getLLMText(page), {
          headers: {
            'Content-Type': 'text/markdown',
          },
        });
      },
    },
  },
});
