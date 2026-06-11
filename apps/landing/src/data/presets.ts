import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  BookOpen,
  FileText,
  Library,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export type Preset = {
  id: "textbook" | "storybook" | "reference" | "custom";
  title: MessageDescriptor;
  description: MessageDescriptor;
  Icon: LucideIcon;
  iconColor: string;
  bgColor: string;
  accentBg: string;
};

export const PRESETS: Preset[] = [
  {
    id: "textbook",
    title: msg`Textbooks & Activities`,
    description: msg`Structured chapters and exercises. Best for educational content with complex layouts.`,
    Icon: FileText,
    iconColor: "text-blue-500",
    bgColor: "bg-blue-500/5",
    accentBg: "#3b82f6",
  },
  {
    id: "storybook",
    title: msg`Storybook`,
    description: msg`Large images with narrative flow. Ideal for illustrated books with rich TTS voices.`,
    Icon: BookOpen,
    iconColor: "text-amber-500",
    bgColor: "bg-amber-500/5",
    accentBg: "#f59e0b",
  },
  {
    id: "reference",
    title: msg`Reference`,
    description: msg`Dense text, tables, glossaries. Best for technical material and documentation.`,
    Icon: Library,
    iconColor: "text-emerald-500",
    bgColor: "bg-emerald-500/5",
    accentBg: "#10b981",
  },
  {
    id: "custom",
    title: msg`Custom`,
    description: msg`Full control over render strategies, pruning, and filters.`,
    Icon: SlidersHorizontal,
    iconColor: "text-violet-500",
    bgColor: "bg-violet-500/5",
    accentBg: "#8b5cf6",
  },
];
