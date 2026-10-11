/** API and CLI use the same preservation-aware stage executors. */
import { createStageRunner as createSharedStageRunner } from "@adt/pipeline/stage-execution"
import { resolvePromptOverridesDir } from "./prompt-roots.js"
export { RunCancelledError, buildStageRunnerImageClassifyConfig, processWithConcurrency } from "@adt/pipeline/stage-execution"
export function createStageRunner() {
  const shared = createSharedStageRunner()
  return { run: (...[label, options, progress]: Parameters<typeof shared.run>) => shared.run(label, {
    ...options, promptOverridesDir: options.promptOverridesDir ?? resolvePromptOverridesDir(options.booksDir),
  }, progress) }
}
