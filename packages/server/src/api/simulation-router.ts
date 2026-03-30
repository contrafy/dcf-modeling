import { Router, type IRouter } from "express"
import type { SimulationResult, PropagationStep } from "@dcf-modeling/shared"
import type { SocketHandler } from "../websocket/socket-handler.js"
import { randomUUID } from "node:crypto"

type SimulationService = {
  readonly runSimulation: (
    scenarioId: string,
    onStep: (step: PropagationStep) => void,
  ) => Promise<SimulationResult>
}

function serializeResult(result: SimulationResult): Record<string, unknown> {
  return {
    scenarioId: result.scenarioId,
    iterationCount: result.iterationCount,
    converged: result.converged,
    impacts: Array.from(result.impacts.values()),
  }
}

function createSimulationRouter(service: SimulationService, ws: SocketHandler): IRouter {
  const router = Router()

  router.post("/:scenarioId", async (req, res) => {
    const scenarioId = String(req.params["scenarioId"])
    const jobId = randomUUID()

    ws.emitSimulationStarted({ scenarioId, jobId })

    const result = await service.runSimulation(scenarioId, (step) => {
      ws.emitSimulationStep(step)
    })

    const impacts = Array.from(result.impacts.values())

    ws.emitSimulationCompleted({
      scenarioId: result.scenarioId,
      impacts,
      iterationCount: result.iterationCount,
      converged: result.converged,
    })

    res.json(serializeResult(result))
  })

  return router
}

export { createSimulationRouter }
export type { SimulationService }
