# Graph-Based DCF Supply Chain -- Phase 3: Graph Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the in-memory graph engine that represents supply chain networks, matches tariff policies to edges, and propagates revenue-weighted shocks through the graph with iterative convergence.

**Architecture:** `packages/server/src/graph-engine/` module. Pure functions operating on immutable `SupplyChainGraph` data structures. Each operation returns a new graph rather than mutating. The shock propagation engine uses the DCF engine from Phase 2 to recompute valuations at each step.

**Tech Stack:** TypeScript strict mode, Vitest, types from `@tori/shared`, `calculateDCF` and `mergeDrivers` from `@tori/dcf-engine`

**Spec reference:** `docs/superpowers/specs/2026-03-29-graph-dcf-supply-chain-design.md` -- Sections 3.2, 4.2, 8

**Prerequisite:** Phase 2 complete (DCF engine)

---

### Task 1: Graph Construction

**Files:**
- Create: `packages/server/src/graph-engine/graph.ts`
- Create: `packages/server/src/graph-engine/graph.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/graph-engine/graph.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { createGraph, addNode, addEdge, removeNode, removeEdge, getNeighbors } from "./graph.js"
import type { CompanyNode, SupplyEdge } from "@tori/shared"

function makeNode(ticker: string): CompanyNode {
  return {
    company: {
      ticker,
      name: `${ticker} Inc.`,
      sector: "Technology",
      country: "US",
      marketCap: 1_000_000,
      lastUpdated: "2026-01-01T00:00:00Z",
    },
    financialModel: {
      companyTicker: ticker,
      fiscalYear: 2025,
      drivers: {
        revenue: 100_000,
        revenueGrowthRate: 0.10,
        cogsPercent: 0.40,
        sgaPercent: 0.15,
        rdPercent: 0.10,
        daPercent: 0.05,
        interestExpense: 1_000,
        taxRate: 0.21,
        cashAndEquivalents: 50_000,
        accountsReceivable: 10_000,
        inventory: 8_000,
        ppe: 30_000,
        totalDebt: 20_000,
        accountsPayable: 7_000,
        capexPercent: 0.08,
        nwcChange: 2_000,
        wacc: 0.10,
        terminalGrowthRate: 0.03,
        projectionYears: 5,
        sharesOutstanding: 1_000,
      },
      overrides: {},
    },
    computedDCF: null,
  }
}

function makeEdge(from: string, to: string, id?: string): SupplyEdge {
  return {
    id: id ?? `${from}->${to}`,
    fromTicker: from,
    toTicker: to,
    revenueWeight: 0.25,
    productCategory: "Chips",
    confidence: 0.9,
    source: "manual",
    passthrough: 0.7,
    lastVerified: "2026-01-01T00:00:00Z",
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/graph-engine/graph.test.ts
```

Expected: FAIL -- cannot find module `./graph.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/graph-engine/graph.ts`:
```typescript
import type { CompanyNode, SupplyEdge, SupplyChainGraph } from "@tori/shared"

function buildAdjacency(
  edges: readonly SupplyEdge[],
): ReadonlyMap<string, readonly SupplyEdge[]> {
  const adj = new Map<string, SupplyEdge[]>()
  for (const edge of edges) {
    const existing = adj.get(edge.fromTicker) ?? []
    adj.set(edge.fromTicker, [...existing, edge])
  }
  return adj
}

function createGraph(): SupplyChainGraph {
  return {
    nodes: new Map(),
    edges: [],
    adjacency: new Map(),
  }
}

function addNode(graph: SupplyChainGraph, node: CompanyNode): SupplyChainGraph {
  const nodes = new Map(graph.nodes)
  nodes.set(node.company.ticker, node)
  return { ...graph, nodes }
}

function addEdge(graph: SupplyChainGraph, edge: SupplyEdge): SupplyChainGraph {
  const edges = [...graph.edges, edge]
  return { ...graph, edges, adjacency: buildAdjacency(edges) }
}

function removeNode(graph: SupplyChainGraph, ticker: string): SupplyChainGraph {
  const nodes = new Map(graph.nodes)
  nodes.delete(ticker)
  const edges = graph.edges.filter(
    (e) => e.fromTicker !== ticker && e.toTicker !== ticker,
  )
  return { nodes, edges, adjacency: buildAdjacency(edges) }
}

function removeEdge(graph: SupplyChainGraph, edgeId: string): SupplyChainGraph {
  const edges = graph.edges.filter((e) => e.id !== edgeId)
  return { ...graph, edges, adjacency: buildAdjacency(edges) }
}

function getNeighbors(graph: SupplyChainGraph, ticker: string): readonly SupplyEdge[] {
  return graph.adjacency.get(ticker) ?? []
}

export { createGraph, addNode, addEdge, removeNode, removeEdge, getNeighbors }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/graph-engine/graph.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/graph-engine/
git commit -m "feat: add immutable supply chain graph construction and manipulation"
```

