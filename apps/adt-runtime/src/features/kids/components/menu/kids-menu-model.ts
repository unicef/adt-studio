/**
 * Shared data model for every buddy-menu variant.
 *
 * The menu is being explored as several radically different interaction
 * models (board, conversation, dial, shelf). They all need exactly the same
 * actions, labels and state, so the wiring lives here once and each variant
 * is a pure presentation of `KidsMenuModel`. A variant should never reach for
 * a jotai atom directly.
 */
import type { KidsAvatarConfig } from "@adt/types/kids"
import type { BuddyImageSet } from "@/features/kids/assets/buddy-images"
import type { KidsSpeed } from "@/features/kids/components/KidsSpeedControl"

export type KidsMenuGroup = "reading" | "look" | "mine" | "footer"

export interface KidsMenuAction {
  /** Stable identity, independent of label/translation. */
  id:
    | "read"
    | "comfort"
    | "sign-language"
    | "easy-read"
    | "glossary"
    | "avatar"
    | "story-map"
    | "eli5"
    | "notes"
    | "language"
    | "meet-again"
  testId: string
  label: string
  /** Short label for space-constrained layouts (tiles, dials). */
  shortLabel: string
  icon: React.ReactNode
  group: KidsMenuGroup
  onSelect: () => void
  /** Toggles show an explicit On/Off state; plain actions do not. */
  toggle: boolean
  active: boolean
  disabled: boolean
}

export interface KidsMenuGroupInfo {
  id: KidsMenuGroup
  title: string
}

export interface KidsMenuModel {
  /** What the buddy is currently saying (confirmation or the idle prompt). */
  message: string
  buddyName: string
  buddyBackground: string
  buddyImages: BuddyImageSet
  /** The child's own avatar, for variants that show it. */
  avatar: KidsAvatarConfig
  actions: KidsMenuAction[]
  groups: KidsMenuGroupInfo[]
  speed: number
  setSpeed: (speed: KidsSpeed) => void
  speedLabels: { slow: string; normal: string; fast: string; group: string }
  showSpeed: boolean
  onLabel: string
  offLabel: string
  closeLabel: string
  regionLabel: string
  close: () => void
}

export interface KidsMenuProps {
  model: KidsMenuModel
  panelRef: React.RefObject<HTMLDivElement | null>
  panelCloseRef: React.RefObject<HTMLButtonElement | null>
  reduceMotion: boolean
}

export function actionsInGroup(model: KidsMenuModel, group: KidsMenuGroup) {
  return model.actions.filter((action) => action.group === group)
}
