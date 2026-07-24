import { Shuffle, X } from "lucide-react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  KIDS_AVATAR_BACKGROUND_COLORS,
  KIDS_AVATAR_EARRINGS,
  KIDS_AVATAR_EYEBROWS,
  KIDS_AVATAR_EYES,
  KIDS_AVATAR_FEATURES,
  KIDS_AVATAR_GLASSES,
  KIDS_AVATAR_HAIR_COLORS,
  KIDS_AVATAR_HAIR_STYLES,
  KIDS_AVATAR_MOUTHS,
  KIDS_AVATAR_SKIN_COLORS,
  randomKidsAvatar,
  type KidsAvatarConfig,
} from "@adt/types/kids"
import { KidsAvatar } from "@/features/kids/components/KidsAvatar"
import {
  KidsAvatarTabIcon,
  type KidsAvatarTabIconName,
} from "@/features/kids/components/kids-avatar-tab-icons"
import { useKidsTranslation } from "@/features/kids/hooks/useKidsTranslation"
import { cn } from "@/shared/lib/utils"

type Field = keyof KidsAvatarConfig

interface Section {
  field: Field
  kind: "color" | "part"
  options: readonly string[]
  /** Optional parts offer a "None" choice (empty id). */
  allowNone?: boolean
  subKey: string
  subFallback: string
}

interface Category {
  id: string
  labelKey: string
  labelFallback: string
  icon: KidsAvatarTabIconName
  sections: Section[]
}

const CATEGORIES: Category[] = [
  {
    id: "skin",
    labelKey: "kids-avatar-cat-skin",
    labelFallback: "Skin",
    icon: "face",
    sections: [
      {
        field: "skinColor",
        kind: "color",
        options: KIDS_AVATAR_SKIN_COLORS,
        subKey: "kids-avatar-sub-skin",
        subFallback: "Skin tone",
      },
    ],
  },
  {
    id: "hair",
    labelKey: "kids-avatar-cat-hair",
    labelFallback: "Hair",
    icon: "comb",
    sections: [
      {
        field: "hairColor",
        kind: "color",
        options: KIDS_AVATAR_HAIR_COLORS,
        subKey: "kids-avatar-sub-hair-color",
        subFallback: "Color",
      },
      {
        field: "hair",
        kind: "part",
        options: KIDS_AVATAR_HAIR_STYLES,
        allowNone: true,
        subKey: "kids-avatar-sub-hair-style",
        subFallback: "Style",
      },
    ],
  },
  {
    id: "eyes",
    labelKey: "kids-avatar-cat-eyes",
    labelFallback: "Eyes",
    icon: "eye",
    sections: [
      {
        field: "eyes",
        kind: "part",
        options: KIDS_AVATAR_EYES,
        subKey: "kids-avatar-sub-eyes",
        subFallback: "Eyes",
      },
    ],
  },
  {
    id: "eyebrows",
    labelKey: "kids-avatar-cat-eyebrows",
    labelFallback: "Eyebrows",
    icon: "eyebrow",
    sections: [
      {
        field: "eyebrows",
        kind: "part",
        options: KIDS_AVATAR_EYEBROWS,
        subKey: "kids-avatar-sub-eyebrows",
        subFallback: "Eyebrows",
      },
    ],
  },
  {
    id: "mouth",
    labelKey: "kids-avatar-cat-mouth",
    labelFallback: "Mouth",
    icon: "smiley",
    sections: [
      {
        field: "mouth",
        kind: "part",
        options: KIDS_AVATAR_MOUTHS,
        subKey: "kids-avatar-sub-mouth",
        subFallback: "Expression",
      },
    ],
  },
  {
    id: "accessories",
    labelKey: "kids-avatar-cat-accessories",
    labelFallback: "Accessories",
    icon: "glasses",
    sections: [
      {
        field: "glasses",
        kind: "part",
        options: KIDS_AVATAR_GLASSES,
        allowNone: true,
        subKey: "kids-avatar-sub-glasses",
        subFallback: "Glasses",
      },
      {
        field: "earrings",
        kind: "part",
        options: KIDS_AVATAR_EARRINGS,
        allowNone: true,
        subKey: "kids-avatar-sub-earrings",
        subFallback: "Earrings",
      },
      {
        field: "features",
        kind: "part",
        options: KIDS_AVATAR_FEATURES,
        allowNone: true,
        subKey: "kids-avatar-sub-features",
        subFallback: "Extras",
      },
    ],
  },
  {
    id: "background",
    labelKey: "kids-avatar-cat-background",
    labelFallback: "Background",
    icon: "frame",
    sections: [
      {
        field: "backgroundColor",
        kind: "color",
        options: KIDS_AVATAR_BACKGROUND_COLORS,
        subKey: "kids-avatar-sub-background",
        subFallback: "Background color",
      },
    ],
  },
]

interface KidsAvatarBuilderProps {
  value: KidsAvatarConfig
  onChange: (next: KidsAvatarConfig) => void
  /** Tighter layout for space-constrained hosts (e.g. the onboarding step). */
  dense?: boolean
}

