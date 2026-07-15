import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  AudioLines,
  BookOpen,
  FileDown,
  FileText,
  HelpCircle,
  Image,
  Languages,
  LayoutGrid,
  List,
  Network,
  type LucideIcon,
} from "lucide-react";

export type Stage = {
  slug: string;
  label: MessageDescriptor;
  icon: LucideIcon;
  hex: string;
};

// Mirrors the real pipeline stages and their exact colors/icons from
// apps/studio/src/components/pipeline/stage-config.ts — the app's own stage
// identity — so this preview strip looks the same as the real app.
export const STAGES: Stage[] = [
  { slug: "extract", label: msg`Extract`, icon: FileText, hex: "#2563eb" },
  { slug: "sectioning", label: msg`Sectioning`, icon: Network, hex: "#0284c7" },
  { slug: "storyboard", label: msg`Storyboard`, icon: LayoutGrid, hex: "#7c3aed" },
  { slug: "quizzes", label: msg`Quizzes`, icon: HelpCircle, hex: "#ea580c" },
  { slug: "captions", label: msg`Captions`, icon: Image, hex: "#0d9488" },
  { slug: "glossary", label: msg`Glossary`, icon: BookOpen, hex: "#65a30d" },
  { slug: "toc", label: msg`Contents`, icon: List, hex: "#d97706" },
  { slug: "translate", label: msg`Language`, icon: Languages, hex: "#db2777" },
  { slug: "speech", label: msg`Speech`, icon: AudioLines, hex: "#e11d48" },
  { slug: "package", label: msg`Package`, icon: FileDown, hex: "#4338ca" },
];
