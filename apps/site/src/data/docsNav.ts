import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  Bug,
  FileDown,
  Globe,
  LifeBuoy,
  Lightbulb,
  Rocket,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type DocLink = {
  href: string;
  label: MessageDescriptor;
  desc?: MessageDescriptor;
  icon: LucideIcon;
};

/** Mirrors content/docs/en/meta.json — the guide sections in reading order. */
export const DOC_GUIDES: DocLink[] = [
  {
    href: "/docs/get-started",
    icon: Rocket,
    label: msg`Get started`,
    desc: msg`Install, add an AI provider, learn what an ADT is.`,
  },
  {
    href: "/docs/convert-pdf",
    icon: Workflow,
    label: msg`Convert a PDF into an ADT`,
    desc: msg`Import, extract, section, storyboard, validate.`,
  },
  {
    href: "/docs/enhance",
    icon: Lightbulb,
    label: msg`Enhance your ADT`,
    desc: msg`Captions, easy read, sign language, quizzes, glossary, contents.`,
  },
  {
    href: "/docs/localize",
    icon: Globe,
    label: msg`Localize your ADT`,
    desc: msg`Translate the text and generate narration.`,
  },
  {
    href: "/docs/export",
    icon: FileDown,
    label: msg`Export your ADT`,
    desc: msg`Formats and personalization.`,
  },
];

export const DOC_HELP: DocLink[] = [
  { href: "/docs/faq", icon: LifeBuoy, label: msg`Troubleshooting & FAQ` },
  { href: "/docs/reporting-issues", icon: Bug, label: msg`Reporting issues` },
];
