// Real process boundary for committed-state recovery; no provider work is run.
import { createBookStorage } from "@adt/storage"
import { createBookEventBus } from "../book-event-bus.ts"
import { createPageErrorDecisions } from "../page-error-decisions.ts"
import { createStageService } from "../stage-service.ts"
import { createStageRoutes } from "../../routes/stages.ts"
import { startServer } from "../../server.ts"

const booksDir = process.env.BOOKS_DIR
const bus = createBookEventBus()
const broker = createPageErrorDecisions(bus)
let workerCalls = 0
const service = createStageService(
  {
    async run() {
      workerCalls++
    },
  },
  bus,
  broker,
)
const routes = createStageRoutes(service, bus, broker, booksDir, "", "")
// Use production startup cleanup and actual HTTP routes without opening a port.
startServer({ booksDirPath: booksDir, fetchHandler: routes.fetch, serveFn: () => undefined })
if (process.argv[2] === "prime") {
  const storage = createBookStorage("book", booksDir)
  storage.markStepStarted("image-meaningfulness")
  // Leave the process and book storage alive at the failure decision boundary.
  bus.addListener("book", () => {})
  broker.beginRun("book", "interrupted-run")
  void broker.requestDecision({
    label: "book",
    runId: "interrupted-run",
    step: "image-meaningfulness",
    pageId: "pg001",
    error: "Provider failed",
  })
  process.send({ decision: broker.getPendingDecisions("book")[0] })
} else {
  const status = await (await routes.request("/books/book/step-status")).json()
  const stale = await routes.request("/books/book/stages/decision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ decisionId: process.argv[3], action: "skip" }),
  })
  process.send({ status, staleStatus: stale.status, workerCalls })
}
// IPC keeps this process alive until the parent terminates it.
process.on("message", () => {})
