import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  BookOpen,
  BookOpenText,
  Captions,
  Hand,
  HelpCircle,
  Languages,
  List,
  ShieldCheck,
  Volume2,
  type LucideIcon,
} from "lucide-react";

export type ReaderFeature = {
  key: string;
  icon: LucideIcon;
  /** Stage color, mirrors apps/studio stage-config so the site matches the app. */
  hex: string;
  label: MessageDescriptor;
  blurb: MessageDescriptor;
  /** Demo clip key (data/demos.ts) that shows this feature, when one exists. */
  demo?: string;
};

/** The reader-facing accessibility modes — what every exported book gains. */
export const MODES: ReaderFeature[] = [
  {
    key: "listen",
    icon: Volume2,
    hex: "#e11d48",
    label: msg`Listen`,
    blurb: msg`Natural text-to-speech with word-by-word highlighting, timed page by page.`,
    demo: "read-aloud",
  },
  {
    key: "easy-read",
    icon: BookOpenText,
    hex: "#a21caf",
    label: msg`Easy-read`,
    blurb: msg`Simplified text for lower reading levels, kept side by side with the original.`,
    demo: "assistant",
  },
  {
    key: "translate",
    icon: Languages,
    hex: "#db2777",
    label: msg`Translate`,
    blurb: msg`The same edition in every language you need, including captions and alt text.`,
  },
  {
    key: "sign",
    icon: Hand,
    hex: "#0891b2",
    label: msg`Sign language`,
    blurb: msg`Sign-language video linked to each section, searchable while you assign it.`,
    demo: "assistant",
  },
  {
    key: "captions",
    icon: Captions,
    hex: "#0d9488",
    label: msg`Captions`,
    blurb: msg`Described visuals and image alt text for every figure in the book.`,
  },
];

/** Supporting outputs every edition also gains. */
export const EXTRAS: ReaderFeature[] = [
  {
    key: "quizzes",
    icon: HelpCircle,
    hex: "#ea580c",
    label: msg`Quizzes`,
    blurb: msg`Comprehension checks and drag-and-drop activities, generated per section.`,
    demo: "activities",
  },
  {
    key: "glossary",
    icon: BookOpen,
    hex: "#65a30d",
    label: msg`Glossary`,
    blurb: msg`Key terms defined in place, with manual additions where you need them.`,
  },
  {
    key: "contents",
    icon: List,
    hex: "#d97706",
    label: msg`Contents`,
    blurb: msg`A navigable table of contents, generated from the book's real structure.`,
  },
  {
    key: "wcag",
    icon: ShieldCheck,
    hex: "#2563eb",
    label: msg`WCAG validated`,
    blurb: msg`Real MathML, semantic HTML and a validation pass before every export.`,
    demo: "math",
  },
];

export const ALL_FEATURES: ReaderFeature[] = [...MODES, ...EXTRAS];
