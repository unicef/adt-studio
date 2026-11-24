import { createContext, useContext, useMemo } from "react"
import { useLingui } from "@lingui/react"
import type { SetupClient } from "./client"
import { useEngineClient } from "../engine/client"
import { engineSetupClient } from "../engine/toSetupResult"

const SetupClientContext = createContext<SetupClient | null>(null)

/** Which recommender the flow talks to. Defaults to the engine (E3) through `useEngineClient`; tests can pass their own. */
export const SetupClientProvider = SetupClientContext.Provider

export function useSetupClient(): SetupClient {
  const override = useContext(SetupClientContext)
  const engine = useEngineClient()
  const { i18n } = useLingui()
  return useMemo(() => override ?? engineSetupClient(engine, i18n), [override, engine, i18n])
}