---

### Task 2: Tariff Policy Edge Matching

**Files:**
- Create: `packages/server/src/graph-engine/policy-matcher.ts`
- Create: `packages/server/src/graph-engine/policy-matcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/graph-engine/policy-matcher.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { matchAffectedEdges } from "./policy-matcher.js"
import type { SupplyEdge, TariffPolicy, SupplyChainGraph, CompanyNode } from "@tori/shared"
import { createGraph, addNode, addEdge } from "./graph.js"

function makeNode(ticker: string, country: string): CompanyNode {
  return {
    company: {
      ticker,
      name: `${ticker} Inc.`,
      sector: "Semiconductors",
      country,
      marketCap: 1_000_000,
      lastUpdated: "2026-01-01T00:00:00Z",
    },
    financialModel: {
      companyTicker: ticker,
      fiscalYear: 2025,
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

function makeEdge(
  from: string,
  to: string,
  productCategory: string,
  id?: string,
): SupplyEdge {
  return {
    id: id ?? `${from}->${to}`,
    fromTicker: from,
    toTicker: to,
    revenueWeight: 0.25,
    productCategory,
    confidence: 0.9,
    source: "manual",
    passthrough: 0.7,
    lastVerified: "2026-01-01T00:00:00Z",
  }
}

function makePolicy(overrides: Partial<TariffPolicy> = {}): TariffPolicy {
  return {
    id: "p1",
    scenarioId: "s1",
    name: "Test tariff",
    tariffPercent: 0.25,
    targetCountry: "Taiwan",
    targetSector: null,
    targetProduct: null,
    affectedEdgeIds: [],
    ...overrides,
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

    const policy = makePolicy({
      targetCountry: "Taiwan",
      targetProduct: "Advanced Logic Chips",
    })
    const matched = matchAffectedEdges(graph, policy)

    expect(matched).toHaveLength(1)
    expect(matched[0]!.id).toBe("e1")
  })

  it("filters by targetSector when specified", () => {
    let graph = createGraph()
    graph = addNode(graph, makeNode("TSM", "Taiwan"))
    graph = addNode(graph, makeNode("AAPL", "US"))
    graph = addEdge(graph, makeEdge("TSM", "AAPL", "Chips", "e1"))

    const policy = makePolicy({
      targetCountry: "Taiwan",
      targetSector: "Automotive",
    })
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

    const policy = makePolicy({
      targetCountry: "Taiwan",
      affectedEdgeIds: ["e1"],
    })
    const matched = matchAffectedEdges(graph, policy)

    expect(matched).toHaveLength(1)
    expect(matched[0]!.id).toBe("e1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/graph-engine/policy-matcher.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/graph-engine/policy-matcher.ts`:
```typescript
import type { SupplyEdge, TariffPolicy, SupplyChainGraph } from "@tori/shared"

function matchAffectedEdges(
  graph: SupplyChainGraph,
  policy: TariffPolicy,
): readonly SupplyEdge[] {
  if (policy.affectedEdgeIds.length > 0) {
    const edgeIdSet = new Set(policy.affectedEdgeIds)
    return graph.edges.filter((e) => edgeIdSet.has(e.id))
  }

  return graph.edges.filter((edge) => {
    const supplierNode = graph.nodes.get(edge.fromTicker)
    if (!supplierNode) return false

    const countryMatch = supplierNode.company.country === policy.targetCountry

    const sectorMatch =
      policy.targetSector === null ||
      supplierNode.company.sector === policy.targetSector

    const productMatch =
      policy.targetProduct === null ||
      edge.productCategory === policy.targetProduct

    return countryMatch && sectorMatch && productMatch
  })
}

export { matchAffectedEdges }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/graph-engine/policy-matcher.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/graph-engine/policy-matcher.*
git commit -m "feat: add tariff policy edge matching with country/sector/product filters"
```

---

### Task 3: Shock Propagation Engine

