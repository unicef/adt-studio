export interface Country {
  code: string
  name: string
}

export interface Language {
  code: string
  name: string
  countries?: Country[]
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "sq", name: "Albanian", countries: [
    { code: "al", name: "Albania" },
    { code: "xk", name: "Kosovo" },
    { code: "mk", name: "North Macedonia" },
    { code: "me", name: "Montenegro" },
    { code: "rs", name: "Serbia" },
    { code: "gr", name: "Greece" },
  ]},
  { code: "ar", name: "Arabic", countries: [
    { code: "eg", name: "Egypt" },
    { code: "sa", name: "Saudi Arabia" },
    { code: "ae", name: "United Arab Emirates" },
    { code: "ma", name: "Morocco" },
    { code: "iq", name: "Iraq" },
    { code: "jo", name: "Jordan" },
    { code: "lb", name: "Lebanon" },
    { code: "sy", name: "Syria" },
    { code: "tn", name: "Tunisia" },
    { code: "dz", name: "Algeria" },
    { code: "ly", name: "Libya" },
    { code: "sd", name: "Sudan" },
    { code: "ye", name: "Yemen" },
    { code: "kw", name: "Kuwait" },
    { code: "qa", name: "Qatar" },
    { code: "om", name: "Oman" },
  ]},
  { code: "hy", name: "Armenian", countries: [
    { code: "am", name: "Armenia" },
  ]},
  { code: "az", name: "Azerbaijani", countries: [
    { code: "az", name: "Azerbaijan" },
  ]},
  { code: "bn", name: "Bengali", countries: [
    { code: "bd", name: "Bangladesh" },
    { code: "in", name: "India" },
  ]},
  { code: "bs", name: "Bosnian", countries: [
    { code: "ba", name: "Bosnia and Herzegovina" },
  ]},
  { code: "bg", name: "Bulgarian", countries: [
    { code: "bg", name: "Bulgaria" },
  ]},
  { code: "my", name: "Burmese", countries: [
    { code: "mm", name: "Myanmar" },
  ]},
  { code: "zh", name: "Chinese", countries: [
    { code: "cn", name: "China" },
    { code: "tw", name: "Taiwan" },
    { code: "hk", name: "Hong Kong" },
    { code: "sg", name: "Singapore" },
    { code: "my", name: "Malaysia" },
  ]},
  { code: "hr", name: "Croatian", countries: [
    { code: "hr", name: "Croatia" },
  ]},
  { code: "cs", name: "Czech", countries: [
    { code: "cz", name: "Czech Republic" },
  ]},
  { code: "da", name: "Danish", countries: [
    { code: "dk", name: "Denmark" },
  ]},
  { code: "nl", name: "Dutch", countries: [
    { code: "nl", name: "Netherlands" },
    { code: "be", name: "Belgium" },
  ]},
  { code: "dz", name: "Dzongkha", countries: [
    { code: "bt", name: "Bhutan" },
  ]},
  { code: "en", name: "English", countries: [
    { code: "us", name: "United States" },
    { code: "gb", name: "United Kingdom" },
    { code: "au", name: "Australia" },
    { code: "ca", name: "Canada" },
    { code: "nz", name: "New Zealand" },
    { code: "ie", name: "Ireland" },
    { code: "in", name: "India" },
    { code: "za", name: "South Africa" },
    { code: "sg", name: "Singapore" },
    { code: "ph", name: "Philippines" },
    { code: "ng", name: "Nigeria" },
    { code: "ke", name: "Kenya" },
    { code: "gh", name: "Ghana" },
    { code: "jm", name: "Jamaica" },
  ]},
  { code: "et", name: "Estonian", countries: [
    { code: "ee", name: "Estonia" },
  ]},
  { code: "fil", name: "Filipino", countries: [
    { code: "ph", name: "Philippines" },
  ]},
  { code: "fi", name: "Finnish", countries: [
    { code: "fi", name: "Finland" },
  ]},
  { code: "fr", name: "French", countries: [
    { code: "fr", name: "France" },
    { code: "ca", name: "Canada" },
    { code: "be", name: "Belgium" },
    { code: "ch", name: "Switzerland" },
    { code: "sn", name: "Senegal" },
    { code: "ci", name: "Côte d'Ivoire" },
    { code: "cm", name: "Cameroon" },
    { code: "cd", name: "Congo (DRC)" },
    { code: "mg", name: "Madagascar" },
    { code: "ml", name: "Mali" },
    { code: "ht", name: "Haiti" },
    { code: "lu", name: "Luxembourg" },
  ]},
  { code: "ka", name: "Georgian", countries: [
    { code: "ge", name: "Georgia" },
  ]},
  { code: "de", name: "German", countries: [
    { code: "de", name: "Germany" },
    { code: "at", name: "Austria" },
    { code: "ch", name: "Switzerland" },
    { code: "lu", name: "Luxembourg" },
  ]},
  { code: "el", name: "Greek", countries: [
    { code: "gr", name: "Greece" },
    { code: "cy", name: "Cyprus" },
  ]},
  { code: "gu", name: "Gujarati", countries: [
    { code: "in", name: "India" },
  ]},
  { code: "ha", name: "Hausa", countries: [
    { code: "ng", name: "Nigeria" },
    { code: "ne", name: "Niger" },
  ]},
  { code: "he", name: "Hebrew", countries: [
    { code: "il", name: "Israel" },
  ]},
  { code: "hi", name: "Hindi", countries: [
    { code: "in", name: "India" },
  ]},
  { code: "hu", name: "Hungarian", countries: [
    { code: "hu", name: "Hungary" },
  ]},
  { code: "is", name: "Icelandic", countries: [
    { code: "is", name: "Iceland" },
  ]},
  { code: "id", name: "Indonesian", countries: [
    { code: "id", name: "Indonesia" },
  ]},
  { code: "it", name: "Italian", countries: [
    { code: "it", name: "Italy" },
    { code: "ch", name: "Switzerland" },
  ]},
  { code: "ja", name: "Japanese", countries: [
    { code: "jp", name: "Japan" },
  ]},
  { code: "kk", name: "Kazakh", countries: [
    { code: "kz", name: "Kazakhstan" },
  ]},
  { code: "km", name: "Khmer", countries: [
    { code: "kh", name: "Cambodia" },
  ]},
  { code: "rw", name: "Kinyarwanda", countries: [
    { code: "rw", name: "Rwanda" },
  ]},
  { code: "ko", name: "Korean", countries: [
    { code: "kr", name: "South Korea" },
    { code: "kp", name: "North Korea" },
  ]},
  { code: "ky", name: "Kyrgyz", countries: [
    { code: "kg", name: "Kyrgyzstan" },
  ]},
  { code: "lo", name: "Lao", countries: [
    { code: "la", name: "Laos" },
  ]},
  { code: "lv", name: "Latvian", countries: [
    { code: "lv", name: "Latvia" },
  ]},
  { code: "lt", name: "Lithuanian", countries: [
    { code: "lt", name: "Lithuania" },
  ]},
  { code: "mg", name: "Malagasy", countries: [
    { code: "mg", name: "Madagascar" },
  ]},
  { code: "ms", name: "Malay", countries: [
    { code: "my", name: "Malaysia" },
    { code: "bn", name: "Brunei" },
  ]},
  { code: "ml", name: "Malayalam", countries: [
    { code: "in", name: "India" },
  ]},
  { code: "mr", name: "Marathi", countries: [
    { code: "in", name: "India" },
  ]},
  { code: "mn", name: "Mongolian", countries: [
    { code: "mn", name: "Mongolia" },
  ]},
  { code: "ne", name: "Nepali", countries: [
    { code: "np", name: "Nepal" },
    { code: "in", name: "India" },
  ]},
  { code: "no", name: "Norwegian", countries: [
    { code: "no", name: "Norway" },
  ]},
  { code: "or", name: "Odia", countries: [
    { code: "in", name: "India" },
  ]},
  { code: "ps", name: "Pashto", countries: [
    { code: "af", name: "Afghanistan" },
    { code: "pk", name: "Pakistan" },
  ]},
  { code: "fa", name: "Persian", countries: [
    { code: "ir", name: "Iran" },
    { code: "af", name: "Afghanistan" },
    { code: "tj", name: "Tajikistan" },
  ]},
  { code: "pl", name: "Polish", countries: [
    { code: "pl", name: "Poland" },
  ]},
  { code: "pt", name: "Portuguese", countries: [
    { code: "br", name: "Brazil" },
    { code: "pt", name: "Portugal" },
    { code: "mz", name: "Mozambique" },
  ]},
  { code: "pa", name: "Punjabi", countries: [
    { code: "in", name: "India" },
    { code: "pk", name: "Pakistan" },
  ]},
  { code: "ro", name: "Romanian", countries: [
    { code: "ro", name: "Romania" },
    { code: "md", name: "Moldova" },
  ]},
  { code: "ru", name: "Russian", countries: [
    { code: "ru", name: "Russia" },
    { code: "by", name: "Belarus" },
    { code: "kz", name: "Kazakhstan" },
    { code: "kg", name: "Kyrgyzstan" },
  ]},
  { code: "sr", name: "Serbian", countries: [
    { code: "rs", name: "Serbia" },
    { code: "xk", name: "Kosovo" },
    { code: "ba", name: "Bosnia and Herzegovina" },
    { code: "me", name: "Montenegro" },
  ]},
  { code: "si", name: "Sinhala", countries: [
    { code: "lk", name: "Sri Lanka" },
  ]},
  { code: "sk", name: "Slovak", countries: [
    { code: "sk", name: "Slovakia" },
  ]},
  { code: "sl", name: "Slovenian", countries: [
    { code: "si", name: "Slovenia" },
  ]},
  { code: "so", name: "Somali", countries: [
    { code: "so", name: "Somalia" },
  ]},
  { code: "es", name: "Spanish", countries: [
    { code: "es", name: "Spain" },
    { code: "mx", name: "Mexico" },
    { code: "ar", name: "Argentina" },
    { code: "co", name: "Colombia" },
    { code: "pe", name: "Peru" },
    { code: "cl", name: "Chile" },
    { code: "ve", name: "Venezuela" },
    { code: "ec", name: "Ecuador" },
    { code: "gt", name: "Guatemala" },
    { code: "cu", name: "Cuba" },
    { code: "do", name: "Dominican Republic" },
    { code: "hn", name: "Honduras" },
    { code: "sv", name: "El Salvador" },
    { code: "ni", name: "Nicaragua" },
    { code: "cr", name: "Costa Rica" },
    { code: "pa", name: "Panama" },
    { code: "py", name: "Paraguay" },
    { code: "uy", name: "Uruguay" },
    { code: "bo", name: "Bolivia" },
  ]},
  { code: "sw", name: "Swahili", countries: [
    { code: "ke", name: "Kenya" },
    { code: "tz", name: "Tanzania" },
    { code: "ug", name: "Uganda" },
    { code: "cd", name: "Congo (DRC)" },
    { code: "rw", name: "Rwanda" },
  ]},
  { code: "sv", name: "Swedish", countries: [
    { code: "se", name: "Sweden" },
    { code: "fi", name: "Finland" },
  ]},
  { code: "ta", name: "Tamil", countries: [
    { code: "in", name: "India" },
    { code: "lk", name: "Sri Lanka" },
    { code: "sg", name: "Singapore" },
    { code: "my", name: "Malaysia" },
  ]},
  { code: "te", name: "Telugu", countries: [
    { code: "in", name: "India" },
  ]},
  { code: "th", name: "Thai", countries: [
    { code: "th", name: "Thailand" },
  ]},
  { code: "ti", name: "Tigrinya", countries: [
    { code: "er", name: "Eritrea" },
    { code: "et", name: "Ethiopia" },
  ]},
  { code: "tr", name: "Turkish", countries: [
    { code: "tr", name: "Turkey" },
  ]},
  { code: "uk", name: "Ukrainian", countries: [
    { code: "ua", name: "Ukraine" },
  ]},
  { code: "ur", name: "Urdu", countries: [
    { code: "pk", name: "Pakistan" },
    { code: "in", name: "India" },
  ]},
  { code: "uz", name: "Uzbek", countries: [
    { code: "uz", name: "Uzbekistan" },
  ]},
  { code: "vi", name: "Vietnamese", countries: [
    { code: "vn", name: "Vietnam" },
  ]},
  { code: "yo", name: "Yoruba", countries: [
    { code: "ng", name: "Nigeria" },
    { code: "bj", name: "Benin" },
  ]},
  { code: "zu", name: "Zulu", countries: [
    { code: "za", name: "South Africa" },
  ]},
]

