import {
  House,
  Rocket,
  Workflow,
  Lightbulb,
  FileDown,
  LifeBuoy,
  Bug,
  BookOpen,
  AppWindow,
  FileSearch,
  Download,
  KeyRound,
  FileUp,
  FileText,
  Network,
  LayoutGrid,
  ShieldCheck,
  Image,
  Hand,
  AudioLines,
  Languages,
  CircleHelp,
  List,
  FolderArchive,
  Globe,
  GraduationCap,
  BookMarked,
  Tablet,
  PencilRuler,
  Package,
  type LucideIcon,
} from "lucide-react";

/**
 * Icon + color per docs page, keyed by the URL slug path (empty string for
 * the root Overview). Used by `PageHeader` (in-page icon) and the docs
 * landing-page card grids, so a page always looks the same wherever it's
 * referenced.
 *
 * Colors for pages that map 1:1 to a real pipeline stage are copied
 * verbatim from `apps/studio/src/components/pipeline/stage-config.ts` (the
 * app's own stage identity) — those are marked below. Everything else is an
 * independent color chosen to keep each page grid visually distinct.
 */
export const DOCS_COLORS: Record<string, { icon: LucideIcon; hex: string }> = {
  // Top level
  "": { icon: House, hex: "#2563eb" },
  "get-started": { icon: Rocket, hex: "#7c3aed" },
  "convert-pdf": { icon: Workflow, hex: "#d97706" },
  enhance: { icon: Lightbulb, hex: "#0d9488" },
  localize: { icon: Globe, hex: "#db2777" },
  export: { icon: FileDown, hex: "#4338ca" }, // app stage "export"
  faq: { icon: LifeBuoy, hex: "#16a34a" },
  "reporting-issues": { icon: Bug, hex: "#dc2626" },

  // Get Started
  "get-started/what-is-an-adt": { icon: BookOpen, hex: "#7c3aed" },
  "get-started/what-is-adt-studio": { icon: AppWindow, hex: "#9333ea" },
  "get-started/what-type-of-content": { icon: FileSearch, hex: "#ca8a04" },
  "get-started/install": { icon: Download, hex: "#2563eb" },
  "get-started/api-keys": { icon: KeyRound, hex: "#db2777" },

  // Convert a PDF into an ADT
  "convert-pdf/import-pdf": { icon: FileUp, hex: "#d97706" },
  "convert-pdf/extract": { icon: FileText, hex: "#2563eb" }, // app stage "extract"
  "convert-pdf/sectioning": { icon: Network, hex: "#0284c7" }, // app stage "sectioning"
  "convert-pdf/storyboard": { icon: LayoutGrid, hex: "#7c3aed" }, // app stage "storyboard"
  "convert-pdf/validate-preview": { icon: ShieldCheck, hex: "#059669" }, // app stage "validation"

  // Enhance your ADT
  "enhance/captions": { icon: Image, hex: "#0d9488" }, // app stage "captions"
  "enhance/easy-read": { icon: FileText, hex: "#c026d3" }, // app stage "easy-read"
  "enhance/sign-language": { icon: Hand, hex: "#0891b2" }, // app stage "sign-language"
  "enhance/quizzes": { icon: CircleHelp, hex: "#ea580c" }, // app stage "quizzes"
  "enhance/glossary": { icon: BookOpen, hex: "#65a30d" }, // app stage "glossary"
  "enhance/table-of-contents": { icon: List, hex: "#d97706" }, // app stage "toc"

  // Localize your ADT
  "localize/language": { icon: Languages, hex: "#db2777" }, // app stage "translate"
  "localize/speech": { icon: AudioLines, hex: "#e11d48" }, // app stage "speech"

  // Export your ADT
  "export/formats": { icon: Package, hex: "#6366f1" },
  "export/personalize": { icon: PencilRuler, hex: "#f59e0b" },

  // Export formats (not separate pages — used only by the Cards on export/formats.mdx)
  "export/project-archive": { icon: FolderArchive, hex: "#4338ca" },
  "export/web": { icon: Globe, hex: "#2563eb" },
  "export/scorm": { icon: GraduationCap, hex: "#7c3aed" },
  "export/webpub": { icon: BookMarked, hex: "#0284c7" },
  "export/epub": { icon: Tablet, hex: "#e11d48" },
};
