import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import * as React from 'react';
import { I18nProvider, useLingui } from '@lingui/react';
import { i18n } from '@lingui/core';
import appCss from '@/styles/app.css?url';
import { RootProvider } from 'fumadocs-ui/provider/tanstack';
import SearchDialog from '@/components/search';
import { docsUiI18n } from '@/lib/fumadocs-ui-i18n';
import { DOCS_ENABLED } from '@/lib/flags';
import { activateDetectedLocale } from '@/i18n/setup';
import { trackPageView } from '@/lib/matomo';
import { seo } from '@/lib/seo';

const MATOMO_SNIPPET = `
var _paq = window._paq = window._paq || [];
_paq.push(['enableLinkTracking']);
(function() {
  var u="//observa.unicef.org/";
  _paq.push(['setTrackerUrl', u+'matomo.php']);
  _paq.push(['setSiteId', '148']);
  var d=document, g=d.createElement('script'), s=d.getElementsByTagName('script')[0];
  g.async=true; g.src=u+'matomo.js'; s.parentNode.insertBefore(g,s);
})();
`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...seo().meta,
    ],
    links: [
      { rel: 'icon', href: `${import.meta.env.BASE_URL}favicon.ico` },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400;1,700&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootComponent,
});

function MatomoTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    trackPageView(document.title, window.location.href);
  }, [pathname]);

  return null;
}

function LocaleInitializer() {
  React.useEffect(() => {
    // The docs are prerendered in the default locale; switching the locale
    // before late-hydrating boundaries (e.g. the lazy MDX content) finish
    // causes a hydration mismatch. Defer activation past the first paint so the
    // initial client render matches the server, then apply the detected locale.
    const raf = requestAnimationFrame(() => activateDetectedLocale());
    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}

function RootComponent() {
  return (
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: MATOMO_SNIPPET }} />
      </head>
      <body className="flex flex-col min-h-screen">
        <I18nProvider i18n={i18n}>
          <LocalizedShell />
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Bridges our client-side Lingui locale into fumadocs' built-in UI
 * translations: the active locale picks the chrome dictionary (TOC, search
 * dialog, pagination, …) passed to RootProvider, re-rendering on locale change.
 */
function LocalizedShell() {
  const { i18n: lingui } = useLingui();

  return (
    <RootProvider
      search={DOCS_ENABLED ? { SearchDialog } : { enabled: false }}
      theme={{ enabled: false }}
      i18n={docsUiI18n(lingui.locale)}
    >
      <LocaleInitializer />
      <MatomoTracker />
      <Outlet />
    </RootProvider>
  );
}
