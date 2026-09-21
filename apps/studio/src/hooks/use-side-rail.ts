import { createPanelStore } from "./create-panel-store"

const store = createPanelStore("adt.side-rail", true)

/** Whether the left index rail — pages in the storyboard, output in a step — is expanded. */
export function useSideRailOpen() {
  return store.useOpen()
}
