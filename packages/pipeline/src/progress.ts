import type { ProgressEvent } from "@adt/types"

export interface Progress {
  emit(event: ProgressEvent): void
}

export const nullProgress: Progress = {
  emit: () => {},
}

export function createConsoleProgress(): Progress {
  return {
    emit(event) {
      switch (event.type) {
        case "step-start":
          process.stderr.write(`Starting ${event.step}...\n`)
          break
        case "step-progress":
          if (event.page !== undefined && event.totalPages !== undefined) {
            process.stderr.write(
              `  ${event.step}: ${event.message} (${event.page}/${event.totalPages})\n`
            )
          } else {
            process.stderr.write(`  ${event.step}: ${event.message}\n`)
          }
          break
        case "step-complete":
          process.stderr.write(`Completed ${event.step}\n`)
          break
        case "step-error":
          process.stderr.write(`Error in ${event.step}: ${event.error}\n`)
          break
      }
    },
  }
}
