import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createDataRouter } from "./data-router.js"

type FetchedFinancials = {
  ticker: string
  source: string
  revenue: number
  fiscalYear: number
}

type DataAdapterOrchestrator = {
  fetchAndStore: (ticker: string) => Promise<FetchedFinancials>
}

function makeOrchestrator(overrides: Partial<DataAdapterOrchestrator> = {}): DataAdapterOrchestrator {
  return {
    fetchAndStore: vi.fn().mockResolvedValue({
      ticker: "AAPL",
      source: "fmp",
      revenue: 400_000_000_000,
      fiscalYear: 2025,
    }),
    ...overrides,
  }
}

function makeApp(orchestrator: DataAdapterOrchestrator): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/data", createDataRouter(orchestrator))
  return app
}

describe("POST /api/data/fetch/:ticker", () => {
  it("fetches financial data and returns the result", async () => {
    const orchestrator = makeOrchestrator()
    const app = makeApp(orchestrator)

    const response = await request(app).post("/api/data/fetch/AAPL")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ ticker: "AAPL", source: "fmp" })
    expect(orchestrator.fetchAndStore).toHaveBeenCalledWith("AAPL")
  })

  it("passes the ticker from URL params to the orchestrator", async () => {
    const orchestrator = makeOrchestrator()
    const app = makeApp(orchestrator)

    await request(app).post("/api/data/fetch/NVDA")

    expect(orchestrator.fetchAndStore).toHaveBeenCalledWith("NVDA")
  })

  it("returns 500 when the adapter fails", async () => {
    const orchestrator = makeOrchestrator({
      fetchAndStore: vi.fn().mockRejectedValue(new Error("FMP rate limit exceeded")),
    })
    const app = makeApp(orchestrator)

    const response = await request(app).post("/api/data/fetch/AAPL")

    expect(response.status).toBe(500)
    expect(response.body).toMatchObject({ error: expect.stringContaining("Failed to fetch") })
  })
})
