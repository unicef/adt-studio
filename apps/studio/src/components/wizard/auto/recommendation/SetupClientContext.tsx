import { createContext, useContext } from "react"
import type { SetupClient } from "./client"
import { placeholderSetupClient } from "./placeholder"

const SetupClientContext = createContext<SetupClient>(placeholderSetupClient)

/** Which recommender the flow talks to. Defaults to the placeholder; the API client replaces it, and tests can pass their own. */
export const SetupClientProvider = SetupClientContext.Provider

export function useSetupClient(): SetupClient {
  return useContext(SetupClientContext)
}
