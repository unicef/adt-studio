import { ChevronRight } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { type ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";

export type ReleaseChannel = "stable" | "beta";

const schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "details",
    "summary",
    "kbd",
    "sub",
    "sup",
    "picture",
    "source",
    "video",
    "track",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
    details: [["open"]],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      "loading",
      "decoding",
      ["width"],
      ["height"],
    ],
    video: [
      ["src"],
      ["poster"],
      ["controls"],
      ["muted"],
      ["autoplay"],
      ["loop"],
      ["playsinline"],
      ["width"],
      ["height"],
    ],
    source: [["src"], ["type"], ["media"], ["srcset"]],
  },
};

const components: Components = {
  h1: ({ className, ...rest }) => (
    <h2
      className={cn(
        "mt-10 text-2xl font-bold tracking-tight text-[color:var(--color-foreground)] first:mt-0 md:text-3xl",
        className,
      )}
      {...rest}
    />
  ),
  h2: ({ className, ...rest }) => (
    <h3
      className={cn(
        "mt-10 flex items-baseline gap-2 text-xl font-bold tracking-tight text-[color:var(--color-foreground)] first:mt-0 md:text-2xl",
        className,
      )}
      {...rest}
    />
  ),
  h3: ({ className, ...rest }) => (
    <h4
      className={cn(
        "mt-8 text-base font-semibold tracking-tight text-[color:var(--color-foreground)]",
        className,
      )}
      {...rest}
    />
  ),
  h4: ({ className, ...rest }) => (
    <h5
      className={cn(
        "mt-6 text-sm font-semibold uppercase tracking-[0.14em] text-[color:var(--color-muted-foreground)]",
        className,
      )}
      {...rest}
    />
  ),
  p: ({ className, ...rest }) => (
    <p
      className={cn(
        "mt-4 text-[15px] leading-relaxed text-[color:var(--color-foreground)]/90 first:mt-0",
        className,
      )}
      {...rest}
    />
  ),
  a: ({ className, href, ...rest }) => (
    <a
      href={href}
      target={isExternal(href) ? "_blank" : undefined}
      rel={isExternal(href) ? "noreferrer noopener" : undefined}
      className={cn(
        "font-medium text-[color:var(--color-primary)] underline-offset-2 transition-colors hover:underline",
        className,
      )}
      {...rest}
    />
  ),
  strong: ({ className, ...rest }) => (
    <strong
      className={cn(
        "font-semibold text-[color:var(--color-foreground)]",
        className,
      )}
      {...rest}
    />
  ),
  em: ({ className, ...rest }) => (
    <em className={cn("italic", className)} {...rest} />
  ),
  code: ({ className, children, ...rest }: ComponentProps<"code">) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code
          className={cn(
            "block whitespace-pre font-mono text-[13px] leading-relaxed text-[color:var(--color-foreground)]",
            className,
          )}
          {...rest}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className={cn(
          "rounded bg-[color:var(--color-muted)] px-1.5 py-0.5 font-mono text-[0.85em] text-[color:var(--color-foreground)]",
          className,
        )}
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: ({ className, ...rest }) => (
    <pre
      className={cn(
        "mt-5 overflow-x-auto rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40 p-4",
        className,
      )}
      {...rest}
    />
  ),
  ul: ({ className, ...rest }) => (
    <ul
      className={cn(
        "mt-4 flex list-none flex-col gap-2 pl-0",
        className,
      )}
      {...rest}
    />
  ),
  ol: ({ className, ...rest }) => (
    <ol
      className={cn(
        "mt-4 flex list-decimal flex-col gap-2 pl-6 marker:font-mono marker:text-[color:var(--color-muted-foreground)]",
        className,
      )}
      {...rest}
    />
  ),
  li: ({ className, children, ...rest }) => (
    <li
      className={cn(
        "relative pl-6 text-[15px] leading-relaxed text-[color:var(--color-foreground)]/90 before:absolute before:left-1 before:top-[0.55em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[color:var(--color-primary)]/60",
        className,
      )}
      {...rest}
    >
      {children}
    </li>
  ),
  blockquote: ({ className, ...rest }) => (
    <blockquote
      className={cn(
        "mt-5 border-l-2 border-[color:var(--color-primary)]/40 bg-[color:var(--color-muted)]/30 px-4 py-2 text-[15px] italic text-[color:var(--color-muted-foreground)]",
        className,
      )}
      {...rest}
    />
  ),
  hr: ({ className, ...rest }) => (
    <hr
      className={cn(
        "my-10 border-0 border-t border-dashed border-[color:var(--color-border)]",
        className,
      )}
      {...rest}
    />
  ),
  img: ({ className, alt, ...rest }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
      className={cn(
        "mt-5 w-full rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-muted)]/30 shadow-[0_8px_28px_-18px_rgba(0,0,0,0.18)]",
        className,
      )}
      {...rest}
    />
  ),
  video: ({ className, ...rest }) => (
    <video
      controls
      playsInline
      className={cn(
        "mt-5 w-full rounded-xl border border-[color:var(--color-border)] bg-black/95 shadow-[0_8px_28px_-18px_rgba(0,0,0,0.22)]",
        className,
      )}
      {...rest}
    />
  ),
  table: ({ className, ...rest }) => (
    <div className="mt-5 overflow-x-auto rounded-xl border border-[color:var(--color-border)]">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        {...rest}
      />
    </div>
  ),
  th: ({ className, ...rest }) => (
    <th
      className={cn(
        "border-b border-[color:var(--color-border)] bg-[color:var(--color-muted)]/40 px-3 py-2 text-left font-semibold",
        className,
      )}
      {...rest}
    />
  ),
  td: ({ className, ...rest }) => (
    <td
      className={cn(
        "border-b border-[color:var(--color-border)]/60 px-3 py-2 align-top",
        className,
      )}
      {...rest}
    />
  ),
  kbd: ({ className, ...rest }) => (
    <kbd
      className={cn(
        "inline-flex items-center rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-1.5 py-0.5 font-mono text-[0.8em] text-[color:var(--color-foreground)] shadow-[inset_0_-1px_0_rgba(0,0,0,0.04)]",
        className,
      )}
      {...rest}
    />
  ),
  details: ({ className, ...rest }) => (
    <details
      className={cn(
        "group/details mt-4 overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-card)] transition-colors open:bg-[color:var(--color-muted)]/40",
        className,
      )}
      {...rest}
    />
  ),
  summary: ({ className, children, ...rest }) => (
    <summary
      className={cn(
        "flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-[color:var(--color-foreground)] transition-colors hover:bg-[color:var(--color-accent)]/40 [&::-webkit-details-marker]:hidden",
        className,
      )}
      {...rest}
    >
      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--color-muted-foreground)] transition-transform duration-200 group-open/details:rotate-90" />
      <span className="min-w-0 flex-1">{children}</span>
    </summary>
  ),
};

