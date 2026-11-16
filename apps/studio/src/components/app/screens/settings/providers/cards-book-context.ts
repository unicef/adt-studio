import { createContext } from "react"

/** The book whose API keys screen hosts the provider cards; null in Settings → AI providers. */
export const CardsBookContext = createContext<string | null>(null)
