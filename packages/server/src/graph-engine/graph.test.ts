import { describe, it, expect } from "vitest"
import { createGraph, addNode, addEdge, removeNode, removeEdge, getNeighbors } from "./graph.js"
import type { CompanyNode, SupplyEdge } from "@dcf-modeling/shared"

function makeNode(ticker: string): CompanyNode {
  return {
    company: {
      ticker, name: `${ticker} Inc.`, sector: "Technology", country: "US",
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

function makeEdge(from: string, to: string, id?: string): SupplyEdge {
  return {
    id: id ?? `${from}->${to}`, fromTicker: from, toTicker: to,
    revenueWeight: 0.25, productCategory: "Chips", confidence: 0.9,
    source: "manual", passthrough: 0.7, lastVerified: "2026-01-01T00:00:00Z",
  }
}

describe("graph construction", () => {
  it("creates an empty graph", () => {
    const graph = createGraph()
    expect(graph.nodes.size).toBe(0)
    expect(graph.edges).toHaveLength(0)
  })

  it("adds a node to the graph", () => {
    const graph = createGraph()
    const node = makeNode("AAPL")
    const updated = addNode(graph, node)
    expect(updated.nodes.size).toBe(1)
    expect(updated.nodes.get("AAPL")).toEqual(node)
    expect(graph.nodes.size).toBe(0)
  })

  it("adds an edge between two nodes", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("AAPL"))
    graph = addNode(graph, makeNode("TSM"))
    const edge = makeEdge("TSM", "AAPL")
    graph = addEdge(graph, edge)
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]).toEqual(edge)
  })

  it("builds adjacency list when adding edges", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("AAPL"))
    graph = addNode(graph, makeNode("TSM"))
    graph = addNode(graph, makeNode("ASML"))
    graph = addEdge(graph, makeEdge("TSM", "AAPL"))
    graph = addEdge(graph, makeEdge("ASML", "TSM"))
    const tsmNeighbors = getNeighbors(graph, "TSM")
    expect(tsmNeighbors).toHaveLength(1)
    expect(tsmNeighbors[0]!.toTicker).toBe("AAPL")
    const asmlNeighbors = getNeighbors(graph, "ASML")
    expect(asmlNeighbors).toHaveLength(1)
    expect(asmlNeighbors[0]!.toTicker).toBe("TSM")
  })

  it("removes a node and its connected edges", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("AAPL"))
    graph = addNode(graph, makeNode("TSM"))
    graph = addEdge(graph, makeEdge("TSM", "AAPL"))
    graph = removeNode(graph, "TSM")
    expect(graph.nodes.size).toBe(1)
    expect(graph.nodes.has("TSM")).toBe(false)
    expect(graph.edges).toHaveLength(0)
  })

  it("removes a specific edge by id", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("AAPL"))
    graph = addNode(graph, makeNode("TSM"))
    graph = addNode(graph, makeNode("AVGO"))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", "e1"))
    graph = addEdge(graph, makeEdge("AVGO", "AAPL", "e2"))
    graph = removeEdge(graph, "e1")
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]!.id).toBe("e2")
  })
})
