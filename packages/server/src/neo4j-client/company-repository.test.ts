import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createNeo4jConnection, closeNeo4jConnection } from "./connection.js"
import {
  upsertCompany,
  findCompanyByTicker,
  deleteCompany,
  listAllCompanies,
} from "./company-repository.js"
import type { Company } from "@dcf-modeling/shared"
import type { Neo4jConnection } from "./connection.js"

const TEST_URI = process.env["NEO4J_URI"] ?? "bolt://localhost:7687"
const TEST_USER = process.env["NEO4J_USER"] ?? "neo4j"
const TEST_PASSWORD = process.env["NEO4J_PASSWORD"] ?? "changeme"

const TEST_TICKER_PREFIX = "TEST_CO_"

function makeCompany(ticker: string): Company {
  return {
    ticker: `${TEST_TICKER_PREFIX}${ticker}`,
    name: `${ticker} Inc.`,
    sector: "Technology",
    country: "US",
    marketCap: 1_000_000,
    lastUpdated: "2026-01-01T00:00:00.000Z",
  }
}

describe("company-repository", () => {
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
      `MATCH (c:Company) WHERE c.ticker STARTS WITH $prefix DELETE c`,
      { prefix: TEST_TICKER_PREFIX },
    )
    await session.close()
  })

  afterAll(async () => {
    const session = connection.session()
    await session.run(
      `MATCH (c:Company) WHERE c.ticker STARTS WITH $prefix DELETE c`,
      { prefix: TEST_TICKER_PREFIX },
    )
    await session.close()
    await closeNeo4jConnection(connection)
  })

  it("upserts a company node and retrieves it by ticker", async () => {
    const company = makeCompany("AAPL")
    await upsertCompany(connection, company)

    const found = await findCompanyByTicker(connection, company.ticker)

    expect(found).not.toBeNull()
    expect(found!.ticker).toBe(company.ticker)
    expect(found!.name).toBe(company.name)
    expect(found!.sector).toBe(company.sector)
    expect(found!.country).toBe(company.country)
    expect(found!.marketCap).toBe(company.marketCap)
  })

  it("returns null when company does not exist", async () => {
    const found = await findCompanyByTicker(connection, "DOES_NOT_EXIST_XYZ")
    expect(found).toBeNull()
  })

  it("updates an existing company on second upsert", async () => {
    const original = makeCompany("TSM")
    await upsertCompany(connection, original)

    const updated: Company = { ...original, marketCap: 9_999_999 }
    await upsertCompany(connection, updated)

    const found = await findCompanyByTicker(connection, original.ticker)
    expect(found!.marketCap).toBe(9_999_999)
  })

  it("lists all companies", async () => {
    await upsertCompany(connection, makeCompany("NVDA"))
    await upsertCompany(connection, makeCompany("MSFT"))

    const all = await listAllCompanies(connection)
    const tickers = all.map((c) => c.ticker)

    expect(tickers).toContain(`${TEST_TICKER_PREFIX}NVDA`)
    expect(tickers).toContain(`${TEST_TICKER_PREFIX}MSFT`)
  })

  it("deletes a company node", async () => {
    const company = makeCompany("DEL")
    await upsertCompany(connection, company)
    await deleteCompany(connection, company.ticker)

    const found = await findCompanyByTicker(connection, company.ticker)
    expect(found).toBeNull()
  })
})
