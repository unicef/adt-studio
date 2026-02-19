import { runMaster } from "@adt/pipeline"
import type {
  MasterRunner,
  StartMasterOptions,
  MasterProgress,
} from "./master-service.js"

/**
 * Creates the master runner that executes post-proof steps.
 * Thin wrapper around @adt/pipeline's runMaster that handles API key management.
 */
export function createMasterRunner(): MasterRunner {
  return {
    async run(
      label: string,
      options: StartMasterOptions,
      progress: MasterProgress
    ): Promise<void> {
      const previousKey = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = options.apiKey

      try {
        await runMaster(
          {
            label,
            booksRoot: options.booksDir,
            promptsDir: options.promptsDir,
            configPath: options.configPath,
            azureSpeechKey: options.azureSpeechKey,
            azureSpeechRegion: options.azureSpeechRegion,
          },
          progress
        )
      } finally {
        if (previousKey !== undefined) {
          process.env.OPENAI_API_KEY = previousKey
        } else {
          delete process.env.OPENAI_API_KEY
        }
      }
    },
  }
}
