import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  Accessibility,
  Eye,
  Feather,
  FolderArchive,
  History,
  Zap,
  type LucideIcon,
} from "lucide-react";

const PRINCIPLES: {
  icon: LucideIcon;
  title: MessageDescriptor;
  desc: MessageDescriptor;
}[] = [
  {
    icon: FolderArchive,
    title: msg`Everything in one place`,
    desc: msg`One folder holds the whole book — source, settings, every version.`,
  },
  {
    icon: History,
    title: msg`Nothing is ever lost`,
    desc: msg`Every version is kept. Roll back to any earlier result, any time.`,
  },
  {
    icon: Zap,
    title: msg`No repeated work`,
    desc: msg`Unchanged steps reuse cached results instantly, at no extra cost.`,
  },
  {
    icon: Eye,
    title: msg`Full transparency`,
    desc: msg`Every AI call, and its cost, is saved and inspectable.`,
  },
  {
    icon: Feather,
    title: msg`Built to last`,
    desc: msg`Deliberately simple — easy to maintain, update, and extend.`,
  },
  {
    icon: Accessibility,
    title: msg`Accessible by design`,
    desc: msg`Checked against WCAG standards before every export.`,
  },
];

/** Six-up grid for the full principles list (vs. the Overview's 3-item teaser). Static, not clickable. */
export function PrincipleCards() {
  const { i18n } = useLingui();
  return (
    <div className="not-prose mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {PRINCIPLES.map(({ icon: Icon, title, desc }) => (
        <div
          key={i18n._(title)}
          className="flex flex-col gap-2.5 rounded-xl border border-fd-border bg-[var(--fd-content-surface)] p-4"
        >
          <Icon className="size-5 text-fd-muted-foreground" />
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
