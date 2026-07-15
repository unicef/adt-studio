/**
 * Strip `icon` from every page-tree node below the top level. Icons stay on
 * the 7 top-level entries (root pages + folder rows); nested sub-pages show
 * their icon in the page content itself (`PageHeader`) instead of the
 * sidebar, keeping the tree scannable.
 */
export function limitIconsToTopLevel<T>(tree: T): T {
  const stripIcons = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(stripIcons);
    if (node && typeof node === "object") {
      const { icon: _icon, ...rest } = node as Record<string, unknown>;
      if (Array.isArray(rest.children)) rest.children = rest.children.map(stripIcons);
      return rest;
    }
    return node;
  };

  const root = tree as { children?: unknown[] };
  if (!Array.isArray(root.children)) return tree;

  return {
    ...root,
    children: root.children.map((child) => {
      if (child && typeof child === "object" && Array.isArray((child as { children?: unknown[] }).children)) {
        return { ...child, children: ((child as { children: unknown[] }).children).map(stripIcons) };
      }
      return child;
    }),
  } as T;
}
