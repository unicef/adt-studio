import { createFileRoute, notFound } from '@tanstack/react-router';
import { isAppLocale } from '@/i18n/locales';
import { getLLMFullText } from '@/lib/source';

export const Route = createFileRoute('/llms-full/{$}.txt')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const locale = params._splat;
        if (!locale || !isAppLocale(locale)) throw notFound();

        return new Response(await getLLMFullText(locale), {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
      },
    },
  },
});
