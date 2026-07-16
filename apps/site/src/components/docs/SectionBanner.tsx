import type { CSSProperties } from "react";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  Code2,
  Download,
  FileDown,
  KeyRound,
  Lightbulb,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { DOCS_COLORS } from "@/data/docs-colors";

type Pill = { label: MessageDescriptor; hex: string; icon: LucideIcon };

function pillsFromSlugs(slugs: string[], labels: MessageDescriptor[]): Pill[] {
  return slugs.map((slug, i) => {
    const entry = DOCS_COLORS[slug];
    return { label: labels[i], hex: entry?.hex ?? "#64748b", icon: entry?.icon ?? Sparkles };
  });
}

const SECTIONS: Record<string, Pill[]> = {
  "get-started": pillsFromSlugs(
    [
      "get-started/what-is-an-adt",
      "get-started/what-is-adt-studio",
      "get-started/what-type-of-content",
      "get-started/install",
      "get-started/api-keys",
    ],
    [msg`What is an ADT?`, msg`What is ADT Studio?`, msg`Content type`, msg`Install`, msg`API keys`],
  ),
  "convert-pdf": pillsFromSlugs(
    [
      "convert-pdf/import-pdf",
      "convert-pdf/extract",
      "convert-pdf/sectioning",
      "convert-pdf/storyboard",
      "convert-pdf/validate-preview",
    ],
    [msg`Import`, msg`Extract`, msg`Sectioning`, msg`Storyboard`, msg`Validate`],
  ),
  enhance: pillsFromSlugs(
    [
      "enhance/captions",
      "enhance/easy-read",
      "enhance/sign-language",
      "enhance/quizzes",
      "enhance/glossary",
      "enhance/table-of-contents",
    ],
    [
      msg`Captions`,
      msg`Easy Read`,
      msg`Sign language`,
      msg`Quizzes`,
      msg`Glossary`,
      msg`Contents`,
    ],
  ),
  localize: pillsFromSlugs(
    ["localize/language", "localize/speech"],
    [msg`Language`, msg`Speech`],
  ),
  export: pillsFromSlugs(
    ["export/project-archive", "export/web", "export/scorm", "export/webpub", "export/epub"],
    [msg`Project Archive`, msg`Web`, msg`SCORM`, msg`WebPub`, msg`EPUB`],
  ),
  faq: [
    { label: msg`General`, icon: Sparkles, hex: "" },
    { label: msg`Installing`, icon: Download, hex: "" },
    { label: msg`AI providers & cost`, icon: KeyRound, hex: "" },
    { label: msg`Converting`, icon: Workflow, hex: "" },
    { label: msg`Accessibility`, icon: Lightbulb, hex: "" },
    { label: msg`Exporting`, icon: FileDown, hex: "" },
    { label: msg`Developers`, icon: Code2, hex: "" },
  ],
};

/**
 * Toned-down sibling of the Overview's `GetStartedBanner` — same gradient +
 * grid + glass-pill treatment (deliberately unlike anything in the app's own
 * UI), scoped to a section's own brand color and its sub-pages. Reserved for
 * the five first-layer nav pages (Get Started, Convert a PDF, Enhance,
 * Export, Troubleshooting & FAQ) — sub-pages don't get one of these.
 */
export function SectionBanner({ slug }: { slug: keyof typeof SECTIONS }) {
  const { i18n } = useLingui();
  const entry = DOCS_COLORS[slug];
  const color = entry?.hex ?? "#64748b";
  const Icon = entry?.icon;
  const pills = SECTIONS[slug];
  if (!pills || !Icon) return null;

  return (
    <div
      className="not-prose relative my-6 flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-fd-border px-6 py-9"
      style={{ "--c": color } as CSSProperties}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in oklab, var(--c) 55%, white 45%) 0%, var(--c) 50%, color-mix(in oklab, var(--c) 55%, black 45%) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.11] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:28px_28px]"
      />
      <div
        aria-hidden
        className="absolute -top-16 left-1/4 size-64 -translate-x-1/2 rounded-full bg-white/25 blur-3xl"
      />

      <div className="relative z-10 grid size-14 shrink-0 place-items-center rounded-2xl border border-white/25 bg-white/15 shadow-lg backdrop-blur-sm">
        <Icon className="size-7 text-white" aria-hidden />
      </div>

      <div className="relative z-10 flex max-w-2xl flex-wrap justify-center gap-2">
        {pills.map((pill, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 py-1 pl-1 pr-2.5 text-xs font-medium text-white backdrop-blur-sm"
          >
            {pill.hex ? (
              <span
                className="grid size-5 shrink-0 place-items-center rounded-full text-white"
                style={{ backgroundColor: pill.hex }}
              >
                <pill.icon className="size-3" />
              </span>
            ) : (
              <pill.icon className="size-3.5 shrink-0" />
            )}
            {i18n._(pill.label)}
          </span>
        ))}
      </div>
    </div>
  );
}
