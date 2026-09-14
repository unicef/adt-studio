import type { LocalizedText } from "@adt/types"

/** Reusable field labels so every provider ships all five locales. */
export const LABEL_API_KEY: LocalizedText = {
  en: "API key",
  "pt-BR": "Chave de API",
  es: "Clave de API",
  fr: "Clé d'API",
  sq: "Kyçi API",
}

export const LABEL_BASE_URL: LocalizedText = {
  en: "Base URL",
  "pt-BR": "URL base",
  es: "URL base",
  fr: "URL de base",
  sq: "URL bazë",
}

export const LABEL_REGION: LocalizedText = {
  en: "Region",
  "pt-BR": "Região",
  es: "Región",
  fr: "Région",
  sq: "Regjioni",
}

export const HELP_OPTIONAL_API_KEY: LocalizedText = {
  en: "Optional. Leave empty for servers that do not require authentication.",
  "pt-BR": "Opcional. Deixe vazio para servidores que não exigem autenticação.",
  es: "Opcional. Déjelo vacío para servidores que no requieren autenticación.",
  fr: "Facultatif. Laissez vide pour les serveurs sans authentification.",
  sq: "Opsionale. Lëreni bosh për serverët që nuk kërkojnë vërtetim.",
}
