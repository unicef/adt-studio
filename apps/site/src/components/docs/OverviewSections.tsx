import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { FolderArchive, History, Eye, type LucideIcon } from "lucide-react";
import { DOCS_COLORS } from "@/data/docs-colors";

interface NavCard {
  title: MessageDescriptor;
  desc: MessageDescriptor;
  splat: string;
}

// Icon + color for each card come from DOCS_COLORS (same map PageHeader and
// the docs landing pages use), so a page looks identical here and there.
const START: NavCard[] = [
  { title: msg`What is an ADT?`, desc: msg`An introduction to accessible digital textbooks and this tool.`, splat: "get-started/what-is-an-adt" },
  { title: msg`Get Started`, desc: msg`What to know and set up before converting your first PDF.`, splat: "get-started" },
  { title: msg`Convert a PDF into an ADT`, desc: msg`Import, extract, section, storyboard, and validate.`, splat: "convert-pdf" },
  { title: msg`Enhance your ADT`, desc: msg`Captions, quizzes, Easy Read, sign language, and more.`, splat: "enhance" },
  { title: msg`Localize your ADT`, desc: msg`Reach more languages, with narrated audio for each.`, splat: "localize" },
  { title: msg`Export your ADT`, desc: msg`Package your finished ADT for distribution.`, splat: "export" },
  { title: msg`Troubleshooting & FAQ`, desc: msg`Answers to common questions and issues.`, splat: "faq" },
];

/** Visual card grid replacing the plain "where to begin" link list. */
export function WhereToBegin() {
  const { i18n } = useLingui();
  return (
    <div className="not-prose mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {START.map(({ title, desc, splat }) => {
        const entry = DOCS_COLORS[splat];
        const Icon = entry?.icon;
        const color = entry?.hex ?? "#64748b";
        return (
          <Link
            key={splat}
            to="/docs/$"
            params={{ _splat: splat }}
            style={{ "--c": color } as CSSProperties}
            className="group flex flex-col gap-2 rounded-xl border border-fd-border bg-[var(--fd-content-surface)] p-4 no-underline shadow-sm transition-all hover:border-[color-mix(in_oklab,var(--c)_45%,transparent)] hover:shadow-md"
          >
            {Icon ? (
              <span className="grid size-9 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--c)_13%,transparent)] text-[var(--c)] transition-colors group-hover:bg-[color-mix(in_oklab,var(--c)_20%,transparent)]">
                <Icon className="size-[1.15rem]" />
              </span>
            ) : null}
            <span className="font-semibold text-fd-foreground">
              {i18n._(title)}
            </span>
            <span className="text-sm leading-relaxed text-fd-muted-foreground">
              {i18n._(desc)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

const PRINCIPLES: { icon: LucideIcon; title: MessageDescriptor; desc: MessageDescriptor }[] = [
  { icon: FolderArchive, title: msg`One book, one folder`, desc: msg`Every book lives in a single, shareable directory — zip it, move it, hand it off.` },
  { icon: History, title: msg`Nothing overwritten`, desc: msg`Entities are versioned, never replaced. You can always roll back to an earlier result.` },
  { icon: Eye, title: msg`Cached & inspectable`, desc: msg`Every LLM call is cached and openable. Change the inputs and only the changed work reruns.` },
];

/** Three-up principles grid replacing the "why it exists" wall of text. Not
 * clickable, so icons are plain (muted, no color chip) rather than branded. */
export function Principles() {
  const { i18n } = useLingui();
  return (
    <div className="not-prose mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
      {PRINCIPLES.map(({ icon: Icon, title, desc }) => (
        <div key={i18n._(title)} className="flex flex-col gap-2.5">
          <Icon className="size-6 text-fd-muted-foreground" />
          <span className="font-semibold text-fd-foreground">
            {i18n._(title)}
          </span>
          <span className="text-sm leading-relaxed text-fd-muted-foreground">
            {i18n._(desc)}
          </span>
        </div>
      ))}
    </div>
  );
}
