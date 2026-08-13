import {
  Sparkles,
  Layers,
  BookOpen,
  AlignLeft,
  SlidersHorizontal,
  Image,
} from "lucide-react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ElementType } from "react";
import { TwoColumnStoryStrategyIcon } from "@/components/wizard/icons/TwoColumnStoryStrategyIcon";
import { TextbookWireframePreview } from "@/components/wizard/icons/TextbookWireframePreview";
import { StorybookWireframePreview } from "@/components/wizard/icons/StorybookWireframePreview";
import { ReferenceWireframePreview } from "@/components/wizard/icons/ReferenceWireframePreview";
import type { WizardFormValues } from "./wizardForm";

// ─── Option shape ────────────────────────────────────────────────────────────

export interface WizardOption<TId extends string = string> {
  id: TId;
  Icon?: ElementType;
  title: MessageDescriptor;
  description?: MessageDescriptor;
}

// ─── Render Strategy categories ──────────────────────────────────────────────

export type StrategyCategory = "template" | "ai";

export interface StrategyCategoryMeta {
  label: MessageDescriptor;
  description: MessageDescriptor;
}

export const STRATEGY_CATEGORIES: Record<
  StrategyCategory,
  StrategyCategoryMeta
> = {
  template: {
    label: msg`Template-based`,
    description: msg`Fast, consistent results with no AI cost`,
  },
  ai: {
    label: msg`AI-powered`,
    description: msg`Adaptive layouts generated per page (slower, uses API credits)`,
  },
};

export interface RenderStrategyOption extends WizardOption {
  category: StrategyCategory;
  hidden?: boolean;
}

// ─── Render Strategies (Step 2) ──────────────────────────────────────────────

export const RENDER_STRATEGIES = [
  {
    id: "llm",
    Icon: Sparkles,
    title: msg`Dynamic`,
    description: msg`Automatically adapts the layout based on each page's content using AI.`,
    category: "ai",
  },
  {
    id: "llm-overlay",
    Icon: Layers,
    title: msg`Dynamic Overlay`,
    description: msg`AI-powered layout that preserves the original page as a background with text overlay.`,
    category: "ai",
  },
  {
    id: "single_column",
    Icon: AlignLeft,
    title: msg`Single Column`,
    description: msg`Full-width single column layout. Ideal for reference material, documentation, and dense technical content.`,
    category: "template",
  },
  {
    id: "two_column",
    Icon: BookOpen,
    title: msg`Two Columns`,
    description: msg`The ideal choice for novels, focused on a clean and continuous reading experience.`,
    category: "template",
    hidden: true,
  },
  {
    id: "two_column_story",
    Icon: TwoColumnStoryStrategyIcon,
    title: msg`Two Columns Story`,
    description: msg`Perfect for children's books, pairing large images with minimal text.`,
    category: "template",
  },
  {
    id: "fixed_layout",
    Icon: Image,
    title: msg`Fixed Layout`,
    description: msg`Page image as background with positioned text overlay. Preserves the original page composition; ideal for illustrated storybooks.`,
    category: "template",
  },
] as const satisfies readonly RenderStrategyOption[];

export type RenderStrategyId = (typeof RENDER_STRATEGIES)[number]["id"];

// ─── Preset defaults — typed against the wizard form ────────────────────────

export type SectioningModeId = "page" | "dynamic";

export type WizardPageGrouping = "" | "spread" | "single";

export type WizardSectioningMode = "" | SectioningModeId;

export type PresetRecommendations = Partial<WizardFormValues>;

// ─── Preset types ────────────────────────────────────────────────────────────

export type PresetId = "textbook" | "storybook" | "reference" | "custom";

export interface ExampleBook {
  title: MessageDescriptor;
  pdfUrl?: string;
  adtUrl?: string;
  comingSoon?: boolean;
}

export interface PresetConfig {
  id: PresetId;
  imageSrc: string | null;
  Icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  title: MessageDescriptor;
  description: MessageDescriptor;
  renderStrategies?: readonly RenderStrategyId[];
  recommendedStrategies?: readonly RenderStrategyId[];
  recommendedFor: MessageDescriptor[];
  exampleBooks: ExampleBook[];
  recommendations: PresetRecommendations;
  formDefaults?: Partial<WizardFormValues>;
  baseConfig?: Record<string, unknown>;
}

// ─── Demo URLs (shared across all presets until per-preset assets are ready) ─

const DEMO_PDF_URL =
  "https://ontheline.trincoll.edu/images/bookdown/sample-local-pdf.pdf";
const DEMO_ADT_URL =
  "https://elasticsounds.github.io/adt-brazil-demo/index.html";

// ─── Presets ─────────────────────────────────────────────────────────────────

