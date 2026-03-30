import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createGraphRouter } from "./graph-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

// Repositories are provided by Phase 4 -- mock the interface here
type GraphRepository = {
  getGraph: () => Promise<{ nodes: unknown[]; edges: unknown[] }>
  addCompany: (data: unknown) => Promise<unknown>
  removeCompany: (ticker: string) => Promise<void>
  addEdge: (data: unknown) => Promise<unknown>
  removeEdge: (id: string) => Promise<void>
  updateEdge: (id: string, data: unknown) => Promise<unknown>
}

function makeRepo(overrides: Partial<GraphRepository> = {}): GraphRepository {
  return {
    getGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    addCompany: vi.fn().mockResolvedValue({ ticker: "AAPL", name: "Apple Inc.", sector: "Tech", country: "US", marketCap: 3_000_000_000_000, lastUpdated: "2026-01-01T00:00:00.000Z" }),
    removeCompany: vi.fn().mockResolvedValue(undefined),
    addEdge: vi.fn().mockResolvedValue({ id: "e1", fromTicker: "TSM", toTicker: "AAPL", revenueWeight: 0.25, productCategory: "Chips", confidence: 0.9, source: "manual", passthrough: 0.7, lastVerified: "2026-01-01T00:00:00.000Z" }),
    removeEdge: vi.fn().mockResolvedValue(undefined),
    updateEdge: vi.fn().mockResolvedValue({ id: "e1", fromTicker: "TSM", toTicker: "AAPL", revenueWeight: 0.30, productCategory: "Chips", confidence: 0.9, source: "manual", passthrough: 0.7, lastVerified: "2026-01-01T00:00:00.000Z" }),
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

function makeApp(repo: GraphRepository, ws: SocketHandler): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/graph", createGraphRouter(repo, ws))
  return app
}

describe("GET /api/graph", () => {
  it("returns the full graph with nodes and edges", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).get("/api/graph")

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ nodes: [], edges: [] })
    expect(repo.getGraph).toHaveBeenCalledOnce()
  })
})

describe("POST /api/graph/companies", () => {
  it("creates a company and returns 201", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .post("/api/graph/companies")
      .send({ ticker: "AAPL", name: "Apple Inc.", sector: "Technology", country: "US", marketCap: 3_000_000_000_000 })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ ticker: "AAPL" })
    expect(repo.addCompany).toHaveBeenCalledOnce()
  })

  it("emits graph:updated after creating a company", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app)
      .post("/api/graph/companies")
      .send({ ticker: "AAPL", name: "Apple Inc.", sector: "Technology", country: "US", marketCap: 3_000_000_000_000 })

    expect(ws.emitGraphUpdated).toHaveBeenCalledOnce()
  })

  it("returns 400 for invalid company data", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .post("/api/graph/companies")
      .send({ ticker: "", name: "" })

    expect(response.status).toBe(400)
    expect(repo.addCompany).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/graph/companies/:ticker", () => {
  it("removes a company and returns 204", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).delete("/api/graph/companies/AAPL")

    expect(response.status).toBe(204)
    expect(repo.removeCompany).toHaveBeenCalledWith("AAPL")
  })

  it("emits graph:updated after removing a company", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app).delete("/api/graph/companies/AAPL")

    expect(ws.emitGraphUpdated).toHaveBeenCalledOnce()
  })
})

describe("POST /api/graph/edges", () => {
  it("creates an edge and returns 201", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .post("/api/graph/edges")
      .send({
        fromTicker: "TSM",
        toTicker: "AAPL",
        revenueWeight: 0.25,
        productCategory: "Advanced Logic Chips",
        confidence: 0.9,
        source: "manual",
      })

    expect(response.status).toBe(201)
    expect(repo.addEdge).toHaveBeenCalledOnce()
  })

  it("emits graph:updated after creating an edge", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app)
      .post("/api/graph/edges")
      .send({
        fromTicker: "TSM",
        toTicker: "AAPL",
        revenueWeight: 0.25,
        productCategory: "Advanced Logic Chips",
        confidence: 0.9,
        source: "manual",
      })

    expect(ws.emitGraphUpdated).toHaveBeenCalledOnce()
  })

  it("returns 400 when revenueWeight is outside 0-1 range", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .post("/api/graph/edges")
      .send({
        fromTicker: "TSM",
        toTicker: "AAPL",
        revenueWeight: 1.5,
        productCategory: "Chips",
        confidence: 0.9,
        source: "manual",
      })

    expect(response.status).toBe(400)
    expect(repo.addEdge).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/graph/edges/:id", () => {
  it("removes an edge and returns 204", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).delete("/api/graph/edges/e1")

    expect(response.status).toBe(204)
    expect(repo.removeEdge).toHaveBeenCalledWith("e1")
  })

  it("emits graph:updated after removing an edge", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app).delete("/api/graph/edges/e1")

    expect(ws.emitGraphUpdated).toHaveBeenCalledOnce()
  })
})

describe("PATCH /api/graph/edges/:id", () => {
  it("updates edge metadata and returns the updated edge", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .patch("/api/graph/edges/e1")
      .send({ revenueWeight: 0.30 })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ id: "e1", revenueWeight: 0.30 })
    expect(repo.updateEdge).toHaveBeenCalledWith("e1", { revenueWeight: 0.30 })
  })

  it("emits edge:updated after patching an edge", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app)
      .patch("/api/graph/edges/e1")
      .send({ revenueWeight: 0.30 })

    expect(ws.emitEdgeUpdated).toHaveBeenCalledWith("e1", expect.any(Object))
  })

  it("returns 400 for invalid patch body", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .patch("/api/graph/edges/e1")
      .send({ revenueWeight: -0.5 })

    expect(response.status).toBe(400)
    expect(repo.updateEdge).not.toHaveBeenCalled()
  })
})
