import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, File, Folder } from "lucide-react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { cn } from "@/lib/cn";
import {
  PACKAGE_SAMPLES,
  type PackageSampleFile,
} from "@/data/package-samples.generated";

type TreeNode =
  | { kind: "dir"; name: string; path: string; children: TreeNode[] }
  | { kind: "file"; name: string; path: string; file: PackageSampleFile };

/** Translatable prose that accompanies curated, verified export excerpts. */
const SAMPLE_COPY: Record<string, MessageDescriptor> = {
  webpub: msg`The ADT data layer sits at the package root. EPUB is derived from this shape.`,
  epub: msg`A standard EPUB 3 container. The same data layer rides inside OEBPS/, and two features are lowered into EPUB-native constructs.`,
  "webpub:manifest.json": msg`The entry point. Build navigation from readingOrder, toc, and pageList rather than from file names. metadata.conformsTo declares the Readium EPUB profile, which Readium's own toolkits use to gate fixed-layout handling.`,
  "webpub:assets/config.json": msg`The ADT manifest. Read this first. Every features flag tells you whether data exists for that capability; false means nothing was produced, so hide the control rather than showing a dead one.`,
  "webpub:content/pages.json": msg`The reading-order source: one entry per rendered section, with the printed page number where the book had one.`,
  "webpub:pg003_sec001.html": msg`A content page, body only. Note data-section-type and data-section-id on the section, and data-id on every text and image node. Those ids are the join key for the data layer.`,
  "webpub:qz001.html": msg`A quiz activity page. The activity runtime reads its data-section-type, answer keys, and option data attributes; the page also contains its own nav container, which a host reader can replace with its own chrome.`,
  "webpub:content/i18n/en-US/texts.json": msg`The text map. Swapping these values into matching data-id elements powers both language switching and Easy Read. Keys ending _easy_read are simplified variants of the same node.`,
  "webpub:content/i18n/en-US/glossary.json": msg`Glossary terms, keyed by word. variations are the inflected forms to match in the text; image and video are optional per-term extras.`,
  "webpub:content/i18n/en-US/audios.json": msg`Read-aloud clips, mapping node id to file name. The files live alongside in audio/.`,
  "webpub:content/i18n/en-US/videos.json": msg`Sign-language clips. This is the one file not keyed by node id: ignore the video-<n> key and read the section id from the filename instead.`,
  "webpub:content/i18n/pt-BR/images.json": msg`Localized image variants. The key is the image node\u0027s data-id and the value is the translated file, which sits beside the original. Shown for pt-BR because variants exist for target languages; the source-language map is always empty.`,
  "epub:META-INF/container.xml": msg`Standard OCF entry point. It points at the OPF, which fixes the ADT data base at OEBPS/.`,
  "epub:OEBPS/content.opf": msg`The package document. In a reflowable book every content document carries properties="scripted", not just activity pages. When a book has word timings, media-overlay appears on each content document's manifest item, never on the spine itemref. This book has none.`,
  "epub:OEBPS/glossary.xhtml": msg`The glossary lowered into the EPUB 3 Dictionaries and Glossaries model. In-text terms link here as epub:type="glossref", and a landmarks entry lets readers surface a Glossary tab. Because it is lowered, glossary.json is removed from EPUB language folders.`,
  "epub:OEBPS/pg003_sec001.xhtml": msg`The same page as the WebPub tab, converted to XHTML. The markup and data-id values are identical; only the file extension and glossref anchors differ.`,
  "epub:OEBPS/assets/config.json": msg`The same file one directory deeper. Only the WebPub packager forces showNavigationControls and showTutorial to false, so compare this with the WebPub tab.`,
  "epub:OEBPS/content/i18n/en-US/texts.json": msg`Also identical to the WebPub copy. A loader that resolves the base path once needs no further per-format branching.`,
};

/** Build a nested tree from the flat, slash-separated sample paths. */
function buildTree(files: PackageSampleFile[]): TreeNode[] {
  const roots: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let level = roots;
    let prefix = "";

    parts.forEach((part, i) => {
      prefix = prefix ? `${prefix}/${part}` : part;

      if (i === parts.length - 1) {
        level.push({ kind: "file", name: part, path: prefix, file });
        return;
      }

      let dir = level.find(
        (n): n is Extract<TreeNode, { kind: "dir" }> =>
          n.kind === "dir" && n.name === part,
      );
      if (!dir) {
        dir = { kind: "dir", name: part, path: prefix, children: [] };
        level.push(dir);
      }
      level = dir.children;
    });
  }

  // Directories first, then files — each alphabetical, mirroring a file explorer.
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) =>
        a.kind === b.kind
          ? a.name.localeCompare(b.name)
          : a.kind === "dir"
            ? -1
            : 1,
      )
      .map((n) => (n.kind === "dir" ? { ...n, children: sort(n.children) } : n));

  return sort(roots);
}