export const PRESETS: PresetConfig[] = [
  {
    id: "textbook",
    imageSrc: null,
    Icon: TextbookWireframePreview,
    iconColor: "text-blue-500",
    bgColor: "bg-blue-500/5",
    title: msg`Textbooks & Activities`,
    description: msg`Structured chapters, exercises. Best for educational content with complex layouts.`,
    renderStrategies: ["llm", "llm-overlay", "two_column", "two_column_story"],
    recommendedStrategies: ["llm"],
    recommendedFor: [
      msg`School textbooks and workbooks`,
      msg`University academic publications`,
      msg`Scientific papers and journals`,
      msg`Technical manuals with diagrams`,
    ],
    exampleBooks: [
      {
        title: msg`Práticas de Alfabetização e de Matemática`,
        pdfUrl: DEMO_PDF_URL,
        adtUrl: DEMO_ADT_URL,
      },
      {
        title: msg`Ciências da Natureza - Ensino Fundamental`,
        comingSoon: true,
      },
      { title: msg`História e Sociedade - Vol. 1`, comingSoon: true },
      { title: msg`Língua Portuguesa - 3° Ano`, comingSoon: true },
    ],
    recommendations: {
      renderStrategy: "llm",
      pageGrouping: "single",
      sectioningMode: "dynamic",
      activitiesGenerator: true,
      imageCropping: false,
      imageSegmentation: true,
      figureExtraction: "auto",
    },
    formDefaults: {
      imageFilterMinSide: 50,
      imageFilterMaxSide: 3500,
    },
    baseConfig: {
      render_strategies: {
        llm: {
          render_type: "llm",
          config: {
            prompt: "web_generation_html",
            max_retries: 5,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        "llm-overlay": {
          render_type: "llm",
          config: {
            prompt: "web_generation_html_overlay",
            max_retries: 25,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        two_column: {
          render_type: "template",
          config: { template: "two_column_render" },
        },
        activity_multiple_choice: {
          render_type: "activity",
          config: {
            prompt: "activity_multiple_choice",
            answer_prompt: "activity_multiple_choice_answers",
            max_retries: 5,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        activity_multi_select: {
          render_type: "activity",
          config: {
            prompt: "activity_multi_select",
            answer_prompt: "activity_multi_select_answers",
            max_retries: 5,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        activity_underline_text: {
          render_type: "activity",
          config: {
            prompt: "activity_underline_text",
            answer_prompt: "activity_underline_text_answers",
            model: "openai:gpt-5.4",
            max_retries: 5,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        activity_true_false: {
          render_type: "activity",
          config: {
            prompt: "activity_true_false",
            answer_prompt: "activity_true_false_answers",
            max_retries: 5,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        activity_fill_in_the_blank: {
          render_type: "activity",
          config: {
            prompt: "activity_fill_in_the_blank",
            answer_prompt: "activity_fill_in_the_blank_answers",
            max_retries: 5,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        activity_fill_in_a_table: {
          render_type: "activity",
          config: {
            prompt: "activity_fill_in_a_table",
            answer_prompt: "activity_fill_in_a_table_answers",
            max_retries: 5,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        activity_matching: {
          render_type: "activity",
          config: {
            prompt: "activity_matching",
            answer_prompt: "activity_matching_answers",
            max_retries: 5,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        activity_sorting: {
          render_type: "activity",
          config: {
            prompt: "activity_sorting",
            answer_prompt: "activity_sorting_answers",
            max_retries: 5,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        activity_ordering: {
          render_type: "activity",
          config: {
            prompt: "activity_ordering",
            max_retries: 5,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        activity_open_ended_answer: {
          render_type: "activity",
          config: {
            prompt: "activity_open_ended_answer",
            max_retries: 5,
            timeout: 180,
            temperature: 0.3,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
      },
      section_render_strategies: {
        activity_multiple_choice: "activity_multiple_choice",
        activity_multi_select: "activity_multi_select",
        activity_underline_text: "activity_underline_text",
        activity_true_false: "activity_true_false",
        activity_fill_in_the_blank: "activity_fill_in_the_blank",
        activity_fill_in_a_table: "activity_fill_in_a_table",
        activity_matching: "activity_matching",
        activity_sorting: "activity_sorting",
        activity_ordering: "activity_ordering",
        activity_open_ended_answer: "activity_open_ended_answer",
      },
      // Role keys must match the actual `role_types` the sectioning LLM assigns
      // (config.yaml uses bare `header`/`footer`/`page_number`). The `_text`
      // suffixed variants never match, so header/footer would leak in unpruned.
      pruned_role_types: ["header", "footer", "page_number", "watermark"],
      // Textbooks keep the cover pages (inside/inner cover, back cover) and the
      // credits page on by default — they carry publisher/ISBN and
      // contributor/funding info worth retaining.
      pruned_section_types: [],
      image_filters: { min_stddev: 2 },
    },
  },
  {
    id: "storybook",
    imageSrc: null,
    Icon: StorybookWireframePreview,
    iconColor: "text-amber-500",
    bgColor: "bg-amber-500/5",
    title: msg`Storybook`,
    description: msg`Large images, narrative flow. Best for illustrated books with high-fidelity TTS voices.`,
    renderStrategies: ["llm", "llm-overlay", "two_column", "two_column_story", "fixed_layout"],
    recommendedStrategies: ["llm-overlay", "two_column_story"],
    recommendedFor: [
      msg`Illustrated children's books`,
      msg`Young adult fiction`,
      msg`Chapter books with images`,
      msg`Picture books and early readers`,
    ],
    exampleBooks: [
      {
        title: msg`Sample Illustrated Story`,
        pdfUrl: DEMO_PDF_URL,
        adtUrl: DEMO_ADT_URL,
      },
      { title: msg`Adventure Tales - Vol. 1`, comingSoon: true },
      { title: msg`The Lost Forest`, comingSoon: true },
    ],
    recommendations: {
      renderStrategy: "two_column_story",
      pageGrouping: "spread",
      sectioningMode: "page",
      imageCropping: false,
      imageSegmentation: false,
    },
    formDefaults: {
      imageFilterMinSide: 150,
      imageFilterMaxSide: 3500,
    },
    baseConfig: {
      render_strategies: {
        two_column_story: {
          render_type: "template",
          config: { template: "two_column_story" },
        },
        two_column: {
          render_type: "template",
          config: { template: "two_column_render" },
        },
        llm: {
          render_type: "llm",
          config: {
            prompt: "web_generation_html",
            max_retries: 5,
            timeout: 180,
          },
        },
        "llm-overlay": {
          render_type: "llm",
          config: {
            prompt: "web_generation_html_overlay",
            max_retries: 25,
            timeout: 180,
          },
        },
        fixed_layout: {
          render_type: "fixed_layout",
        },
      },
      section_render_strategies: {},
      // Role keys must match the actual `role_types` the sectioning LLM assigns
      // (config.yaml uses bare `header`/`footer`/`page_number`). The `_text`
      // suffixed variants never match, so header/footer would leak into the
      // two-column-story layout unpruned.
      pruned_role_types: ["header", "footer", "page_number", "watermark"],
      pruned_section_types: [
        "back_cover",
        "credits",
        "inside_cover",
        "activity_multiple_choice",
        "activity_multi_select",
        "activity_underline_text",
        "activity_true_false",
        "activity_fill_in_the_blank",
        "activity_fill_in_a_table",
        "activity_matching",
        "activity_sorting",
        "activity_ordering",
        "activity_open_ended_answer",
      ],
      image_filters: { min_stddev: 2 },
      quiz_generation: { pages_per_quiz: 3 },
    },
  },
  {
    id: "reference",
    imageSrc: null,
    Icon: ReferenceWireframePreview,
    iconColor: "text-emerald-500",
    bgColor: "bg-emerald-500/5",
    title: msg`Reference`,
    description: msg`Dense text, tables, glossaries. Best for technical material and documentation.`,
    renderStrategies: ["llm", "llm-overlay", "single_column", "two_column"],
    recommendedStrategies: ["single_column"],
    recommendedFor: [
      msg`Technical documentation`,
      msg`Legal and compliance manuals`,
      msg`Medical references`,
      msg`Engineering handbooks`,
    ],
    exampleBooks: [
      {
        title: msg`Sample Reference Manual`,
        pdfUrl: DEMO_PDF_URL,
        adtUrl: DEMO_ADT_URL,
      },
      { title: msg`Engineering Handbook Vol. 2`, comingSoon: true },
      { title: msg`Legal Compliance Guide`, comingSoon: true },
    ],
    recommendations: {
      renderStrategy: "single_column",
      pageGrouping: "single",
      sectioningMode: "page",
      imageCropping: false,
      imageSegmentation: false,
      figureExtraction: "auto",
    },
    formDefaults: {
      imageFilterMinSide: 100,
      imageFilterMaxSide: 5000,
    },
    baseConfig: {
      render_strategies: {
        single_column: {
          render_type: "template",
          config: { template: "one_column_render" },
        },
        two_column: {
          render_type: "template",
          config: { template: "two_column_render" },
        },
        llm: {
          render_type: "llm",
          config: {
            prompt: "web_generation_html",
            max_retries: 5,
            timeout: 180,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
        "llm-overlay": {
          render_type: "llm",
          config: {
            prompt: "web_generation_html_overlay",
            max_retries: 25,
            timeout: 180,
            visual_refinement: { enabled: true, max_iterations: 3 },
          },
        },
      },
      section_render_strategies: {},
      // Role keys must match the actual `role_types` the sectioning LLM assigns
      // (config.yaml uses bare `header`/`footer`/`page_number`). The `_text`
      // suffixed variants never match, so header/footer would leak in unpruned.
      pruned_role_types: ["header", "footer", "page_number", "watermark"],
      pruned_section_types: [
        "back_cover",
        "credits",
        "inside_cover",
        "activity_multiple_choice",
        "activity_multi_select",
        "activity_underline_text",
        "activity_true_false",
        "activity_fill_in_the_blank",
        "activity_fill_in_a_table",
        "activity_matching",
        "activity_sorting",
        "activity_ordering",
        "activity_open_ended_answer",
      ],
      image_filters: { min_stddev: 2 },
    },
  },
  {
    id: "custom",
    imageSrc: null,
    Icon: SlidersHorizontal,
    iconColor: "text-violet-500",
    bgColor: "bg-violet-500/5",
    title: msg`Custom`,
    description: msg`Full control over render strategies, pruning, and filters.`,
    recommendedFor: [
      msg`Any content type`,
      msg`Specialized workflows`,
      msg`Experimental configurations`,
      msg`Multi-format publications`,
    ],
    exampleBooks: [
      {
        title: msg`Custom Layout Demo`,
        pdfUrl: DEMO_PDF_URL,
        adtUrl: DEMO_ADT_URL,
      },
      { title: msg`Mixed Content Project`, comingSoon: true },
    ],
    recommendations: {},
  },
];

// ─── Preset accent colors ────────────────────────────────────────────────────

export interface PresetAccent {
  bg: string
  hover: string
  text: string
}

const PRESET_ACCENT_MAP: Record<string, PresetAccent> = {
  textbook:  { bg: "#3b82f6", hover: "#2563eb", text: "#3b82f6" },
  storybook: { bg: "#f59e0b", hover: "#d97706", text: "#f59e0b" },
  reference: { bg: "#10b981", hover: "#059669", text: "#10b981" },
  custom:    { bg: "#8b5cf6", hover: "#7c3aed", text: "#8b5cf6" },
}

const DEFAULT_PRESET_ACCENT: PresetAccent = { bg: "#2b7fff", hover: "#1a6fef", text: "#2b7fff" }

export function getPresetAccent(presetId: string | null | undefined): PresetAccent {
  return (presetId ? PRESET_ACCENT_MAP[presetId] : undefined) ?? DEFAULT_PRESET_ACCENT
}

export const PRESET_RECOMMENDATIONS: Record<PresetId, PresetRecommendations> =
  Object.fromEntries(PRESETS.map((p) => [p.id, p.recommendations])) as Record<
    PresetId,
    PresetRecommendations
  >;

const FIELD_LABELS: Partial<Record<keyof WizardFormValues, MessageDescriptor>> =
  {
    renderStrategy: msg`Render Strategy`,
    pageGrouping: msg`Page Grouping`,
    sectioningMode: msg`Sectioning`,
    imageCropping: msg`Smart Cropping`,
    imageSegmentation: msg`Image Segmentation`,
    figureExtraction: msg`Figure Extraction`,
  };

const VALUE_LABELS: Record<string, MessageDescriptor> = {
  single_column: msg`Single Column`,
  two_column: msg`Two Columns`,
  two_column_story: msg`Two Columns Story`,
  llm: msg`Dynamic`,
  "llm-overlay": msg`Dynamic Overlay`,
  single: msg`Single Page`,
  spread: msg`Spread`,
  page: msg`Per Page`,
  dynamic: msg`Dynamic`,
  auto: msg`Auto`,
  all: msg`All`,
  off: msg`Off`,
};

function formatDefaultValue(
  key: keyof WizardFormValues,
  value: unknown,
): MessageDescriptor | string {
  if (typeof value === "boolean") return value ? msg`On` : msg`Off`;
  if (typeof value === "number") return `${value}px`;
  const str = String(value);
  return VALUE_LABELS[str] ?? str;
}

export function getPresetRecommendationEntries(
  recommendations: PresetRecommendations,
): { label: MessageDescriptor; value: MessageDescriptor | string }[] {
  return Object.entries(recommendations)
    .filter(([key]) => key in FIELD_LABELS)
    .map(([key, value]) => ({
      label: FIELD_LABELS[key as keyof WizardFormValues]!,
      value: formatDefaultValue(key as keyof WizardFormValues, value),
    }));
}
