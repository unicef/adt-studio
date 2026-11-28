import { SETUP_FACT_OPTIONS, SetupBookFactId, SetupSettingId } from "@adt/types"

/**
 * The engine's fact and setting ids, in the order the screens list them, from the wire schema
 * (@adt/types), the one definition the engine uses too. `engine/answers` re-exports them and the
 * one-shot contract reuses `SETTING_IDS`. Kept free of UI imports so the contract can use it.
 */

export const FACT_IDS: SetupBookFactId[] = [...SetupBookFactId.options]
export const SETTING_IDS: SetupSettingId[] = [...SetupSettingId.options]

/** The answers each fact can take, in the order a question lists them. */
export const FACT_OPTIONS: Record<SetupBookFactId, readonly string[]> = SETUP_FACT_OPTIONS