/** All countries — used as the full suggestion pool in phase 2 of the picker. */
export const ALL_COUNTRIES: Country[] = [
  { code: "af", name: "Afghanistan" },
  { code: "al", name: "Albania" },
  { code: "dz", name: "Algeria" },
  { code: "ar", name: "Argentina" },
  { code: "am", name: "Armenia" },
  { code: "au", name: "Australia" },
  { code: "at", name: "Austria" },
  { code: "az", name: "Azerbaijan" },
  { code: "bd", name: "Bangladesh" },
  { code: "by", name: "Belarus" },
  { code: "be", name: "Belgium" },
  { code: "bj", name: "Benin" },
  { code: "bt", name: "Bhutan" },
  { code: "bo", name: "Bolivia" },
  { code: "ba", name: "Bosnia and Herzegovina" },
  { code: "bw", name: "Botswana" },
  { code: "br", name: "Brazil" },
  { code: "bn", name: "Brunei" },
  { code: "bg", name: "Bulgaria" },
  { code: "bf", name: "Burkina Faso" },
  { code: "bi", name: "Burundi" },
  { code: "kh", name: "Cambodia" },
  { code: "cm", name: "Cameroon" },
  { code: "ca", name: "Canada" },
  { code: "cf", name: "Central African Republic" },
  { code: "td", name: "Chad" },
  { code: "cl", name: "Chile" },
  { code: "cn", name: "China" },
  { code: "co", name: "Colombia" },
  { code: "cd", name: "Congo (DRC)" },
  { code: "cg", name: "Congo (Republic)" },
  { code: "cr", name: "Costa Rica" },
  { code: "ci", name: "Côte d'Ivoire" },
  { code: "hr", name: "Croatia" },
  { code: "cu", name: "Cuba" },
  { code: "cy", name: "Cyprus" },
  { code: "cz", name: "Czech Republic" },
  { code: "dk", name: "Denmark" },
  { code: "do", name: "Dominican Republic" },
  { code: "ec", name: "Ecuador" },
  { code: "eg", name: "Egypt" },
  { code: "sv", name: "El Salvador" },
  { code: "er", name: "Eritrea" },
  { code: "ee", name: "Estonia" },
  { code: "et", name: "Ethiopia" },
  { code: "fi", name: "Finland" },
  { code: "fr", name: "France" },
  { code: "ga", name: "Gabon" },
  { code: "ge", name: "Georgia" },
  { code: "de", name: "Germany" },
  { code: "gh", name: "Ghana" },
  { code: "gr", name: "Greece" },
  { code: "gt", name: "Guatemala" },
  { code: "gn", name: "Guinea" },
  { code: "ht", name: "Haiti" },
  { code: "hn", name: "Honduras" },
  { code: "hk", name: "Hong Kong" },
  { code: "hu", name: "Hungary" },
  { code: "is", name: "Iceland" },
  { code: "in", name: "India" },
  { code: "id", name: "Indonesia" },
  { code: "ir", name: "Iran" },
  { code: "iq", name: "Iraq" },
  { code: "ie", name: "Ireland" },
  { code: "il", name: "Israel" },
  { code: "it", name: "Italy" },
  { code: "jm", name: "Jamaica" },
  { code: "jp", name: "Japan" },
  { code: "jo", name: "Jordan" },
  { code: "kz", name: "Kazakhstan" },
  { code: "ke", name: "Kenya" },
  { code: "kp", name: "North Korea" },
  { code: "kr", name: "South Korea" },
  { code: "xk", name: "Kosovo" },
  { code: "kw", name: "Kuwait" },
  { code: "kg", name: "Kyrgyzstan" },
  { code: "la", name: "Laos" },
  { code: "lv", name: "Latvia" },
  { code: "lb", name: "Lebanon" },
  { code: "lr", name: "Liberia" },
  { code: "ly", name: "Libya" },
  { code: "lt", name: "Lithuania" },
  { code: "lu", name: "Luxembourg" },
  { code: "mg", name: "Madagascar" },
  { code: "mw", name: "Malawi" },
  { code: "my", name: "Malaysia" },
  { code: "ml", name: "Mali" },
  { code: "mx", name: "Mexico" },
  { code: "md", name: "Moldova" },
  { code: "mn", name: "Mongolia" },
  { code: "me", name: "Montenegro" },
  { code: "ma", name: "Morocco" },
  { code: "mz", name: "Mozambique" },
  { code: "mm", name: "Myanmar" },
  { code: "na", name: "Namibia" },
  { code: "np", name: "Nepal" },
  { code: "nl", name: "Netherlands" },
  { code: "nz", name: "New Zealand" },
  { code: "ni", name: "Nicaragua" },
  { code: "ne", name: "Niger" },
  { code: "ng", name: "Nigeria" },
  { code: "mk", name: "North Macedonia" },
  { code: "no", name: "Norway" },
  { code: "om", name: "Oman" },
  { code: "pk", name: "Pakistan" },
  { code: "pa", name: "Panama" },
  { code: "py", name: "Paraguay" },
  { code: "pe", name: "Peru" },
  { code: "ph", name: "Philippines" },
  { code: "pl", name: "Poland" },
  { code: "pt", name: "Portugal" },
  { code: "qa", name: "Qatar" },
  { code: "ro", name: "Romania" },
  { code: "ru", name: "Russia" },
  { code: "rw", name: "Rwanda" },
  { code: "sa", name: "Saudi Arabia" },
  { code: "sn", name: "Senegal" },
  { code: "rs", name: "Serbia" },
  { code: "sl", name: "Sierra Leone" },
  { code: "sg", name: "Singapore" },
  { code: "sk", name: "Slovakia" },
  { code: "si", name: "Slovenia" },
  { code: "so", name: "Somalia" },
  { code: "za", name: "South Africa" },
  { code: "ss", name: "South Sudan" },
  { code: "es", name: "Spain" },
  { code: "lk", name: "Sri Lanka" },
  { code: "sd", name: "Sudan" },
  { code: "se", name: "Sweden" },
  { code: "ch", name: "Switzerland" },
  { code: "sy", name: "Syria" },
  { code: "tw", name: "Taiwan" },
  { code: "tj", name: "Tajikistan" },
  { code: "tz", name: "Tanzania" },
  { code: "th", name: "Thailand" },
  { code: "tg", name: "Togo" },
  { code: "tn", name: "Tunisia" },
  { code: "tr", name: "Turkey" },
  { code: "tm", name: "Turkmenistan" },
  { code: "ug", name: "Uganda" },
  { code: "ua", name: "Ukraine" },
  { code: "ae", name: "United Arab Emirates" },
  { code: "gb", name: "United Kingdom" },
  { code: "us", name: "United States" },
  { code: "uy", name: "Uruguay" },
  { code: "uz", name: "Uzbekistan" },
  { code: "ve", name: "Venezuela" },
  { code: "vn", name: "Vietnam" },
  { code: "ye", name: "Yemen" },
  { code: "zm", name: "Zambia" },
  { code: "zw", name: "Zimbabwe" },
]

