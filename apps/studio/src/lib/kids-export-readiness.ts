import type {
  KidsInterfaceStatus,
  KidsModeConfig,
  KidsVoiceStatus,
} from "@adt/types"

export interface KidsExportReadiness {
  ready: boolean
  setupEnabled: boolean
  interfaceReady: boolean
  voicesReady: boolean
  buddyCount: number
  languageCount: number
  readyVoiceLanguageCount: number
  missingInterfaceLanguages: string[]
  missingVoiceLanguages: string[]
}

/**
 * One UI-level readiness calculation shared by Home and Export.
 * The API repeats the safety checks at packaging time so this can never be
 * bypassed by stale client state.
 */
export function getKidsExportReadiness(options: {
  config?: KidsModeConfig
  interfaceStatus?: KidsInterfaceStatus
  voiceStatus?: KidsVoiceStatus
}): KidsExportReadiness {
  const buddies = options.config?.buddies ?? []
  const requiredLanguages =
    options.interfaceStatus?.languages.map((entry) => entry.language) ?? []
  const missingInterfaceLanguages =
    options.interfaceStatus?.languages
      .filter((entry) => !entry.ready)
      .map((entry) => entry.language) ?? []
  const missingVoiceLanguages = requiredLanguages.filter((language) => {
    const voice = options.voiceStatus?.languages.find(
      (entry) => entry.language === language,
    )
    return (
      !voice ||
      !voice.narratorReady ||
      buddies.some(
        (buddy) => !voice.completeCharacters.includes(buddy),
      )
    )
  })
  const setupEnabled = options.config?.enabled === true
  const interfaceReady =
    options.interfaceStatus?.ready === true && requiredLanguages.length > 0
  const voicesReady =
    requiredLanguages.length > 0 && missingVoiceLanguages.length === 0

  return {
    ready: setupEnabled && interfaceReady && voicesReady,
    setupEnabled,
    interfaceReady,
    voicesReady,
    buddyCount: buddies.length,
    languageCount: requiredLanguages.length,
    readyVoiceLanguageCount:
      requiredLanguages.length - missingVoiceLanguages.length,
    missingInterfaceLanguages,
    missingVoiceLanguages,
  }
}
