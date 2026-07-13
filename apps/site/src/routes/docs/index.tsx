import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";
import { DocsLayout } from "fumadocs-ui/layouts/notebook";
import { DocsBody, DocsPage } from "fumadocs-ui/layouts/notebook/page";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { useLingui } from "@lingui/react";
import browserCollections from "collections/browser";
import { Suspense, useMemo } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { slugsToMarkdownPath, source } from "@/lib/source";
import { translatePageTree } from "@/lib/docs-i18n";
import { useLocalizedContent } from "@/lib/useLocalizedContent";
import { SidebarBanner } from "@/components/docs/SidebarBanner";
import { useMDXComponents } from "@/components/mdx";
import { DOCS_ENABLED } from "@/lib/flags";
import { seo } from "@/lib/seo";
import { DEFAULT_LOCALE } from "@/i18n/locales";

const loader = createServerFn({ method: "GET" })
  .middleware([staticFunctionMiddleware])
  .handler(async () => {
    const page = source.getPage([], DEFAULT_LOCALE);
    if (!page) throw notFound();

    return {
      path: page.path,
      markdownUrl: slugsToMarkdownPath(page.slugs).url,
      pageTree: await source.serializePageTree(
        source.getPageTree(DEFAULT_LOCALE),
      ),
    };
  });

const clientLoader = browserCollections.docs.createClientLoader({
  // The Overview is a landing page: a custom hero (in the MDX) instead of the
  // standard page header, rendered full-width with no table of contents.
  component({ default: MDX }) {
    return (
      <DocsPage full breadcrumb={{ enabled: false }}>
        <DocsBody>
          <MDX components={useMDXComponents()} />
        </DocsBody>
      </DocsPage>
    );
  },
});

export const Route = createFileRoute("/docs/")({
  component: Page,
  beforeLoad: () => {
    if (!DOCS_ENABLED) throw redirect({ to: "/" });
  },
  loader: async () => {
    const data = await loader();
    await clientLoader.preload(data.path);
    return data;
  },
  head: () =>
    seo({
      title: "Documentation",
      description:
        "Learn how to turn any PDF into an accessible book with ADT Studio.",
    }),
});

function Page() {
  const { pageTree, path, markdownUrl } = useFumadocsLoader(
    Route.useLoaderData(),
  );
  const { i18n } = useLingui();
  const base = baseOptions();
  // Render the Overview in the active (landing) locale: load the matching
  // index.<locale>.mdx when one exists, falling back to English — preloading
  // it before swapping so hydration matches the prerendered HTML.
  const contentPath = useLocalizedContent(clientLoader, path, i18n.locale);
  const tree = useMemo(() => translatePageTree(pageTree), [pageTree]);

  return (
    <DocsLayout
      {...base}
      nav={{ ...base.nav, mode: "auto" }}
      sidebar={{ banner: <SidebarBanner />, collapsible: false }}
      tree={tree}
    >
      <Link to={markdownUrl} hidden />
      <Suspense>{clientLoader.useContent(contentPath)}</Suspense>
    </DocsLayout>
  );
}
