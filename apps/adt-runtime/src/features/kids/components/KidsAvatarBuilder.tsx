import { Shuffle, X } from "lucide-react"
import { useMemo, useState } from "react"
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
        field: "hair",
        kind: "part",
        options: KIDS_AVATAR_HAIR_STYLES,
        allowNone: true,
        subKey: "kids-avatar-sub-hair-style",
        subFallback: "Style",
      },
      {
        field: "hairColor",
        kind: "color",
        options: KIDS_AVATAR_HAIR_COLORS,
        subKey: "kids-avatar-sub-hair-color",
        subFallback: "Color",
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
}

export function KidsAvatarBuilder({ value, onChange }: KidsAvatarBuilderProps) {
  const { tk } = useKidsTranslation()
  const [activeId, setActiveId] = useState(CATEGORIES[0].id)
  const active = CATEGORIES.find((c) => c.id === activeId) ?? CATEGORIES[0]

  const set = (field: Field, id: string) => onChange({ ...value, [field]: id })

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-3">
        <KidsAvatar
          config={value}
          size={128}
          className="shadow-[0_4px_0_#C4DFF2] ring-4 ring-white"
        />
        <button
          type="button"
          data-testid="kids-avatar-shuffle"
          onClick={() => onChange(randomKidsAvatar())}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-base font-extrabold text-sky-800 shadow-[0_3px_0_#B7D6EC] ring-2 ring-sky-100",
            "transition-all duration-150 hover:bg-sky-50 active:translate-y-[2px] active:shadow-[0_1px_0_#B7D6EC]",
            "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
          )}
        >
          <Shuffle className="h-5 w-5" aria-hidden="true" />
          {tk("kids-avatar-shuffle", "Surprise me")}
        </button>
      </div>

      <div
        role="tablist"
        aria-label={tk("kids-avatar-parts-label", "Avatar parts")}
        className="flex w-full min-w-0 items-center justify-center gap-1.5 px-1"
      >
        {CATEGORIES.map((category) => {
          const selected = category.id === activeId
          const label = tk(category.labelKey, category.labelFallback)
          return (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={label}
              title={label}
              onClick={() => setActiveId(category.id)}
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                "transition-all duration-150 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
                selected
                  ? "bg-sky-500 text-white shadow-[0_2px_0_#0369A1]"
                  : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-sky-50 hover:text-slate-700",
              )}
            >
              <KidsAvatarTabIcon name={category.icon} />
              <span className="sr-only">{label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex h-[min(40vh,20rem)] w-full min-w-0 flex-col gap-4 overflow-y-auto p-1.5">
        {active.sections.map((section) => (
          <SectionGrid
            key={section.field}
            section={section}
            value={value}
            onPick={set}
            label={tk(section.subKey, section.subFallback)}
            showLabel={active.sections.length > 1}
          />
        ))}
      </div>
    </div>
  )
}

function SectionGrid({
  section,
  value,
  onPick,
  label,
  showLabel,
}: {
  section: Section
  value: KidsAvatarConfig
  onPick: (field: Field, id: string) => void
  label: string
  showLabel: boolean
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
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      {showLabel ? (
        <span className="px-1 text-sm font-extrabold text-slate-500">
          {label}
        </span>
      ) : null}
      <div
        className="grid w-full min-w-0 grid-cols-4 gap-2 sm:grid-cols-6"
        role="group"
        aria-label={label}
      >
        {section.kind === "color"
          ? section.options.map((color) => {
              const selected = value[section.field] === color
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`#${color}`}
                  onClick={() => onPick(section.field, color)}
                  className={cn(
                    "aspect-square rounded-2xl ring-2 ring-slate-200 transition-all duration-150 active:scale-95",
                    "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
                    selected && "ring-4 ring-sky-500",
                  )}
                  style={{ background: `#${color}` }}
                />
              )
            })
          : tiles.map((tile) => {
              const selected = value[section.field] === tile.id
              return (
                <button
                  key={tile.id || "none"}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPick(section.field, tile.id)}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-2xl bg-white ring-2 ring-slate-200 transition-all duration-150 active:scale-95",
                    "focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500",
                    selected && "ring-4 ring-sky-500",
                  )}
                >
                  {tile.id === "" ? (
                    <span className="grid h-full w-full place-items-center text-slate-400">
                      <X className="h-6 w-6" aria-hidden="true" />
                    </span>
                  ) : (
                    <KidsAvatar
                      config={tile.config}
                      size={64}
                      className="!rounded-2xl"
                    />
                  )}
                </button>
              )
            })}
      </div>
    </div>
  )
}