const ALL_COUNTRIES_MAP = new Map(ALL_COUNTRIES.map((c) => [c.code, c]))

/** Normalize a locale code to dash format: lowercase lang + uppercase country (e.g., "en-US"). */
export function normalizeLocale(code: string): string {
  const normalized = code.trim().replace(/_/g, "-")
  const parts = normalized.split("-")
  if (parts.length === 2) {
    return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`
  }
  return normalized.toLowerCase()
}

/** Extract the base language from a locale code (e.g., "en-US" -> "en"). */
export function getBaseLanguage(code: string): string {
  return normalizeLocale(code).split("-")[0]
}

/** Map language/locale codes to display names. Handles "en", "en-US", etc. */
export const LANG_MAP = new Map<string, string>()

for (const lang of SUPPORTED_LANGUAGES) {
  LANG_MAP.set(lang.code, lang.name)
  if (lang.countries) {
    for (const c of lang.countries) {
      const locale = `${lang.code}-${c.code.toUpperCase()}`
      // Keep underscore aliases for backward compatibility with old saved values.
      LANG_MAP.set(locale, `${lang.name} (${c.name})`)
      LANG_MAP.set(locale.replace("-", "_"), `${lang.name} (${c.name})`)
    }
  }
}

/** Look up a display name for any code, including unknown locale combos. */
export function getDisplayName(code: string): string {
  if (!code) return ""
  // Normalize to standard format (lowercase lang, uppercase country)
  const normalized = normalizeLocale(code)
  const known = LANG_MAP.get(normalized)
  if (known) return known
  // Try to resolve unknown locale codes like "en-TZ" from parts
  const parts = normalized.split("-")
  if (parts.length === 2) {
    const langName = LANG_MAP.get(parts[0])
    const country = ALL_COUNTRIES_MAP.get(parts[1].toLowerCase())
    if (langName && country) return `${langName} (${country.name})`
    if (langName) return `${langName} (${parts[1]})`
  }
  return normalized
}

/** Get countries for phase 2 of the picker. Suggested countries first, then all others. */
export function getCountriesForLanguage(langCode: string): { suggested: Country[]; all: Country[] } {
  const lang = findLanguage(langCode)
  const suggested = lang?.countries ?? []
  const suggestedCodes = new Set(suggested.map((c) => c.code))
  const all = ALL_COUNTRIES.filter((c) => !suggestedCodes.has(c.code))
  return { suggested, all }
}

/** Find a language entry by code. */
export function findLanguage(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)
}

/**
 * Whether a language or country search finds an entry: an empty query finds every one; otherwise
 * one of its `names` (a name, a name in another language, a code) contains the query, ignoring
 * case (in `locale` when the names are in that language).
 */
export function matchesSearch(query: string, names: readonly string[], locale?: string): boolean {
  const lower = (text: string) => (locale ? text.toLocaleLowerCase(locale) : text.toLowerCase())
  const q = lower(query)
  return !q || names.some((name) => lower(name).includes(q))
}
