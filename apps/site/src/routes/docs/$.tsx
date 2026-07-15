import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { createServerFn } from '@tanstack/react-start';
import { slugsToMarkdownPath, source } from '@/lib/source';
import browserCollections from 'collections/browser';
import { DocsBody, DocsPage } from 'fumadocs-ui/layouts/notebook/page';
import { baseOptions } from '@/lib/layout.shared';
import { SidebarBanner } from '@/components/docs/SidebarBanner';
import { PageHeader } from '@/components/docs/PageHeader';
import { staticFunctionMiddleware } from '@tanstack/start-static-server-functions';
import { useFumadocsLoader } from 'fumadocs-core/source/client';
import { useLingui } from '@lingui/react';
import { Suspense, useMemo } from 'react';
import { useMDXComponents } from '@/components/mdx';
import { translatePageTree } from '@/lib/docs-i18n';
import { limitIconsToTopLevel } from '@/lib/docs-sidebar';
import { useLocalizedContent } from '@/lib/useLocalizedContent';
import { DEFAULT_LOCALE } from '@/i18n/locales';

export const Route = createFileRoute('/docs/$')({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split('/') ?? [];
    const data = await loader({ data: slugs });
    await clientLoader.preload(data.path);
    return data;
  },
});

const loader = createServerFn({
  method: 'GET',
})
  .inputValidator((slugs: string[]) => slugs)
  .middleware([staticFunctionMiddleware])
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs, DEFAULT_LOCALE);
    if (!page) throw notFound();

    return {
      path: page.path,
      docsPath: slugs.join('/'),
      markdownUrl: slugsToMarkdownPath(page.slugs).url,
      pageTree: await source.serializePageTree(
        source.getPageTree(DEFAULT_LOCALE),
      ),
    };
  });

const clientLoader = browserCollections.docs.createClientLoader({
  component(
    { toc, frontmatter, default: MDX },
    {
      markdownUrl,
      path,
      docsPath,
    }: {
      markdownUrl: string;
      path: string;
      docsPath: string;
    },
  ) {
    return (
      // No headings → no TOC, so render full-width instead of reserving the
      // (empty) TOC column on the right.
      <DocsPage toc={toc} full={toc.length === 0} breadcrumb={{ enabled: false }}>
        <PageHeader
          title={frontmatter.title}
          description={frontmatter.description}
          icon={frontmatter.icon}
          docsPath={docsPath}
        />
        <DocsBody>
          <MDX components={useMDXComponents()} />
        </DocsBody>
      </DocsPage>
    );
  },
});

function Page() {
  const { pageTree, path, markdownUrl, docsPath } = useFumadocsLoader(Route.useLoaderData());
  const { i18n } = useLingui();
  const base = baseOptions();
  const tree = useMemo(() => limitIconsToTopLevel(translatePageTree(pageTree)), [pageTree]);
  // Load the translated MDX for the active locale when it exists (English
  // fallback), preloading it before swapping so hydration matches the
  // prerendered (default-locale) HTML.
  const contentPath = useLocalizedContent(clientLoader, path, i18n.locale);

  return (
    <DocsLayout
      {...base}
      nav={{ ...base.nav, mode: 'auto' }}
      sidebar={{ banner: <SidebarBanner />, collapsible: false }}
      tree={tree}
    >
      <Link to={markdownUrl} hidden />
      <Suspense>
        {clientLoader.useContent(contentPath, { markdownUrl, path, docsPath })}
      </Suspense>
    </DocsLayout>
  );
}
