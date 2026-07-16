import type { CSSProperties, ReactNode } from "react";
import {
  AlignLeft,
  ArrowLeftRight,
  CheckCircle2,
  Eye,
  Globe,
  Hash,
  ListChecks,
  Play,
  Quote,
  Search,
  Sparkles,
  Tag,
  Video,
  Volume2,
  Bookmark,
  Accessibility,
  type LucideIcon,
} from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { DOCS_COLORS } from "@/data/docs-colors";

/**
 * Abstract, iconographic "spot illustration" for an Enhance doc page — a
 * center medallion (the page's own icon, from `DOCS_COLORS`) orbited by two
 * small satellite icons, joined by dashed connector lines. Deliberately
 * graphic rather than a mock-UI panel: it should never be mistaken for a
 * screenshot of the app, since several of these features are still marked
 * "verify against current UI" in their pages.
 */
export function FeatureVisual({ slug }: { slug: keyof typeof VARIANTS }) {
  const entry = DOCS_COLORS[slug];
  const color = entry?.hex ?? "#64748b";
  const CenterIcon = entry?.icon;
  const variant = VARIANTS[slug];
  if (!variant || !CenterIcon) return null;

  return (
    <div
      className="not-prose my-8 flex flex-col items-center gap-3"
      style={{ "--c": color } as CSSProperties}
    >
      <Medallion center={CenterIcon} satellites={variant.satellites} />
      <p className="max-w-xs text-center text-[13px] leading-relaxed text-fd-muted-foreground">
        <variant.caption />
      </p>
    </div>
  );
}

const SIZE = 200;
const CENTER = { x: SIZE / 2, y: SIZE / 2 };
const SATELLITES = [
  { x: 46, y: 58 },
  { x: 154, y: 58 },
];

function Medallion({
  center: CenterIcon,
  satellites,
}: {
  center: LucideIcon;
  satellites: [LucideIcon, LucideIcon];
}) {
  return (
    <div
      className="relative"
      style={{ width: SIZE, height: SIZE, maxWidth: "100%" }}
    >
      {SATELLITES.map((pos, i) => (
        <Connector key={i} from={CENTER} to={pos} />
      ))}

      <div
        className="absolute grid place-items-center rounded-full"
        style={{
          left: CENTER.x,
          top: CENTER.y,
          width: 88,
          height: 88,
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--c) 16%, transparent) 0%, color-mix(in oklab, var(--c) 8%, transparent) 100%)",
        }}
      >
        <CenterIcon className="size-9" style={{ color: "var(--c)" }} aria-hidden />
      </div>

      {satellites.map((Icon, i) => {
        const pos = SATELLITES[i];
        return (
          <div
            key={i}
            className="absolute grid place-items-center rounded-full bg-[var(--fd-content-surface)]"
            style={{
              left: pos.x,
              top: pos.y,
              width: 40,
              height: 40,
              transform: "translate(-50%, -50%)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              border: "1.5px solid color-mix(in oklab, var(--c) 30%, transparent)",
            }}
          >
            <Icon className="size-[18px]" style={{ color: "var(--c)" }} aria-hidden />
          </div>
        );
      })}
    </div>
  );
}

function Connector({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <div
      className="absolute"
      style={{
        left: from.x,
        top: from.y,
        width: length,
        height: 0,
        borderTop: "1.5px dashed color-mix(in oklab, var(--c) 40%, transparent)",
        transform: `rotate(${angle}deg)`,
        transformOrigin: "0 0",
      }}
    />
  );
}

/* ---------------------------------------------------------------------- */

const VARIANTS = {
  "enhance/captions": {
    satellites: [Eye, Quote],
    caption: () => <Trans>Every meaningful image gets a description.</Trans>,
  },
  "enhance/easy-read": {
    satellites: [AlignLeft, Sparkles],
    caption: () => <Trans>The same content, in plainer language.</Trans>,
  },
  "enhance/glossary": {
    satellites: [Tag, Search],
    caption: () => <Trans>Key terms, defined for the reader.</Trans>,
  },
  "localize/language": {
    satellites: [Globe, ArrowLeftRight],
    caption: () => <Trans>One book, many languages.</Trans>,
  },
  "enhance/quizzes": {
    satellites: [ListChecks, CheckCircle2],
    caption: () => <Trans>Check understanding as you read.</Trans>,
  },
  "enhance/sign-language": {
    satellites: [Video, Accessibility],
    caption: () => <Trans>Text and sign language, side by side.</Trans>,
  },
  "localize/speech": {
    satellites: [Volume2, Play],
    caption: () => <Trans>Listen to the book, page by page.</Trans>,
  },
  "enhance/table-of-contents": {
    satellites: [Hash, Bookmark],
    caption: () => <Trans>A map through every chapter.</Trans>,
  },
} satisfies Record<string, { satellites: [LucideIcon, LucideIcon]; caption: () => ReactNode }>;
