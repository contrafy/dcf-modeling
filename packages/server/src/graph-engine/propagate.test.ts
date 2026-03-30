import { describe, it, expect } from "vitest"
import { propagateShock } from "./propagate.js"
import { createGraph, addNode, addEdge } from "./graph.js"
import type { CompanyNode, SupplyEdge, TariffPolicy, FinancialModelDrivers } from "@dcf-modeling/shared"

function makeDrivers(overrides: Partial<FinancialModelDrivers> = {}): FinancialModelDrivers {
  return {
    revenue: 100_000, revenueGrowthRate: 0.10, cogsPercent: 0.40,
    sgaPercent: 0.15, rdPercent: 0.10, daPercent: 0.05,
    interestExpense: 1_000, taxRate: 0.21, cashAndEquivalents: 50_000,
    accountsReceivable: 10_000, inventory: 8_000, ppe: 30_000,
    totalDebt: 20_000, accountsPayable: 7_000, capexPercent: 0.08,
    nwcChange: 2_000, wacc: 0.10, terminalGrowthRate: 0.03,
    projectionYears: 5, sharesOutstanding: 1_000, ...overrides,
  }
}

function makeNode(ticker: string, country: string, revenue: number): CompanyNode {
  return {
    company: {
      ticker, name: `${ticker} Inc.`, sector: "Semiconductors", country,
      marketCap: 1_000_000, lastUpdated: "2026-01-01T00:00:00Z",
    },
    financialModel: {
      companyTicker: ticker, fiscalYear: 2025,
      drivers: makeDrivers({ revenue }),
      overrides: {},
    },
    computedDCF: null,
  }
}

function makeEdge(from: string, to: string, revenueWeight: number, passthrough: number = 0.7): SupplyEdge {
  return {
    id: `${from}->${to}`, fromTicker: from, toTicker: to,
    revenueWeight, productCategory: "Chips", confidence: 0.9,
    source: "manual", passthrough, lastVerified: "2026-01-01T00:00:00Z",
  }
}

function makePolicy(overrides: Partial<TariffPolicy> = {}): TariffPolicy {
  return {
    id: "p1", scenarioId: "s1", name: "25% Taiwan tariff",
    tariffPercent: 0.25, targetCountry: "Taiwan", targetSector: null,
    targetProduct: null, affectedEdgeIds: [], ...overrides,
  }
}

describe("propagateShock", () => {
  it("computes valuation delta for directly affected companies", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("TSM", "Taiwan", 200_000))
    graph = addNode(graph, makeNode("AAPL", "US", 400_000))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", 0.30))
    const policy = makePolicy({ tariffPercent: 0.25, targetCountry: "Taiwan" })
    const result = propagateShock(graph, [policy])
    const tsmImpact = result.impacts.get("TSM")
    expect(tsmImpact).toBeDefined()
    expect(tsmImpact!.percentChange).toBeLessThan(0)
    const aaplImpact = result.impacts.get("AAPL")
    expect(aaplImpact).toBeDefined()
  })

  it("propagates shock upstream through supply chain", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("ASML", "Netherlands", 100_000))
    graph = addNode(graph, makeNode("TSM", "Taiwan", 200_000))
    graph = addNode(graph, makeNode("AAPL", "US", 400_000))
    graph = addEdge(graph, makeEdge("ASML", "TSM", 0.20))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", 0.30))
    const policy = makePolicy({ tariffPercent: 0.25, targetCountry: "Taiwan" })
    const result = propagateShock(graph, [policy])
    const tsmImpact = result.impacts.get("TSM")!
    expect(tsmImpact.delta).toBeLessThan(0)
    const asmlImpact = result.impacts.get("ASML")
    expect(asmlImpact).toBeDefined()
  })

  it("converges and reports convergence status", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("TSM", "Taiwan", 200_000))
    graph = addNode(graph, makeNode("AAPL", "US", 400_000))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", 0.30))
    const policy = makePolicy()
    const result = propagateShock(graph, [policy])
    expect(result.converged).toBe(true)
    expect(result.iterationCount).toBeGreaterThan(0)
  })

  it("handles cyclic supply chains without infinite loops", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("A", "Taiwan", 100_000))
    graph = addNode(graph, makeNode("B", "Taiwan", 100_000))
    graph = addNode(graph, makeNode("C", "US", 100_000))
    graph = addEdge(graph, makeEdge("A", "B", 0.30))
    graph = addEdge(graph, makeEdge("B", "C", 0.20))
    graph = addEdge(graph, makeEdge("C", "A", 0.10))
    const policy = makePolicy({ targetCountry: "Taiwan" })
    const result = propagateShock(graph, [policy])
    expect(result.converged).toBe(true)
    expect(result.iterationCount).toBeLessThanOrEqual(50)
  })

  it("composes multiple tariff policies in one scenario", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("TSM", "Taiwan", 200_000))
    graph = addNode(graph, makeNode("SMIC", "China", 80_000))
    graph = addNode(graph, makeNode("AAPL", "US", 400_000))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", 0.30))
    graph = addEdge(graph, makeEdge("SMIC", "AAPL", 0.10))
    const policies = [
      makePolicy({ id: "p1", tariffPercent: 0.25, targetCountry: "Taiwan" }),
      makePolicy({ id: "p2", tariffPercent: 0.35, targetCountry: "China" }),
    ]
    const result = propagateShock(graph, policies)
    const tsmImpact = result.impacts.get("TSM")!
    const smicImpact = result.impacts.get("SMIC")!
    expect(tsmImpact.delta).toBeLessThan(0)
    expect(smicImpact.delta).toBeLessThan(0)
  })

  it("returns zero delta for unaffected nodes", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("TSM", "Taiwan", 200_000))
    graph = addNode(graph, makeNode("AAPL", "US", 400_000))
    graph = addNode(graph, makeNode("MSFT", "US", 500_000))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", 0.30))
    const policy = makePolicy({ targetCountry: "Taiwan" })
    const result = propagateShock(graph, [policy])
    const msftImpact = result.impacts.get("MSFT")!
    expect(msftImpact.delta).toBe(0)
    expect(msftImpact.percentChange).toBe(0)
  })

  it("passthrough of 0 means supplier absorbs all cost", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("TSM", "Taiwan", 200_000))
    graph = addNode(graph, makeNode("AAPL", "US", 400_000))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", 0.30, 0.0))
    const policy = makePolicy({ targetCountry: "Taiwan" })
    const result = propagateShock(graph, [policy])
    const tsmImpact = result.impacts.get("TSM")!
    expect(tsmImpact.delta).toBeLessThan(0)
    const aaplImpact = result.impacts.get("AAPL")!
    expect(aaplImpact.delta).toBe(0)
  })
})
