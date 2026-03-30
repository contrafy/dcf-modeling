import { describe, it, expect } from "vitest"
import { matchAffectedEdges } from "./policy-matcher.js"
import type { SupplyEdge, TariffPolicy, CompanyNode } from "@tori/shared"
import { createGraph, addNode, addEdge } from "./graph.js"

function makeNode(ticker: string, country: string): CompanyNode {
  return {
    company: {
      ticker, name: `${ticker} Inc.`, sector: "Semiconductors", country,
      marketCap: 1_000_000, lastUpdated: "2026-01-01T00:00:00Z",
    },
    financialModel: {
      companyTicker: ticker, fiscalYear: 2025,
      drivers: {
        revenue: 100_000, revenueGrowthRate: 0.10, cogsPercent: 0.40,
        sgaPercent: 0.15, rdPercent: 0.10, daPercent: 0.05,
        interestExpense: 1_000, taxRate: 0.21, cashAndEquivalents: 50_000,
        accountsReceivable: 10_000, inventory: 8_000, ppe: 30_000,
        totalDebt: 20_000, accountsPayable: 7_000, capexPercent: 0.08,
        nwcChange: 2_000, wacc: 0.10, terminalGrowthRate: 0.03,
        projectionYears: 5, sharesOutstanding: 1_000,
      },
      overrides: {},
    },
    computedDCF: null,
  }
}

function makeEdge(from: string, to: string, productCategory: string, id?: string): SupplyEdge {
  return {
    id: id ?? `${from}->${to}`, fromTicker: from, toTicker: to,
    revenueWeight: 0.25, productCategory, confidence: 0.9,
    source: "manual", passthrough: 0.7, lastVerified: "2026-01-01T00:00:00Z",
  }
}

function makePolicy(overrides: Partial<TariffPolicy> = {}): TariffPolicy {
  return {
    id: "p1", scenarioId: "s1", name: "Test tariff", tariffPercent: 0.25,
    targetCountry: "Taiwan", targetSector: null, targetProduct: null,
    affectedEdgeIds: [], ...overrides,
  }
}

describe("matchAffectedEdges", () => {
  it("matches edges where supplier country matches targetCountry", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("TSM", "Taiwan"))
    graph = addNode(graph, makeNode("AAPL", "US"))
    graph = addNode(graph, makeNode("AVGO", "US"))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", "Chips", "e1"))
    graph = addEdge(graph, makeEdge("AVGO", "AAPL", "Chips", "e2"))
    const policy = makePolicy({ targetCountry: "Taiwan" })
    const matched = matchAffectedEdges(graph, policy)
    expect(matched).toHaveLength(1)
    expect(matched[0]!.id).toBe("e1")
  })

  it("filters by targetProduct when specified", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("TSM", "Taiwan"))
    graph = addNode(graph, makeNode("AAPL", "US"))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", "Advanced Logic Chips", "e1"))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", "Packaging", "e2"))
    const policy = makePolicy({ targetCountry: "Taiwan", targetProduct: "Advanced Logic Chips" })
    const matched = matchAffectedEdges(graph, policy)
    expect(matched).toHaveLength(1)
    expect(matched[0]!.id).toBe("e1")
  })

  it("filters by targetSector when specified", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("TSM", "Taiwan"))
    graph = addNode(graph, makeNode("AAPL", "US"))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", "Chips", "e1"))
    const policy = makePolicy({ targetCountry: "Taiwan", targetSector: "Automotive" })
    const matched = matchAffectedEdges(graph, policy)
    expect(matched).toHaveLength(0)
  })

  it("returns all edges from target country when no sector or product filter", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("TSM", "Taiwan"))
    graph = addNode(graph, makeNode("UMC", "Taiwan"))
    graph = addNode(graph, makeNode("AAPL", "US"))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", "Chips", "e1"))
    graph = addEdge(graph, makeEdge("UMC", "AAPL", "Chips", "e2"))
    const policy = makePolicy({ targetCountry: "Taiwan" })
    const matched = matchAffectedEdges(graph, policy)
    expect(matched).toHaveLength(2)
  })

  it("uses manual affectedEdgeIds override when populated", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("TSM", "Taiwan"))
    graph = addNode(graph, makeNode("UMC", "Taiwan"))
    graph = addNode(graph, makeNode("AAPL", "US"))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", "Chips", "e1"))
    graph = addEdge(graph, makeEdge("UMC", "AAPL", "Chips", "e2"))
    const policy = makePolicy({ targetCountry: "Taiwan", affectedEdgeIds: ["e1"] })
    const matched = matchAffectedEdges(graph, policy)
    expect(matched).toHaveLength(1)
    expect(matched[0]!.id).toBe("e1")
  })
})
