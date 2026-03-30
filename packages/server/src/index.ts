import express, { type Express } from "express"
import { createServer } from "node:http"
import { Server } from "socket.io"
import { createApiRouter } from "./api/index.js"
import { createSocketHandler } from "./websocket/index.js"

// Placeholder service factories -- replaced when Phase 4 and Phase 5 repositories are wired
import type { GraphRepository } from "./api/graph-router.js"
import type { FinancialRepository } from "./api/financial-router.js"
import type { ScenarioRepository } from "./api/scenario-router.js"
import type { SimulationService } from "./api/simulation-router.js"
import type { ExtractionService } from "./api/extraction-router.js"
import type { DataAdapterOrchestrator } from "./api/data-router.js"

function makeNotImplemented(name: string): never {
  throw new Error(`${name} not yet wired -- complete Phase 4 and Phase 5 first`)
}

const graphRepo: GraphRepository = {
  getGraph: () => makeNotImplemented("graphRepo.getGraph"),
  addCompany: () => makeNotImplemented("graphRepo.addCompany"),
  removeCompany: () => makeNotImplemented("graphRepo.removeCompany"),
  addEdge: () => makeNotImplemented("graphRepo.addEdge"),
  removeEdge: () => makeNotImplemented("graphRepo.removeEdge"),
  updateEdge: () => makeNotImplemented("graphRepo.updateEdge"),
}

const financialRepo: FinancialRepository = {
  getFinancials: () => makeNotImplemented("financialRepo.getFinancials"),
  updateFinancials: () => makeNotImplemented("financialRepo.updateFinancials"),
  recalculateDCF: () => makeNotImplemented("financialRepo.recalculateDCF"),
}

const scenarioRepo: ScenarioRepository = {
  listScenarios: () => makeNotImplemented("scenarioRepo.listScenarios"),
  createScenario: () => makeNotImplemented("scenarioRepo.createScenario"),
  getScenario: () => makeNotImplemented("scenarioRepo.getScenario"),
  addPolicy: () => makeNotImplemented("scenarioRepo.addPolicy"),
  removePolicy: () => makeNotImplemented("scenarioRepo.removePolicy"),
}

const simulationService: SimulationService = {
  runSimulation: () => makeNotImplemented("simulationService.runSimulation"),
}

const extractionService: ExtractionService = {
  extractSupplyChain: () => makeNotImplemented("extractionService.extractSupplyChain"),
  approveExtraction: () => makeNotImplemented("extractionService.approveExtraction"),
}

const dataOrchestrator: DataAdapterOrchestrator = {
  fetchAndStore: () => makeNotImplemented("dataOrchestrator.fetchAndStore"),
}

const app: Express = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: "*" },
})

const socketHandler = createSocketHandler(io)

app.use(express.json())
app.use(
  "/api",
  createApiRouter({
    graphRepo,
    financialRepo,
    scenarioRepo,
    simulationService,
    extractionService,
    dataOrchestrator,
    socketHandler,
  }),
)

io.on("connection", (socket) => {
  socketHandler.onConnection(socket)
})

const PORT = process.env["PORT"] ?? 3000

httpServer.listen(PORT, () => {
  console.log(`Tori server running on port ${PORT}`)
})

export { app, httpServer, io }
