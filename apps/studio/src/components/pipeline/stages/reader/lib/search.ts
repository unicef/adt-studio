import { msg } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import type { ReaderColorToken } from "@adt/types"

/**
 * Words the inspector search understands beyond each field's own label, so a
 * search for what a setting *does* finds it ("background" finds every surface
 * token, "button" finds the button style and the primary colour). Translated,
 * so readers of the Studio in another language search in it.
 */
export const SEARCH_WORDS = {
  background: msg`background`,
  surface: msg`surface`,
  text: msg`text`,
  border: msg`border`,
  button: msg`button`,
  icon: msg`icon`,
  label: msg`label`,
  dock: msg`dock`,
  toolbar: msg`toolbar`,
  panel: msg`panel`,
  drawer: msg`drawer`,
  sidebar: msg`sidebar`,
  position: msg`position`,
  colour: msg`colour`,
  color: msg`color`,
  theme: msg`theme`,
  palette: msg`palette`,
  font: msg`font`,
  radius: msg`radius`,
  corner: msg`corner`,
  focus: msg`focus`,
  hover: msg`hover`,
  error: msg`error`,
  layout: msg`layout`,
  size: msg`size`,
  menu: msg`menu`,
} satisfies Record<string, MessageDescriptor>

export type SearchWord = keyof typeof SEARCH_WORDS

export const TOKEN_SEARCH_WORDS: Record<ReaderColorToken, SearchWord[]> = {
  background: ["background"],
  foreground: ["text"],
  card: ["background", "surface"],
  "card-foreground": ["text"],
  popover: ["background", "surface", "dock", "panel"],
  "popover-foreground": ["text", "dock", "panel"],
  primary: ["button", "background"],
  "primary-foreground": ["text", "button"],
  secondary: ["background"],
  "secondary-foreground": ["text"],
  muted: ["background"],
  "muted-foreground": ["text"],
  accent: ["background", "hover"],
  "accent-foreground": ["text", "hover"],
  destructive: ["error"],
  border: ["border"],
  input: ["border"],
  ring: ["focus", "border"],
}

export { matchesSearch, normalizeSearch } from "./search-match"
