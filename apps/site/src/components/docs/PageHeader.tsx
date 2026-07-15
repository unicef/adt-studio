import type { CSSProperties, ReactNode } from "react";
import { DocsDescription, DocsTitle } from "fumadocs-ui/layouts/notebook/page";
import { useTreeContext, useTreePath } from "fumadocs-ui/contexts/tree";
import { getBreadcrumbItemsFromPath } from "fumadocs-core/breadcrumb";
import { icons } from "lucide-react";
import { DOCS_COLORS } from "@/data/docs-colors";

/**
 * Section eyebrow above the page title — the name of the sidebar group the
 * page belongs to (e.g. "Overview", "Get Started"). Derived from the page
 * tree, so it stays correct as the nav changes. Separators carry the group
 * name, which `useTreePath` includes in the path.
 */
function Eyebrow() {
  const { root } = useTreeContext();
  const path = useTreePath();
  const items = getBreadcrumbItemsFromPath(root, path, {
    includeSeparator: true,
    includePage: false,
  });
  const label = items.at(-1)?.name;
  if (!label) return null;

  return (
    <span className="mb-2 block text-sm text-fd-muted-foreground">{label}</span>
  );
}

export function PageHeader({
  title,
  description,
  icon,
  docsPath,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: string;
  /** URL slug path (e.g. "convert-pdf/extract", "" for the root) — looked
   * up in `DOCS_COLORS` for the page's icon + brand color, matching the app.
   * Falls back to the frontmatter `icon` (uncolored) if not in the map. */
  docsPath?: string;
}) {
  const entry = docsPath !== undefined ? DOCS_COLORS[docsPath] : undefined;
  const Icon = entry?.icon ?? (icon ? icons[icon as keyof typeof icons] : undefined);
  const color = entry?.hex;

  return (
    <div className="mb-8">
      <Eyebrow />
      <div className="flex items-center gap-2.5">
        {Icon ? (
          color ? (
            <span
              style={{ "--c": color } as CSSProperties}
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--c)_13%,transparent)] text-[var(--c)]"
            >
              <Icon className="size-5" aria-hidden />
            </span>
          ) : (
            <Icon className="size-7 shrink-0 text-fd-muted-foreground" aria-hidden />
          )
        ) : null}
        <DocsTitle className="mb-0">{title}</DocsTitle>
      </div>
      {description ? (
        <DocsDescription className="mb-0 mt-2">{description}</DocsDescription>
      ) : null}
    </div>
  );
}
