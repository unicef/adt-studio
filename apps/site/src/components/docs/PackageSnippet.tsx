import { useLingui } from "@lingui/react/macro";
import { PACKAGE_SAMPLES } from "@/data/package-samples.generated";

type PackageSnippetProps = {
  format?: string;
  path: string;
  title?: string;
};

/**
 * A syntax-highlighted excerpt from the curated real-book samples. The HTML
 * is produced by Shiki at build time; no package input reaches this component.
 */
export function PackageSnippet({
  format = "webpub",
  path,
  title,
}: PackageSnippetProps) {
  const { t } = useLingui();
  const sampleFormat = PACKAGE_SAMPLES.find((item) => item.id === format);
  const sample = sampleFormat?.files.find((item) => item.path === path);

  if (!sample || !sampleFormat) return null;

  return (
    <figure className="not-prose my-6 overflow-hidden rounded-xl border border-fd-border bg-[var(--fd-content-surface)]">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-fd-border px-4 py-2.5 text-sm">
        <span className="font-medium text-fd-foreground">
          {title ?? t`Verified export excerpt`}
        </span>
        <span className="text-fd-muted-foreground">
          {sampleFormat.label} · <code>{sample.path}</code>
        </span>
      </figcaption>
      <div
        className="max-h-[28rem] overflow-auto px-1 text-[13px] [&_pre]:!bg-transparent [&_pre]:p-3"
        // Pre-highlighted at build time by Shiki from committed, curated samples.
        dangerouslySetInnerHTML={{ __html: sample.html }}
      />
    </figure>
  );
}
