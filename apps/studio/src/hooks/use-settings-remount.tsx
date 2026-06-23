import { createContext, useContext } from "react"

/**
 * Lets a settings surface discard its unsaved edits by remounting itself.
 * The settings route keys the active stage component on a nonce and provides
 * `remount()` to bump it — calling it throws away local form state and
 * re-initializes from the persisted config, which is a uniform "discard" for
 * every stage without each one re-implementing field-by-field reset.
 */
const SettingsRemountContext = createContext<() => void>(() => {})

export const SettingsRemountProvider = SettingsRemountContext.Provider

export function useSettingsRemount(): () => void {
  return useContext(SettingsRemountContext)
}
