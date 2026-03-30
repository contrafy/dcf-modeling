import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createNeo4jConnection, closeNeo4jConnection } from "./connection.js"
import { upsertCompany } from "./company-repository.js"
import {
  upsertFinancialModel,
  findFinancialModelByTicker,
  deleteFinancialModel,
} from "./financial-repository.js"
import type { Company, FinancialModel, FinancialModelDrivers } from "@dcf-modeling/shared"
import type { Neo4jConnection } from "./connection.js"

const TEST_URI = process.env["NEO4J_URI"] ?? "bolt://localhost:7687"
const TEST_USER = process.env["NEO4J_USER"] ?? "neo4j"
const TEST_PASSWORD = process.env["NEO4J_PASSWORD"] ?? "changeme"

const TEST_TICKER_PREFIX = "TEST_FM_"

function makeCompany(ticker: string): Company {
  return {
    ticker: `${TEST_TICKER_PREFIX}${ticker}`,
    name: `${ticker} Corp`,
    sector: "Technology",
    country: "US",
    marketCap: 1_000_000,
    lastUpdated: "2026-01-01T00:00:00.000Z",
  }
}

function makeDrivers(overrides: Partial<FinancialModelDrivers> = {}): FinancialModelDrivers {
  return {
    revenue: 400_000,
    revenueGrowthRate: 0.08,
    cogsPercent: 0.38,
    sgaPercent: 0.12,
    rdPercent: 0.07,
    daPercent: 0.04,
    interestExpense: 2_500,
    taxRate: 0.21,
    cashAndEquivalents: 180_000,
    accountsReceivable: 40_000,
    inventory: 12_000,
    ppe: 50_000,
    totalDebt: 110_000,
    accountsPayable: 20_000,
    capexPercent: 0.07,
    nwcChange: 5_000,
    wacc: 0.09,
    terminalGrowthRate: 0.025,
    projectionYears: 5,
    sharesOutstanding: 15_700,
    ...overrides,
  }
}

function makeFinancialModel(ticker: string): FinancialModel {
  return {
    companyTicker: `${TEST_TICKER_PREFIX}${ticker}`,
    fiscalYear: 2025,
    drivers: makeDrivers(),
    overrides: {},
  }
}

describe("financial-repository", () => {
  let connection: Neo4jConnection

  beforeAll(async () => {
    connection = createNeo4jConnection({
      uri: TEST_URI,
      user: TEST_USER,
      password: TEST_PASSWORD,
    })
    await connection.verifyConnectivity()

    const session = connection.session()
    await session.run(
      `
      MATCH (c:Company)-[:HAS_MODEL]->(m:FinancialModel)
      WHERE c.ticker STARTS WITH $prefix
      DETACH DELETE m
      `,
      { prefix: TEST_TICKER_PREFIX },
    )
    await session.run(
      `MATCH (c:Company) WHERE c.ticker STARTS WITH $prefix DELETE c`,
      { prefix: TEST_TICKER_PREFIX },
    )
    await session.close()

    await upsertCompany(connection, makeCompany("AAPL"))
    await upsertCompany(connection, makeCompany("NVDA"))
    await upsertCompany(connection, makeCompany("DEL"))
  })

  afterAll(async () => {
    const session = connection.session()
    await session.run(
      `
      MATCH (c:Company)-[:HAS_MODEL]->(m:FinancialModel)
      WHERE c.ticker STARTS WITH $prefix
      DETACH DELETE m
      `,
      { prefix: TEST_TICKER_PREFIX },
    )
    await session.run(
      `MATCH (c:Company) WHERE c.ticker STARTS WITH $prefix DELETE c`,
      { prefix: TEST_TICKER_PREFIX },
    )
    await session.close()
    await closeNeo4jConnection(connection)
  })

  it("upserts a FinancialModel node linked to a Company and retrieves it", async () => {
    const model = makeFinancialModel("AAPL")
    await upsertFinancialModel(connection, model)

    const found = await findFinancialModelByTicker(connection, model.companyTicker)

    expect(found).not.toBeNull()
    expect(found!.companyTicker).toBe(model.companyTicker)
    expect(found!.fiscalYear).toBe(model.fiscalYear)
    expect(found!.drivers.revenue).toBe(model.drivers.revenue)
    expect(found!.drivers.wacc).toBe(model.drivers.wacc)
    expect(found!.overrides).toEqual({})
  })

  it("returns null when no financial model exists for ticker", async () => {
    const found = await findFinancialModelByTicker(connection, "DOES_NOT_EXIST_XYZ")
    expect(found).toBeNull()
  })

  it("updates the financial model on second upsert", async () => {
    const model = makeFinancialModel("NVDA")
    await upsertFinancialModel(connection, model)

    const updated: FinancialModel = {
      ...model,
      drivers: makeDrivers({ revenue: 999_999 }),
      overrides: { revenueGrowthRate: 0.20 },
    }
    await upsertFinancialModel(connection, updated)

    const found = await findFinancialModelByTicker(connection, model.companyTicker)
    expect(found!.drivers.revenue).toBe(999_999)
    expect(found!.overrides.revenueGrowthRate).toBe(0.20)
  })

  it("deletes the FinancialModel node", async () => {
    const model = makeFinancialModel("DEL")
    await upsertFinancialModel(connection, model)
    await deleteFinancialModel(connection, model.companyTicker)

    const found = await findFinancialModelByTicker(connection, model.companyTicker)
    expect(found).toBeNull()
  })
})