function isExternal(href: string | undefined): boolean {
  if (!href) return false;
  return /^https?:\/\//i.test(href);
}

/**
 * GitHub's light/dark `<picture>` snippet doesn't survive the markdown
 * sanitize/raw pipeline reliably — the browser can fall back to the bare-host
 * `<img src="https://github.com">` placeholder and render a broken image.
 * Rewrite each `<picture>` block to a plain markdown image using the best
 * available source (prefer the light variant for our light surface).
 */
function normalizePictures(md: string): string {
  return md.replace(/<picture>[\s\S]*?<\/picture>/gi, (block) => {
    const firstSrcset = (re: RegExp): string | null => {
      const m = re.exec(block);
      if (!m) return null;
      const url = m[1].split(",")[0]?.trim().split(/\s+/)[0];
      return url || null;
    };
    const light = firstSrcset(
      /<source[^>]+media=["'][^"']*light[^"']*["'][^>]*srcset=["']([^"']+)["']/i,
    );
    const any = firstSrcset(/<source[^>]+srcset=["']([^"']+)["']/i);
    const imgMatch = /<img[^>]+src=["']([^"']+)["']/i.exec(block);
    const imgSrc = imgMatch?.[1];
    const usableImg =
      imgSrc && /^https?:\/\/[^/]+\/[^/]/.test(imgSrc) ? imgSrc : null;
    const altMatch = /<img[^>]+alt=["']([^"']*)["']/i.exec(block);
    const alt = altMatch?.[1] ?? "";

    const url = light || any || usableImg;
    return url ? `\n\n![${alt}](${url})\n\n` : "";
  });
}

export function ReleaseMarkdown({
  source,
  channel = "stable",
  className,
}: {
  source: string;
  channel?: ReleaseChannel;
  className?: string;
}) {
  const normalized = normalizePictures(source);
  return (
    <div
      data-channel={channel}
      className={cn(
        "release-markdown",
        channel === "beta" &&
          "rounded-2xl border border-amber-200/60 bg-amber-50/40 px-5 py-4",
        className,
      )}
    >
      {channel === "beta" && <BetaBanner />}
      <div className="release-markdown-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
          components={components}
        >
          {normalized}
        </ReactMarkdown>
      </div>
    </div>
  );
}

function BetaBanner() {
  return (
    <div className="-mx-1 mb-2 flex items-center gap-2 rounded-lg border border-amber-200/70 bg-amber-100/40 px-3 py-2 text-[12px] font-semibold text-amber-800">
      <span className="inline-flex items-center rounded-md bg-amber-200/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        <Trans>Beta</Trans>
      </span>
      <Trans>
        Pre-release — APIs and behavior may still change before the stable cut.
      </Trans>
    </div>
  );
}
