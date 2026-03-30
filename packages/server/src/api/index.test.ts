import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createApiRouter } from "./index.js"
import type { GraphRepository } from "./graph-router.js"
import type { FinancialRepository } from "./financial-router.js"
import type { ScenarioRepository } from "./scenario-router.js"
import type { SimulationService } from "./simulation-router.js"
import type { ExtractionService } from "./extraction-router.js"
import type { DataAdapterOrchestrator } from "./data-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

function makeGraphRepo(): GraphRepository {
  return {
    getGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    addCompany: vi.fn().mockResolvedValue({}),
    removeCompany: vi.fn().mockResolvedValue(undefined),
    addEdge: vi.fn().mockResolvedValue({}),
    removeEdge: vi.fn().mockResolvedValue(undefined),
    updateEdge: vi.fn().mockResolvedValue({}),
  }
}

function makeFinancialRepo(): FinancialRepository {
  return {
    getFinancials: vi.fn().mockResolvedValue(null),
    updateFinancials: vi.fn().mockResolvedValue({}),
    recalculateDCF: vi.fn().mockResolvedValue({}),
  }
}

function makeScenarioRepo(): ScenarioRepository {
  return {
    listScenarios: vi.fn().mockResolvedValue([]),
    createScenario: vi.fn().mockResolvedValue({}),
    getScenario: vi.fn().mockResolvedValue(null),
    addPolicy: vi.fn().mockResolvedValue({}),
    removePolicy: vi.fn().mockResolvedValue(undefined),
  }
}

function makeSimService(): SimulationService {
  return {
    runSimulation: vi.fn().mockResolvedValue({
      scenarioId: "s1",
      impacts: new Map(),
      iterationCount: 0,
      converged: true,
    }),
  }
}

function makeExtractionService(): ExtractionService {
  return {
    extractSupplyChain: vi.fn().mockResolvedValue({}),
    approveExtraction: vi.fn().mockResolvedValue(undefined),
  }
}

function makeDataOrchestrator(): DataAdapterOrchestrator {
  return {
    fetchAndStore: vi.fn().mockResolvedValue({}),
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

function makeApp(): Express {
  const app = express()
  app.use(express.json())
  app.use(
    "/api",
    createApiRouter({
      graphRepo: makeGraphRepo(),
      financialRepo: makeFinancialRepo(),
      scenarioRepo: makeScenarioRepo(),
      simulationService: makeSimService(),
      extractionService: makeExtractionService(),
      dataOrchestrator: makeDataOrchestrator(),
      socketHandler: makeSocketHandler(),
    }),
  )
  return app
}

describe("API router mounting", () => {
  it("mounts health endpoint", async () => {
    const app = makeApp()
    const response = await request(app).get("/api/health")
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: "ok" })
  })

  it("mounts graph endpoints under /api/graph", async () => {
    const app = makeApp()
    const response = await request(app).get("/api/graph")
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ nodes: [], edges: [] })
  })

  it("mounts scenario endpoints under /api/scenarios", async () => {
    const app = makeApp()
    const response = await request(app).get("/api/scenarios")
    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it("mounts financial endpoints under /api/companies", async () => {
    const app = makeApp()
    const response = await request(app).get("/api/companies/AAPL/financials")
    // 404 is expected because mock returns null -- confirms mount is correct
    expect(response.status).toBe(404)
  })

  it("mounts simulation endpoint under /api/simulate", async () => {
    const app = makeApp()
    const response = await request(app).post("/api/simulate/s1")
    expect(response.status).toBe(200)
  })
})
