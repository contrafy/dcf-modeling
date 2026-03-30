import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createNeo4jConnection, closeNeo4jConnection } from "./connection.js"
import { upsertCompany } from "./company-repository.js"
import {
  upsertEdge,
  findEdgeById,
  listEdgesForSupplier,
  listEdgesForCustomer,
  updateEdge,
  deleteEdge,
  listAllEdges,
} from "./edge-repository.js"
import type { Company, SupplyEdge } from "@tori/shared"
import type { Neo4jConnection } from "./connection.js"

const TEST_URI = process.env["NEO4J_URI"] ?? "bolt://localhost:7687"
const TEST_USER = process.env["NEO4J_USER"] ?? "neo4j"
const TEST_PASSWORD = process.env["NEO4J_PASSWORD"] ?? "changeme"

const TEST_TICKER_PREFIX = "TEST_EDGE_"
const TEST_EDGE_PREFIX = "test-edge-"

function makeCompany(ticker: string): Company {
  return {
    ticker: `${TEST_TICKER_PREFIX}${ticker}`,
    name: `${ticker} Corp`,
    sector: "Semiconductors",
    country: "US",
    marketCap: 500_000,
    lastUpdated: "2026-01-01T00:00:00.000Z",
  }
}

function makeEdge(
  from: string,
  to: string,
  id?: string,
): SupplyEdge {
  return {
    id: id ?? `${TEST_EDGE_PREFIX}${from}-${to}`,
    fromTicker: `${TEST_TICKER_PREFIX}${from}`,
    toTicker: `${TEST_TICKER_PREFIX}${to}`,
    revenueWeight: 0.25,
    productCategory: "Advanced Logic Chips",
    confidence: 0.92,
    source: "manual",
    passthrough: 0.7,
    lastVerified: "2026-01-01T00:00:00.000Z",
  }
}

describe("edge-repository", () => {
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
      `MATCH ()-[r:SUPPLIES_TO]->() WHERE r.id STARTS WITH $prefix DELETE r`,
      { prefix: TEST_EDGE_PREFIX },
    )
    await session.run(
      `MATCH (c:Company) WHERE c.ticker STARTS WITH $prefix DELETE c`,
      { prefix: TEST_TICKER_PREFIX },
    )
    await session.close()

    await upsertCompany(connection, makeCompany("TSM"))
    await upsertCompany(connection, makeCompany("AAPL"))
    await upsertCompany(connection, makeCompany("NVDA"))
    await upsertCompany(connection, makeCompany("AVGO"))
  })

  afterAll(async () => {
    const session = connection.session()
    await session.run(
      `MATCH ()-[r:SUPPLIES_TO]->() WHERE r.id STARTS WITH $prefix DELETE r`,
      { prefix: TEST_EDGE_PREFIX },
    )
    await session.run(
      `MATCH (c:Company) WHERE c.ticker STARTS WITH $prefix DELETE c`,
      { prefix: TEST_TICKER_PREFIX },
    )
    await session.close()
    await closeNeo4jConnection(connection)
  })

  it("upserts a SUPPLIES_TO relationship and retrieves it by id", async () => {
    const edge = makeEdge("TSM", "AAPL")
    await upsertEdge(connection, edge)

    const found = await findEdgeById(connection, edge.id)

    expect(found).not.toBeNull()
    expect(found!.id).toBe(edge.id)
    expect(found!.fromTicker).toBe(edge.fromTicker)
    expect(found!.toTicker).toBe(edge.toTicker)
    expect(found!.revenueWeight).toBe(edge.revenueWeight)
    expect(found!.productCategory).toBe(edge.productCategory)
    expect(found!.passthrough).toBe(edge.passthrough)
  })

  it("returns null when edge does not exist", async () => {
    const found = await findEdgeById(connection, "does-not-exist-xyz")
    expect(found).toBeNull()
  })

  it("updates edge properties on second upsert", async () => {
    const edge = makeEdge("TSM", "NVDA", `${TEST_EDGE_PREFIX}tsm-nvda-update`)
    await upsertEdge(connection, edge)

    const updated: SupplyEdge = { ...edge, revenueWeight: 0.45, confidence: 0.99 }
    await upsertEdge(connection, updated)

    const found = await findEdgeById(connection, edge.id)
    expect(found!.revenueWeight).toBe(0.45)
    expect(found!.confidence).toBe(0.99)
  })

  it("updates a subset of edge properties via updateEdge", async () => {
    const edge = makeEdge("AVGO", "AAPL", `${TEST_EDGE_PREFIX}avgo-aapl`)
    await upsertEdge(connection, edge)

    await updateEdge(connection, edge.id, { revenueWeight: 0.10 })

    const found = await findEdgeById(connection, edge.id)
    expect(found!.revenueWeight).toBe(0.10)
    expect(found!.productCategory).toBe(edge.productCategory)
  })

  it("lists all edges from a specific supplier", async () => {
    const edge1 = makeEdge("TSM", "AAPL", `${TEST_EDGE_PREFIX}tsm-aapl-list`)
    const edge2 = makeEdge("TSM", "NVDA", `${TEST_EDGE_PREFIX}tsm-nvda-list`)
    await upsertEdge(connection, edge1)
    await upsertEdge(connection, edge2)

    const edges = await listEdgesForSupplier(connection, `${TEST_TICKER_PREFIX}TSM`)
    const ids = edges.map((e) => e.id)

    expect(ids).toContain(edge1.id)
    expect(ids).toContain(edge2.id)
  })

  it("lists all edges to a specific customer", async () => {
    const edge1 = makeEdge("TSM", "AAPL", `${TEST_EDGE_PREFIX}tsm-aapl-cust`)
    const edge2 = makeEdge("AVGO", "AAPL", `${TEST_EDGE_PREFIX}avgo-aapl-cust`)
    await upsertEdge(connection, edge1)
    await upsertEdge(connection, edge2)

    const edges = await listEdgesForCustomer(connection, `${TEST_TICKER_PREFIX}AAPL`)
    const ids = edges.map((e) => e.id)

    expect(ids).toContain(edge1.id)
    expect(ids).toContain(edge2.id)
  })

  it("deletes an edge by id", async () => {
    const edge = makeEdge("AVGO", "NVDA", `${TEST_EDGE_PREFIX}avgo-nvda-del`)
    await upsertEdge(connection, edge)
    await deleteEdge(connection, edge.id)

    const found = await findEdgeById(connection, edge.id)
    expect(found).toBeNull()
  })

  it("lists all edges in the graph", async () => {
    const edge = makeEdge("TSM", "AVGO", `${TEST_EDGE_PREFIX}tsm-avgo-all`)
    await upsertEdge(connection, edge)

    const all = await listAllEdges(connection)
    const ids = all.map((e) => e.id)

    expect(ids).toContain(edge.id)
  })
})
