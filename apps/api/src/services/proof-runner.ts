import { runProof } from "@adt/pipeline"
import type {
  ProofRunner,
  StartProofOptions,
  ProofProgress,
} from "./proof-service.js"

/**
 * Creates the proof runner that executes post-storyboard steps.
 * Thin wrapper around @adt/pipeline's runProof that handles API key management.
 */
export function createProofRunner(): ProofRunner {
  return {
    async run(
      label: string,
      options: StartProofOptions,
      progress: ProofProgress
    ): Promise<void> {
      const previousKey = process.env.OPENAI_API_KEY
      process.env.OPENAI_API_KEY = options.apiKey

      try {
        await runProof(
          {
            label,
            booksRoot: options.booksDir,
            promptsDir: options.promptsDir,
            configPath: options.configPath,
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
