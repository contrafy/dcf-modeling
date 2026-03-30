import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createExtractionRouter } from "./extraction-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

type ExtractedRelationship = {
  name: string
  ticker: string
  relationship: string
  productCategory: string
  estimatedRevenueWeight: number
  confidence: number
  source: string
}

type ExtractionResult = {
  company: string
  ticker: string
  suppliers: ExtractedRelationship[]
  customers: ExtractedRelationship[]
  extractionId: string
}

type ExtractionService = {
  extractSupplyChain: (
    ticker: string,
    onProgress: (status: string, message: string) => void,
  ) => Promise<ExtractionResult>
  approveExtraction: (extractionId: string, approvedIds: string[]) => Promise<void>
}

function makeExtractionResult(): ExtractionResult {
  return {
    company: "Apple Inc.",
    ticker: "AAPL",
    extractionId: "ext-123",
    suppliers: [
      {
        name: "Taiwan Semiconductor Manufacturing",
        ticker: "TSM",
        relationship: "Primary foundry for A-series chips",
        productCategory: "Advanced Logic Chips",
        estimatedRevenueWeight: 0.25,
        confidence: 0.92,
        source: "10-K FY2025",
      },
    ],
    customers: [],
  }
}

function makeService(overrides: Partial<ExtractionService> = {}): ExtractionService {
  return {
    extractSupplyChain: vi.fn().mockImplementation(
      async (ticker: string, onProgress: (status: string, message: string) => void) => {
        onProgress("fetching", `Fetching 10-K for ${ticker}`)
        onProgress("extracting", "Sending to LLM for extraction")
        onProgress("done", "Extraction complete")
        return makeExtractionResult()
      },
    ),
    approveExtraction: vi.fn().mockResolvedValue(undefined),
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

function makeApp(service: ExtractionService, ws: SocketHandler): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/extract", createExtractionRouter(service, ws))
  return app
}

describe("POST /api/extract/supply-chain", () => {
  it("extracts supply chain relationships and returns them", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app)
      .post("/api/extract/supply-chain")
      .send({ ticker: "AAPL" })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      ticker: "AAPL",
      extractionId: "ext-123",
      suppliers: expect.arrayContaining([
        expect.objectContaining({ ticker: "TSM" }),
      ]),
    })
    expect(service.extractSupplyChain).toHaveBeenCalledWith("AAPL", expect.any(Function))
  })

  it("emits extraction:progress events during extraction", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    await request(app)
      .post("/api/extract/supply-chain")
      .send({ ticker: "AAPL" })

    expect(ws.emitExtractionProgress).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "AAPL", status: "fetching" }),
    )
    expect(ws.emitExtractionProgress).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "AAPL", status: "done" }),
    )
  })

  it("returns 400 when ticker is missing from request body", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app)
      .post("/api/extract/supply-chain")
      .send({})

    expect(response.status).toBe(400)
    expect(service.extractSupplyChain).not.toHaveBeenCalled()
  })

  it("returns 400 when ticker is an empty string", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app)
      .post("/api/extract/supply-chain")
      .send({ ticker: "" })

    expect(response.status).toBe(400)
  })
})

describe("POST /api/extract/approve", () => {
  it("approves extracted relationships and returns 204", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app)
      .post("/api/extract/approve")
      .send({ extractionId: "ext-123", approvedIds: ["TSM", "AVGO"] })

    expect(response.status).toBe(204)
    expect(service.approveExtraction).toHaveBeenCalledWith("ext-123", ["TSM", "AVGO"])
  })

  it("emits graph:updated after approving relationships", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    await request(app)
      .post("/api/extract/approve")
      .send({ extractionId: "ext-123", approvedIds: ["TSM"] })

    expect(ws.emitGraphUpdated).toHaveBeenCalledOnce()
  })

  it("returns 400 when extractionId is missing", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app)
      .post("/api/extract/approve")
      .send({ approvedIds: ["TSM"] })

    expect(response.status).toBe(400)
    expect(service.approveExtraction).not.toHaveBeenCalled()
  })
})
