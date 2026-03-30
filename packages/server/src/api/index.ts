import { Router, type IRouter } from "express"
import { healthRouter } from "./health.js"
import { createGraphRouter, type GraphRepository } from "./graph-router.js"
import { createFinancialRouter, type FinancialRepository } from "./financial-router.js"
import { createScenarioRouter, type ScenarioRepository } from "./scenario-router.js"
import { createSimulationRouter, type SimulationService } from "./simulation-router.js"
import { createExtractionRouter, type ExtractionService } from "./extraction-router.js"
import { createDataRouter, type DataAdapterOrchestrator } from "./data-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

type ApiRouterDeps = {
  readonly graphRepo: GraphRepository
  readonly financialRepo: FinancialRepository
  readonly scenarioRepo: ScenarioRepository
  readonly simulationService: SimulationService
  readonly extractionService: ExtractionService
  readonly dataOrchestrator: DataAdapterOrchestrator
  readonly socketHandler: SocketHandler
}

function createApiRouter(deps: ApiRouterDeps): IRouter {
  const router = Router()

  router.use(healthRouter)
  router.use("/graph", createGraphRouter(deps.graphRepo, deps.socketHandler))
  router.use("/companies", createFinancialRouter(deps.financialRepo, deps.socketHandler))
  router.use("/scenarios", createScenarioRouter(deps.scenarioRepo))
  router.use("/simulate", createSimulationRouter(deps.simulationService, deps.socketHandler))
  router.use("/extract", createExtractionRouter(deps.extractionService, deps.socketHandler))
  router.use("/data", createDataRouter(deps.dataOrchestrator))

  return router
}

export { createApiRouter }
export type { ApiRouterDeps }