**Files:**
- Create: `packages/server/src/graph-engine/propagate.ts`
- Create: `packages/server/src/graph-engine/propagate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/graph-engine/propagate.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { propagateShock } from "./propagate.js"
import { createGraph, addNode, addEdge } from "./graph.js"
import type { CompanyNode, SupplyEdge, TariffPolicy, FinancialModelDrivers } from "@tori/shared"

function makeDrivers(overrides: Partial<FinancialModelDrivers> = {}): FinancialModelDrivers {
  return {
    revenue: 100_000,
    revenueGrowthRate: 0.10,
    cogsPercent: 0.40,
    sgaPercent: 0.15,
    rdPercent: 0.10,
    daPercent: 0.05,
    interestExpense: 1_000,
    taxRate: 0.21,
    cashAndEquivalents: 50_000,
    accountsReceivable: 10_000,
    inventory: 8_000,
    ppe: 30_000,
    totalDebt: 20_000,
    accountsPayable: 7_000,
    capexPercent: 0.08,
    nwcChange: 2_000,
    wacc: 0.10,
    terminalGrowthRate: 0.03,
    projectionYears: 5,
    sharesOutstanding: 1_000,
    ...overrides,
  }
}

function makeNode(ticker: string, country: string, revenue: number): CompanyNode {
  return {
    company: {
      ticker,
      name: `${ticker} Inc.`,
      sector: "Semiconductors",
      country,
      marketCap: 1_000_000,
      lastUpdated: "2026-01-01T00:00:00Z",
    },
    financialModel: {
      companyTicker: ticker,
      fiscalYear: 2025,
      drivers: makeDrivers({ revenue }),
      overrides: {},
    },
    computedDCF: null,
  }
}

function makeEdge(
  from: string,
  to: string,
  revenueWeight: number,
  passthrough: number = 0.7,
): SupplyEdge {
  return {
    id: `${from}->${to}`,
    fromTicker: from,
    toTicker: to,
    revenueWeight,
    productCategory: "Chips",
    confidence: 0.9,
    source: "manual",
    passthrough,
    lastVerified: "2026-01-01T00:00:00Z",
  }
}

function makePolicy(overrides: Partial<TariffPolicy> = {}): TariffPolicy {
  return {
    id: "p1",
    scenarioId: "s1",
    name: "25% Taiwan tariff",
    tariffPercent: 0.25,
    targetCountry: "Taiwan",
    targetSector: null,
    targetProduct: null,
    affectedEdgeIds: [],
    ...overrides,
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/graph-engine/propagate.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/graph-engine/propagate.ts`:
```typescript
import type {
  SupplyChainGraph,
  CompanyNode,
  SupplyEdge,
  TariffPolicy,
  SimulationResult,
  ShockImpact,
  FinancialModelDrivers,
} from "@tori/shared"
import { calculateDCF } from "../dcf-engine/dcf-calculator.js"
import { mergeDrivers } from "../dcf-engine/merge-drivers.js"
import { matchAffectedEdges } from "./policy-matcher.js"

type PropagationConfig = {
  readonly convergenceThreshold: number
  readonly maxIterations: number
}

const DEFAULT_CONFIG: PropagationConfig = {
  convergenceThreshold: 0.001,
  maxIterations: 50,
}

function getEffectiveDrivers(node: CompanyNode): FinancialModelDrivers {
  return mergeDrivers(node.financialModel.drivers, node.financialModel.overrides)
}

function computeNodeValuation(drivers: FinancialModelDrivers): number {
  return calculateDCF(drivers).equityValue
}

function propagateShock(
  graph: SupplyChainGraph,
  policies: readonly TariffPolicy[],
  config: PropagationConfig = DEFAULT_CONFIG,
): SimulationResult {
  const baselineValuations = new Map<string, number>()
  const currentRevenues = new Map<string, number>()

  for (const [ticker, node] of graph.nodes) {
    const drivers = getEffectiveDrivers(node)
    baselineValuations.set(ticker, computeNodeValuation(drivers))
    currentRevenues.set(ticker, drivers.revenue)
  }

  const allAffectedEdges: SupplyEdge[] = []
  for (const policy of policies) {
    const matched = matchAffectedEdges(graph, policy)
    for (const edge of matched) {
      allAffectedEdges.push({ ...edge, revenueWeight: edge.revenueWeight * policy.tariffPercent })
    }
  }

  const revenueReductions = new Map<string, number>()

  for (const policy of policies) {
    const matched = matchAffectedEdges(graph, policy)
    for (const edge of matched) {
      const supplierNode = graph.nodes.get(edge.fromTicker)
      if (!supplierNode) continue
      const supplierRevenue = currentRevenues.get(edge.fromTicker)!
      const edgeRevenue = supplierRevenue * edge.revenueWeight
      const hit = edgeRevenue * policy.tariffPercent

      const supplierAbsorption = hit * (1 - edge.passthrough)
      const customerPassthrough = hit * edge.passthrough

      const currentSupplierReduction = revenueReductions.get(edge.fromTicker) ?? 0
      revenueReductions.set(edge.fromTicker, currentSupplierReduction + supplierAbsorption)

      const currentCustomerReduction = revenueReductions.get(edge.toTicker) ?? 0
      revenueReductions.set(edge.toTicker, currentCustomerReduction + customerPassthrough)
    }
  }

  let iterationCount = 0
  let converged = false

  const shockedRevenues = new Map<string, number>()
  for (const [ticker, revenue] of currentRevenues) {
    const reduction = revenueReductions.get(ticker) ?? 0
    shockedRevenues.set(ticker, revenue - reduction)
  }

  for (let i = 0; i < config.maxIterations; i++) {
    iterationCount = i + 1
    let maxDelta = 0

    const newReductions = new Map<string, number>()
    for (const [ticker] of graph.nodes) {
      newReductions.set(ticker, revenueReductions.get(ticker) ?? 0)
    }

    for (const [ticker, node] of graph.nodes) {
      const neighbors = graph.adjacency.get(ticker) ?? []
      for (const edge of neighbors) {
        const customerOriginalRevenue = currentRevenues.get(edge.toTicker)!
        const customerShockedRevenue = shockedRevenues.get(edge.toTicker)!
        const customerRevenueRatio = customerOriginalRevenue > 0
          ? customerShockedRevenue / customerOriginalRevenue
          : 1

        if (customerRevenueRatio < 1) {
          const supplierRevenue = currentRevenues.get(ticker)!
          const demandReduction = supplierRevenue * edge.revenueWeight * (1 - customerRevenueRatio)
          const current = newReductions.get(ticker) ?? 0
          newReductions.set(ticker, current + demandReduction)
        }
      }
    }

    for (const [ticker, revenue] of currentRevenues) {
      const reduction = newReductions.get(ticker) ?? 0
      const newShockedRevenue = Math.max(0, revenue - reduction)
      const previousShockedRevenue = shockedRevenues.get(ticker)!
      const delta = Math.abs(newShockedRevenue - previousShockedRevenue) / revenue
      maxDelta = Math.max(maxDelta, delta)
      shockedRevenues.set(ticker, newShockedRevenue)
    }

    revenueReductions.clear()
    for (const [ticker, reduction] of newReductions) {
      revenueReductions.set(ticker, reduction)
    }

    if (maxDelta < config.convergenceThreshold) {
      converged = true
      break
    }
  }

  const impacts = new Map<string, ShockImpact>()
  for (const [ticker, node] of graph.nodes) {
    const baseline = baselineValuations.get(ticker)!
    const shockedRevenue = shockedRevenues.get(ticker)!
    const originalRevenue = currentRevenues.get(ticker)!

    if (Math.abs(shockedRevenue - originalRevenue) < 0.01) {
      impacts.set(ticker, {
        ticker,
        baselineValuation: baseline,
        shockedValuation: baseline,
        delta: 0,
        percentChange: 0,
      })
      continue
    }

    const drivers = getEffectiveDrivers(node)
    const shockedDrivers = mergeDrivers(drivers, { revenue: shockedRevenue })
    const shockedValuation = computeNodeValuation(shockedDrivers)
    const delta = shockedValuation - baseline
    const percentChange = baseline !== 0 ? delta / Math.abs(baseline) : 0

    impacts.set(ticker, {
      ticker,
      baselineValuation: baseline,
      shockedValuation,
      delta,
      percentChange,
    })
  }

  return {
    scenarioId: policies[0]?.scenarioId ?? "unknown",
    impacts,
    iterationCount,
    converged,
  }
}

export { propagateShock }
export type { PropagationConfig }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/graph-engine/propagate.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/graph-engine/propagate.*
git commit -m "feat: add revenue-weighted shock propagation with iterative convergence"
```

---

### Task 4: Graph Engine Barrel Export

**Files:**
- Create: `packages/server/src/graph-engine/index.ts`

- [ ] **Step 1: Create barrel export**

Create `packages/server/src/graph-engine/index.ts`:
```typescript
export {
  createGraph,
  addNode,
  addEdge,
  removeNode,
  removeEdge,
  getNeighbors,
} from "./graph.js"

export { matchAffectedEdges } from "./policy-matcher.js"

export { propagateShock } from "./propagate.js"
export type { PropagationConfig } from "./propagate.js"
```

- [ ] **Step 2: Run all graph engine tests**

```bash
pnpm --filter @tori/server test -- src/graph-engine/
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/graph-engine/index.ts
git commit -m "feat: add graph engine barrel export"
```

---

That completes Phase 3. The graph engine now:
- Constructs and manipulates immutable supply chain graphs
- Matches tariff policies to affected edges by country/sector/product
- Supports manual edge override for fine-grained control
- Propagates revenue-weighted shocks through the graph
- Handles cyclic supply chains with iterative convergence
- Composes multiple tariff policies into a single scenario
- Respects per-edge passthrough parameters
- Reports convergence status and iteration counts