function TreeRow({
  node,
  depth,
  selected,
  onSelect,
  selectedRowRef,
}: {
  node: TreeNode;
  depth: number;
  selected: string;
  onSelect: (path: string) => void;
  selectedRowRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(true);
  const pad = { paddingInlineStart: `${depth * 0.75 + 0.5}rem` };

  if (node.kind === "dir") {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={pad}
          className="flex w-full items-center gap-1.5 py-1 pe-2 text-start text-[13px] text-fd-muted-foreground transition-colors hover:bg-fd-accent/60 hover:text-fd-foreground"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 transition-transform duration-200",
              open && "rotate-90",
            )}
          />
          <Folder className="size-3.5 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {open
          ? node.children.map((child) => (
              <TreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                selected={selected}
                onSelect={onSelect}
                selectedRowRef={selectedRowRef}
              />
            ))
          : null}
      </>
    );
  }

  const isSelected = node.path === selected;
  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      ref={isSelected ? selectedRowRef : undefined}
      style={pad}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-1.5 py-1 pe-2 text-start text-[13px] transition-colors",
        isSelected
          ? "bg-fd-primary/10 font-medium text-fd-primary"
          : "text-fd-muted-foreground hover:bg-fd-accent/60 hover:text-fd-foreground",
      )}
    >
      <span className="w-3 shrink-0" />
      <File className="size-3.5 shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

/**
 * Two-pane explorer over curated excerpts from verified exports in the two
 * reader-targeted formats. Left: the package tree. Right: the file, with
 * a note on why it matters.
 *
 * Content comes from `package-samples.generated.ts`, produced by
 * `scripts/build-package-samples.mjs` — excerpts are pre-highlighted by Shiki
 * at build time, so nothing ships a highlighter to the browser.
 */
export function PackageExplorer() {
  const { i18n, t } = useLingui();
  const [formatId, setFormatId] = useState(PACKAGE_SAMPLES[0]?.id ?? "");
  const format =
    PACKAGE_SAMPLES.find((f) => f.id === formatId) ?? PACKAGE_SAMPLES[0];

  const [selectedByFormat, setSelectedByFormat] = useState<
    Record<string, string>
  >({});
  const selected = selectedByFormat[format.id] ?? format.files[0]?.path ?? "";
  const active =
    format.files.find((f) => f.path === selected) ?? format.files[0];
  const blurb = SAMPLE_COPY[format.id]
    ? i18n._(SAMPLE_COPY[format.id])
    : format.blurb;
  const note = active && SAMPLE_COPY[`${format.id}:${active.path}`]
    ? i18n._(SAMPLE_COPY[`${format.id}:${active.path}`])
    : active?.note;

  const tree = useMemo(() => buildTree(format.files), [format]);
  const treePanelRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const treePanel = treePanelRef.current;
    const selectedRow = selectedRowRef.current;
    if (!treePanel || !selectedRow) return;

    const selectedTop =
      selectedRow.getBoundingClientRect().top -
      treePanel.getBoundingClientRect().top +
      treePanel.scrollTop;
    treePanel.scrollTo({
      top: selectedTop - (treePanel.clientHeight - selectedRow.offsetHeight) / 2,
    });
  }, [format.id, selected]);

  return (
    <div
      data-package-explorer=""
      className="not-prose my-6 overflow-hidden rounded-xl border border-fd-border bg-[var(--fd-content-surface)]"
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-fd-border px-2 py-2">
        {PACKAGE_SAMPLES.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFormatId(f.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              f.id === format.id
                ? "bg-fd-primary/10 text-fd-primary"
                : "text-fd-muted-foreground hover:bg-fd-accent/60 hover:text-fd-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="border-b border-fd-border px-4 py-2.5 text-sm text-fd-muted-foreground">
        {blurb}
      </p>

      <div className="grid md:items-stretch md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <div
          ref={treePanelRef}
          className="max-h-[18rem] overflow-y-auto border-b border-fd-border pt-2 md:max-h-none md:self-stretch md:border-b-0 md:border-e"
        >
          {tree.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              depth={0}
              selected={selected}
              onSelect={(path) =>
                setSelectedByFormat((prev) => ({ ...prev, [format.id]: path }))
              }
              selectedRowRef={selectedRowRef}
            />
          ))}
        </div>

        <div className="min-w-0">
          {active ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-fd-border px-4 py-2">
                <code className="text-[13px] font-medium text-fd-foreground">
                  {active.path}
                </code>
                <span className="text-xs text-fd-muted-foreground">
                  {t`excerpt`} · {active.lines} {t`lines`}
                </span>
              </div>
              <p className="px-4 py-3 text-sm leading-relaxed text-fd-muted-foreground">
                {note}
              </p>
              <div
                className="max-h-[26rem] overflow-auto border-t border-fd-border px-1 text-[13px] [&_pre]:!bg-transparent [&_pre]:p-3"
                // Pre-highlighted at build time by Shiki from files in the repo —
                // no user input reaches this.
                dangerouslySetInnerHTML={{ __html: active.html }}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
