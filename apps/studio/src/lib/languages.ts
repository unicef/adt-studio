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
  { code: "ar", name: "Arabic", countries: [
    { code: "eg", name: "Egypt" },
    { code: "sa", name: "Saudi Arabia" },
    { code: "ma", name: "Morocco" },
  ]},
  { code: "bn", name: "Bengali", countries: [
    { code: "bd", name: "Bangladesh" },
    { code: "in", name: "India" },
  ]},
  { code: "zh", name: "Chinese", countries: [
    { code: "cn", name: "China" },
    { code: "tw", name: "Taiwan" },
    { code: "hk", name: "Hong Kong" },
  ]},
  { code: "nl", name: "Dutch", countries: [
    { code: "nl", name: "Netherlands" },
    { code: "be", name: "Belgium" },
  ]},
  { code: "en", name: "English", countries: [
    { code: "us", name: "United States" },
    { code: "gb", name: "United Kingdom" },
    { code: "au", name: "Australia" },
    { code: "ca", name: "Canada" },
    { code: "in", name: "India" },
    { code: "za", name: "South Africa" },
  ]},
  { code: "fr", name: "French", countries: [
    { code: "fr", name: "France" },
    { code: "ca", name: "Canada" },
    { code: "be", name: "Belgium" },
    { code: "ch", name: "Switzerland" },
  ]},
  { code: "de", name: "German", countries: [
    { code: "de", name: "Germany" },
    { code: "at", name: "Austria" },
    { code: "ch", name: "Switzerland" },
  ]},
  { code: "hi", name: "Hindi" },
  { code: "id", name: "Indonesian" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "pl", name: "Polish" },
  { code: "pt", name: "Portuguese", countries: [
    { code: "br", name: "Brazil" },
    { code: "pt", name: "Portugal" },
  ]},
  { code: "ru", name: "Russian" },
  { code: "si", name: "Sinhala" },
  { code: "es", name: "Spanish", countries: [
    { code: "es", name: "Spain" },
    { code: "mx", name: "Mexico" },
    { code: "ar", name: "Argentina" },
    { code: "co", name: "Colombia" },
  ]},
  { code: "sw", name: "Swahili", countries: [
    { code: "ke", name: "Kenya" },
    { code: "tz", name: "Tanzania" },
  ]},
  { code: "ta", name: "Tamil", countries: [
    { code: "in", name: "India" },
    { code: "lk", name: "Sri Lanka" },
  ]},
  { code: "th", name: "Thai" },
  { code: "tr", name: "Turkish" },
  { code: "vi", name: "Vietnamese" },
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
  { code: "bo", name: "Bolivia" },
  { code: "ba", name: "Bosnia and Herzegovina" },
  { code: "bw", name: "Botswana" },
  { code: "br", name: "Brazil" },
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

/** Map language/locale codes to display names. Handles "en", "en_US", etc. */
export const LANG_MAP = new Map<string, string>()

for (const lang of SUPPORTED_LANGUAGES) {
  LANG_MAP.set(lang.code, lang.name)
  if (lang.countries) {
    for (const c of lang.countries) {
      LANG_MAP.set(`${lang.code}_${c.code.toUpperCase()}`, `${lang.name} (${c.name})`)
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
  // Try to resolve unknown locale codes like "en_TZ" from parts
  const parts = normalized.split("_")
  if (parts.length === 2) {
    const langName = LANG_MAP.get(parts[0])
    const country = ALL_COUNTRIES_MAP.get(parts[1].toLowerCase())
    if (langName && country) return `${langName} (${country.name})`
    if (langName) return `${langName} (${parts[1]})`
  }
  return code
}

/** Normalize a locale code to standard format: lowercase lang, uppercase country (e.g., "en_US"). */
function normalizeLocale(code: string): string {
  const parts = code.split("_")
  if (parts.length === 2) return `${parts[0].toLowerCase()}_${parts[1].toUpperCase()}`
  return code.toLowerCase()
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