export function KidsAvatarBuilder({
  value,
  onChange,
  dense = false,
}: KidsAvatarBuilderProps) {
  const { tk } = useKidsTranslation()
  const [activeId, setActiveId] = useState(CATEGORIES[0].id)
  const active = CATEGORIES.find((c) => c.id === activeId) ?? CATEGORIES[0]

  const set = (field: Field, id: string) => onChange({ ...value, [field]: id })

  // Sliding pill indicator: track the active tab's box and animate to it.
  const tablistRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [indicator, setIndicator] = useState<{
    left: number
    width: number
  } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const el = tabRefs.current[activeId]
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
    }
    measure()
    const node = tablistRef.current
    if (!node || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    return () => ro.disconnect()
  }, [activeId])

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-5">
      {/* Left column: big portrait preview + shuffle. */}
      <div className="flex shrink-0 flex-col items-center sm:w-[44%]">
        <div className="relative aspect-square w-full max-w-[18rem] overflow-hidden rounded-[2rem] shadow-[0_6px_0_#C4DFF2] ring-4 ring-white sm:aspect-auto sm:h-full sm:max-w-none">
          <KidsAvatar config={value} fill className="rounded-none" />
          <button
            type="button"
            data-testid="kids-avatar-shuffle"
            onClick={() => onChange(randomKidsAvatar())}
            aria-label={tk("kids-avatar-shuffle", "Surprise me")}
            title={tk("kids-avatar-shuffle", "Surprise me")}
            className={cn(
              "absolute bottom-3 right-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-3.5 text-sm font-extrabold text-sky-800 shadow-[0_3px_0_#B7D6EC] ring-2 ring-sky-100",
              "transition-all duration-150 hover:bg-sky-50 active:translate-y-[2px] active:shadow-[0_1px_0_#B7D6EC]",
              "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
            )}
          >
            <Shuffle className="h-5 w-5" aria-hidden="true" />
            <span className="hidden sm:inline">
              {tk("kids-avatar-shuffle", "Surprise me")}
            </span>
          </button>
        </div>
      </div>

      {/* Right column: underlined category tabs + scrolling option sections. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div
          ref={tablistRef}
          role="tablist"
          aria-label={tk("kids-avatar-parts-label", "Avatar parts")}
          className="relative flex w-full min-w-0 items-center gap-1 rounded-2xl bg-slate-100 p-1"
        >
          {indicator ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-1 top-1 left-0 rounded-xl bg-sky-500 shadow-[0_2px_0_#0369A1] transition-[transform,width] duration-300 ease-out"
              style={{
                width: `${indicator.width}px`,
                transform: `translateX(${indicator.left}px)`,
              }}
            />
          ) : null}
          {CATEGORIES.map((category) => {
            const selected = category.id === activeId
            const label = tk(category.labelKey, category.labelFallback)
            return (
              <button
                key={category.id}
                ref={(el) => {
                  tabRefs.current[category.id] = el
                }}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={label}
                title={label}
                onClick={() => setActiveId(category.id)}
                className={cn(
                  "relative z-10 flex h-10 flex-1 items-center justify-center rounded-xl",
                  "transition-colors duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
                  selected ? "text-white" : "text-slate-500 hover:text-slate-700",
                )}
              >
                <KidsAvatarTabIcon name={category.icon} size={22} />
                <span className="sr-only">{label}</span>
              </button>
            )
          })}
        </div>

        <div
          className={cn(
            "flex w-full min-w-0 flex-col gap-4 overflow-y-auto p-1",
            dense ? "h-[min(42vh,17rem)]" : "h-[min(52vh,24rem)]",
          )}
        >
          {active.sections.map((section) => (
            <SectionGrid
              key={section.field}
              section={section}
              value={value}
              onPick={set}
              label={tk(section.subKey, section.subFallback)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SectionGrid({
  section,
  value,
  onPick,
  label,
}: {
  section: Section
  value: KidsAvatarConfig
  onPick: (field: Field, id: string) => void
  label: string
}) {
  const tiles = useMemo(() => {
    const items: { id: string; config: KidsAvatarConfig }[] = []
    if (section.kind === "part" && section.allowNone) {
      items.push({ id: "", config: { ...value, [section.field]: "" } })
    }
    for (const option of section.options) {
      items.push({ id: option, config: { ...value, [section.field]: option } })
    }
    return items
  }, [section, value])

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <span className="text-lg font-extrabold text-slate-800">{label}</span>
      {section.kind === "color" ? (
        <div
          className="grid w-full min-w-0 grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-2.5"
          role="group"
          aria-label={label}
        >
          {section.options.map((color) => {
            const selected = value[section.field] === color
            return (
              <button
                key={color}
                type="button"
                aria-pressed={selected}
                aria-label={`#${color}`}
                onClick={() => onPick(section.field, color)}
                className={cn(
                  "rounded-2xl bg-white p-1.5 ring-2 transition-all duration-150 active:scale-95",
                  "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
                  selected ? "ring-sky-500" : "ring-slate-200 hover:ring-slate-300",
                )}
              >
                <span
                  className="block aspect-square w-full rounded-xl"
                  style={{ background: `#${color}` }}
                />
              </button>
            )
          })}
        </div>
      ) : (
        <div
          className="grid w-full min-w-0 grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3"
          role="group"
          aria-label={label}
        >
          {tiles.map((tile) => {
            const selected = value[section.field] === tile.id
            return (
              <button
                key={tile.id || "none"}
                type="button"
                aria-pressed={selected}
                onClick={() => onPick(section.field, tile.id)}
                className={cn(
                  "flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-white p-2 ring-2 transition-all duration-150 active:scale-95",
                  "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
                  selected
                    ? "bg-sky-50 ring-sky-500"
                    : "ring-slate-200 hover:ring-slate-300",
                )}
              >
                {tile.id === "" ? (
                  <span className="grid h-full w-full place-items-center text-slate-400">
                    <X className="h-7 w-7" aria-hidden="true" />
                  </span>
                ) : (
                  <KidsAvatar config={tile.config} fill className="rounded-xl" />
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
