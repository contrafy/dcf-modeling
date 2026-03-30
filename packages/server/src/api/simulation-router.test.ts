import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createSimulationRouter } from "./simulation-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"
import type { SimulationResult, ShockImpact, PropagationStep } from "@dcf-modeling/shared"

type SimulationService = {
  runSimulation: (
    scenarioId: string,
    onStep: (step: PropagationStep) => void,
  ) => Promise<SimulationResult>
}

function makeImpact(ticker: string): ShockImpact {
  return {
    ticker,
    baselineValuation: 1_000_000,
    shockedValuation: 800_000,
    delta: -200_000,
    percentChange: -0.20,
  }
}

function makeResult(scenarioId: string): SimulationResult {
  return {
    scenarioId,
    impacts: new Map([
      ["AAPL", makeImpact("AAPL")],
      ["TSM", makeImpact("TSM")],
    ]),
    iterationCount: 3,
    converged: true,
  }
}

function makeService(overrides: Partial<SimulationService> = {}): SimulationService {
  return {
    runSimulation: vi.fn().mockImplementation(
      async (scenarioId: string, onStep: (step: PropagationStep) => void) => {
        onStep({ iteration: 1, affectedTicker: "TSM", previousValuation: 1_000_000, newValuation: 900_000, delta: -100_000 })
        onStep({ iteration: 2, affectedTicker: "AAPL", previousValuation: 1_000_000, newValuation: 850_000, delta: -150_000 })
        return makeResult(scenarioId)
      },
    ),
    ...overrides,
  }
}

function makeSocketHandler(): SocketHandler {
  return {
    onConnection: vi.fn(),
    emitGraphUpdated: vi.fn(),
    emitNodeUpdated: vi.fn(),
    emitEdgeUpdated: vi.fn(),
    emitSimulationStarted: vi.fn(),
    emitSimulationStep: vi.fn(),
    emitSimulationCompleted: vi.fn(),
    emitDCFRecalculated: vi.fn(),
    emitExtractionProgress: vi.fn(),
  }
}

function makeApp(service: SimulationService, ws: SocketHandler): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/simulate", createSimulationRouter(service, ws))
  return app
}

describe("POST /api/simulate/:scenarioId", () => {
  it("runs the simulation and returns aggregated results", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app).post("/api/simulate/s1")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      scenarioId: "s1",
      iterationCount: 3,
      converged: true,
    })
    expect(response.body.impacts).toHaveLength(2)
  })

  it("emits simulation:started before running", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    await request(app).post("/api/simulate/s1")

    expect(ws.emitSimulationStarted).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioId: "s1" }),
    )
  })

  it("emits simulation:step for each propagation iteration", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    await request(app).post("/api/simulate/s1")

    expect(ws.emitSimulationStep).toHaveBeenCalledTimes(2)
    expect(ws.emitSimulationStep).toHaveBeenCalledWith(
      expect.objectContaining({ affectedTicker: "TSM" }),
    )
    expect(ws.emitSimulationStep).toHaveBeenCalledWith(
      expect.objectContaining({ affectedTicker: "AAPL" }),
    )
  })

  it("emits simulation:completed with serialized impacts", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    await request(app).post("/api/simulate/s1")

    expect(ws.emitSimulationCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: "s1",
        converged: true,
        impacts: expect.arrayContaining([
          expect.objectContaining({ ticker: "AAPL" }),
        ]),
      }),
    )
  })

  it("serializes Map impacts to array in REST response", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app).post("/api/simulate/s1")

    // JSON.stringify cannot serialize Maps -- verify the response is an array
    expect(Array.isArray(response.body.impacts)).toBe(true)
    expect(response.body.impacts).toHaveLength(2)
  })
})
