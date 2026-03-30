import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createFinancialRouter } from "./financial-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"
import type { FinancialModel, DCFResult } from "@tori/shared"

type FinancialRepository = {
  getFinancials: (ticker: string) => Promise<FinancialModel | null>
  updateFinancials: (ticker: string, data: unknown) => Promise<FinancialModel>
  recalculateDCF: (ticker: string) => Promise<DCFResult>
}

function makeDrivers() {
  return {
    revenue: 400_000_000_000,
    revenueGrowthRate: 0.08,
    cogsPercent: 0.56,
    sgaPercent: 0.06,
    rdPercent: 0.07,
    daPercent: 0.04,
    interestExpense: 3_900_000_000,
    taxRate: 0.15,
    cashAndEquivalents: 165_000_000_000,
    accountsReceivable: 51_000_000_000,
    inventory: 7_000_000_000,
    ppe: 43_000_000_000,
    totalDebt: 104_000_000_000,
    accountsPayable: 62_000_000_000,
    capexPercent: 0.03,
    nwcChange: 2_000_000_000,
    wacc: 0.09,
    terminalGrowthRate: 0.03,
    projectionYears: 5,
    sharesOutstanding: 15_200_000_000,
  }
}

function makeModel(ticker: string): FinancialModel {
  return {
    companyTicker: ticker,
    fiscalYear: 2025,
    drivers: makeDrivers(),
    overrides: {},
  }
}

function makeDCFResult(): DCFResult {
  return {
    projectedFCFs: [80_000_000_000, 86_000_000_000, 92_000_000_000, 99_000_000_000, 107_000_000_000],
    terminalValue: 1_800_000_000_000,
    discountedFCFs: [73_000_000_000, 71_000_000_000, 69_000_000_000, 67_000_000_000, 65_000_000_000],
    discountedTerminalValue: 1_100_000_000_000,
    enterpriseValue: 1_445_000_000_000,
    netDebt: -61_000_000_000,
    equityValue: 1_506_000_000_000,
    perShareValue: 99.08,
    threeStatements: [],
  }
}

function makeRepo(overrides: Partial<FinancialRepository> = {}): FinancialRepository {
  return {
    getFinancials: vi.fn().mockResolvedValue(makeModel("AAPL")),
    updateFinancials: vi.fn().mockResolvedValue(makeModel("AAPL")),
    recalculateDCF: vi.fn().mockResolvedValue(makeDCFResult()),
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

function makeApp(repo: FinancialRepository, ws: SocketHandler): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/companies", createFinancialRouter(repo, ws))
  return app
}

describe("GET /api/companies/:ticker/financials", () => {
  it("returns the financial model for a known ticker", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).get("/api/companies/AAPL/financials")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ companyTicker: "AAPL" })
    expect(repo.getFinancials).toHaveBeenCalledWith("AAPL")
  })

  it("returns 404 when ticker has no financial model", async () => {
    const repo = makeRepo({ getFinancials: vi.fn().mockResolvedValue(null) })
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).get("/api/companies/UNKNOWN/financials")

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ error: expect.stringContaining("not found") })
  })
})

describe("PUT /api/companies/:ticker/financials", () => {
  it("updates drivers and returns the updated model", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .put("/api/companies/AAPL/financials")
      .send({ drivers: { wacc: 0.10 } })

    expect(response.status).toBe(200)
    expect(repo.updateFinancials).toHaveBeenCalledWith("AAPL", { drivers: { wacc: 0.10 } })
  })

  it("emits node:updated after updating financials", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app)
      .put("/api/companies/AAPL/financials")
      .send({ overrides: { wacc: 0.10 } })

    expect(ws.emitNodeUpdated).toHaveBeenCalledWith("AAPL", expect.any(Object))
  })

  it("returns 400 for invalid driver values", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .put("/api/companies/AAPL/financials")
      .send({ drivers: { wacc: -1 } })

    expect(response.status).toBe(400)
    expect(repo.updateFinancials).not.toHaveBeenCalled()
  })
})

describe("POST /api/companies/:ticker/dcf", () => {
  it("triggers DCF recalculation and returns the result", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).post("/api/companies/AAPL/dcf")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ equityValue: expect.any(Number) })
    expect(repo.recalculateDCF).toHaveBeenCalledWith("AAPL")
  })

  it("emits dcf:recalculated after computation", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app).post("/api/companies/AAPL/dcf")

    expect(ws.emitDCFRecalculated).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "AAPL" }),
    )
  })
})
