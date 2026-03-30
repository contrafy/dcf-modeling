# Graph-Based DCF Supply Chain -- Phase 4: Data Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Neo4j persistence layer and pluggable financial data adapters. The Neo4j client provides typed CRUD operations for all graph entities. The data adapters fetch financial statements and market data from free external APIs (FMP, Yahoo Finance, SEC EDGAR) with a fallback orchestrator that degrades gracefully when rate limits are hit.

**Architecture:** Two sibling modules under `packages/server/src/`. `neo4j-client/` wraps the `neo4j-driver` package with typed repositories for each entity kind. `data-adapters/` defines a common `FinancialDataAdapter` interface and ships three implementations plus an orchestrator that applies the fallback strategy: FMP first, Yahoo Finance as backup, SEC EDGAR always available for filing text.

**Tech Stack:** TypeScript strict mode, Vitest, `neo4j-driver` (already in server deps), `yahoo-finance2` (add to server deps), plain `fetch` (Node 22 built-in), MSW for HTTP mocking in adapter tests, real Neo4j instance (Docker Compose) for Neo4j integration tests

**Spec reference:** `docs/superpowers/specs/2026-03-29-graph-dcf-supply-chain-design.md` -- Sections 3.1, 5, 11

**Prerequisite:** Phase 3 complete (graph engine)

---

### Task 0: Install Additional Dependencies

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1: Add yahoo-finance2 and msw**

```bash
cd /home/contrafy/git/toriProject
pnpm --filter @tori/server add yahoo-finance2
pnpm --filter @tori/server add -D msw
```

- [ ] **Step 2: Verify installation**

```bash
pnpm --filter @tori/server exec -- node -e "import('yahoo-finance2').then(m => console.log('yahoo-finance2 ok'))"
```

Expected: `yahoo-finance2 ok`

- [ ] **Step 3: Commit**

```bash
git add packages/server/package.json pnpm-lock.yaml
git commit --no-gpg-sign -m "feat: add yahoo-finance2 and msw to server dependencies"
```

---

### Task 1: Neo4j Connection

**Files:**
- Create: `packages/server/src/neo4j-client/connection.ts`
- Create: `packages/server/src/neo4j-client/connection.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/neo4j-client/connection.test.ts`:
```typescript
import { describe, it, expect, afterAll } from "vitest"
import { createNeo4jConnection, closeNeo4jConnection } from "./connection.js"

const TEST_URI = process.env["NEO4J_URI"] ?? "bolt://localhost:7687"
const TEST_USER = process.env["NEO4J_USER"] ?? "neo4j"
const TEST_PASSWORD = process.env["NEO4J_PASSWORD"] ?? "changeme"

describe("Neo4j connection", () => {
  it("connects to a running Neo4j instance and verifies connectivity", async () => {
    const connection = createNeo4jConnection({
      uri: TEST_URI,
      user: TEST_USER,
      password: TEST_PASSWORD,
    })

    await expect(connection.verifyConnectivity()).resolves.not.toThrow()

    await closeNeo4jConnection(connection)
  })

  it("exposes a session factory for running queries", async () => {
    const connection = createNeo4jConnection({
      uri: TEST_URI,
      user: TEST_USER,
      password: TEST_PASSWORD,
    })

    const session = connection.session()
    const result = await session.run("RETURN 1 AS n")
    const value = result.records[0]?.get("n")

    expect(Number(value)).toBe(1)

    await session.close()
    await closeNeo4jConnection(connection)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/neo4j-client/connection.test.ts
```

Expected: FAIL -- cannot find module `./connection.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/neo4j-client/connection.ts`:
```typescript
import neo4j, { Driver, Session } from "neo4j-driver"

type Neo4jConfig = {
  readonly uri: string
  readonly user: string
  readonly password: string
}

type Neo4jConnection = {
  readonly verifyConnectivity: () => Promise<void>
  readonly session: () => Session
  readonly driver: Driver
}

function createNeo4jConnection(config: Neo4jConfig): Neo4jConnection {
  const driver = neo4j.driver(
    config.uri,
    neo4j.auth.basic(config.user, config.password),
  )

  return {
    driver,
    verifyConnectivity: () => driver.verifyConnectivity().then(() => undefined),
    session: () => driver.session(),
  }
}

async function closeNeo4jConnection(connection: Neo4jConnection): Promise<void> {
  await connection.driver.close()
}

export { createNeo4jConnection, closeNeo4jConnection }
export type { Neo4jConfig, Neo4jConnection }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/neo4j-client/connection.test.ts
```

Expected: PASS (requires Neo4j running via Docker Compose)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/neo4j-client/
git commit --no-gpg-sign -m "feat: add Neo4j driver connection wrapper"
```

---

### Task 2: Company Repository

**Files:**
- Create: `packages/server/src/neo4j-client/company-repository.ts`
- Create: `packages/server/src/neo4j-client/company-repository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/neo4j-client/company-repository.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createNeo4jConnection, closeNeo4jConnection } from "./connection.js"
import {
  upsertCompany,
  findCompanyByTicker,
  deleteCompany,
  listAllCompanies,
} from "./company-repository.js"
import type { Company } from "@tori/shared"
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/neo4j-client/company-repository.test.ts
```

Expected: FAIL -- cannot find module `./company-repository.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/neo4j-client/company-repository.ts`:
```typescript
import type { Company } from "@tori/shared"
import type { Neo4jConnection } from "./connection.js"

async function upsertCompany(
  connection: Neo4jConnection,
  company: Company,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MERGE (c:Company { ticker: $ticker })
      SET c.name = $name,
          c.sector = $sector,
          c.country = $country,
          c.marketCap = $marketCap,
          c.lastUpdated = $lastUpdated
      `,
      {
        ticker: company.ticker,
        name: company.name,
        sector: company.sector,
        country: company.country,
        marketCap: company.marketCap,
        lastUpdated: company.lastUpdated,
      },
    )
  } finally {
    await session.close()
  }
}

async function findCompanyByTicker(
  connection: Neo4jConnection,
  ticker: string,
): Promise<Company | null> {
  const session = connection.session()
  try {
    const result = await session.run(
      `MATCH (c:Company { ticker: $ticker }) RETURN c`,
      { ticker },
    )
    const record = result.records[0]
    if (!record) return null

    const node = record.get("c").properties as Record<string, unknown>
    return {
      ticker: node["ticker"] as string,
      name: node["name"] as string,
      sector: node["sector"] as string,
      country: node["country"] as string,
      marketCap: Number(node["marketCap"]),
      lastUpdated: node["lastUpdated"] as string,
    }
  } finally {
    await session.close()
  }
}

async function listAllCompanies(connection: Neo4jConnection): Promise<readonly Company[]> {
  const session = connection.session()
  try {
    const result = await session.run(`MATCH (c:Company) RETURN c ORDER BY c.ticker`)
    return result.records.map((record) => {
      const node = record.get("c").properties as Record<string, unknown>
      return {
        ticker: node["ticker"] as string,
        name: node["name"] as string,
        sector: node["sector"] as string,
        country: node["country"] as string,
        marketCap: Number(node["marketCap"]),
        lastUpdated: node["lastUpdated"] as string,
      }
    })
  } finally {
    await session.close()
  }
}

async function deleteCompany(
  connection: Neo4jConnection,
  ticker: string,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(`MATCH (c:Company { ticker: $ticker }) DELETE c`, { ticker })
  } finally {
    await session.close()
  }
}

export { upsertCompany, findCompanyByTicker, listAllCompanies, deleteCompany }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/neo4j-client/company-repository.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/neo4j-client/company-repository.*
git commit --no-gpg-sign -m "feat: add Neo4j company repository with upsert/find/list/delete"
```

---

### Task 3: Edge Repository

**Files:**
- Create: `packages/server/src/neo4j-client/edge-repository.ts`
- Create: `packages/server/src/neo4j-client/edge-repository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/neo4j-client/edge-repository.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/neo4j-client/edge-repository.test.ts
```

Expected: FAIL -- cannot find module `./edge-repository.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/neo4j-client/edge-repository.ts`:
```typescript
import type { SupplyEdge } from "@tori/shared"
import type { Neo4jConnection } from "./connection.js"

function recordToEdge(props: Record<string, unknown>, from: string, to: string): SupplyEdge {
  return {
    id: props["id"] as string,
    fromTicker: from,
    toTicker: to,
    revenueWeight: Number(props["revenueWeight"]),
    productCategory: props["productCategory"] as string,
    confidence: Number(props["confidence"]),
    source: props["source"] as "manual" | "llm" | "sec_filing",
    passthrough: Number(props["passthrough"]),
    lastVerified: props["lastVerified"] as string,
  }
}

async function upsertEdge(
  connection: Neo4jConnection,
  edge: SupplyEdge,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MATCH (from:Company { ticker: $fromTicker })
      MATCH (to:Company { ticker: $toTicker })
      MERGE (from)-[r:SUPPLIES_TO { id: $id }]->(to)
      SET r.revenueWeight = $revenueWeight,
          r.productCategory = $productCategory,
          r.confidence = $confidence,
          r.source = $source,
          r.passthrough = $passthrough,
          r.lastVerified = $lastVerified
      `,
      {
        id: edge.id,
        fromTicker: edge.fromTicker,
        toTicker: edge.toTicker,
        revenueWeight: edge.revenueWeight,
        productCategory: edge.productCategory,
        confidence: edge.confidence,
        source: edge.source,
        passthrough: edge.passthrough,
        lastVerified: edge.lastVerified,
      },
    )
  } finally {
    await session.close()
  }
}

async function findEdgeById(
  connection: Neo4jConnection,
  id: string,
): Promise<SupplyEdge | null> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (from:Company)-[r:SUPPLIES_TO { id: $id }]->(to:Company)
      RETURN r, from.ticker AS fromTicker, to.ticker AS toTicker
      `,
      { id },
    )
    const record = result.records[0]
    if (!record) return null

    const props = record.get("r").properties as Record<string, unknown>
    const from = record.get("fromTicker") as string
    const to = record.get("toTicker") as string
    return recordToEdge(props, from, to)
  } finally {
    await session.close()
  }
}

async function listEdgesForSupplier(
  connection: Neo4jConnection,
  ticker: string,
): Promise<readonly SupplyEdge[]> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (from:Company { ticker: $ticker })-[r:SUPPLIES_TO]->(to:Company)
      RETURN r, from.ticker AS fromTicker, to.ticker AS toTicker
      `,
      { ticker },
    )
    return result.records.map((record) => {
      const props = record.get("r").properties as Record<string, unknown>
      return recordToEdge(props, record.get("fromTicker"), record.get("toTicker"))
    })
  } finally {
    await session.close()
  }
}

async function listEdgesForCustomer(
  connection: Neo4jConnection,
  ticker: string,
): Promise<readonly SupplyEdge[]> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (from:Company)-[r:SUPPLIES_TO]->(to:Company { ticker: $ticker })
      RETURN r, from.ticker AS fromTicker, to.ticker AS toTicker
      `,
      { ticker },
    )
    return result.records.map((record) => {
      const props = record.get("r").properties as Record<string, unknown>
      return recordToEdge(props, record.get("fromTicker"), record.get("toTicker"))
    })
  } finally {
    await session.close()
  }
}

async function listAllEdges(
  connection: Neo4jConnection,
): Promise<readonly SupplyEdge[]> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (from:Company)-[r:SUPPLIES_TO]->(to:Company)
      RETURN r, from.ticker AS fromTicker, to.ticker AS toTicker
      `,
    )
    return result.records.map((record) => {
      const props = record.get("r").properties as Record<string, unknown>
      return recordToEdge(props, record.get("fromTicker"), record.get("toTicker"))
    })
  } finally {
    await session.close()
  }
}

async function updateEdge(
  connection: Neo4jConnection,
  id: string,
  patch: Partial<Pick<SupplyEdge, "revenueWeight" | "productCategory" | "confidence" | "passthrough">>,
): Promise<void> {
  const session = connection.session()
  try {
    const setClauses = Object.entries(patch)
      .map(([key]) => `r.${key} = $${key}`)
      .join(", ")

    if (setClauses === "") return

    await session.run(
      `MATCH ()-[r:SUPPLIES_TO { id: $id }]->() SET ${setClauses}`,
      { id, ...patch },
    )
  } finally {
    await session.close()
  }
}

async function deleteEdge(
  connection: Neo4jConnection,
  id: string,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `MATCH ()-[r:SUPPLIES_TO { id: $id }]->() DELETE r`,
      { id },
    )
  } finally {
    await session.close()
  }
}

export {
  upsertEdge,
  findEdgeById,
  listEdgesForSupplier,
  listEdgesForCustomer,
  listAllEdges,
  updateEdge,
  deleteEdge,
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/neo4j-client/edge-repository.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/neo4j-client/edge-repository.*
git commit --no-gpg-sign -m "feat: add Neo4j edge repository for SUPPLIES_TO relationships"
```

---

### Task 4: Financial Model Repository

**Files:**
- Create: `packages/server/src/neo4j-client/financial-repository.ts`
- Create: `packages/server/src/neo4j-client/financial-repository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/neo4j-client/financial-repository.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createNeo4jConnection, closeNeo4jConnection } from "./connection.js"
import { upsertCompany } from "./company-repository.js"
import {
  upsertFinancialModel,
  findFinancialModelByTicker,
  deleteFinancialModel,
} from "./financial-repository.js"
import type { Company, FinancialModel, FinancialModelDrivers } from "@tori/shared"
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/neo4j-client/financial-repository.test.ts
```

Expected: FAIL -- cannot find module `./financial-repository.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/neo4j-client/financial-repository.ts`:
```typescript
import type { FinancialModel, FinancialModelDrivers } from "@tori/shared"
import type { Neo4jConnection } from "./connection.js"

async function upsertFinancialModel(
  connection: Neo4jConnection,
  model: FinancialModel,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MATCH (c:Company { ticker: $companyTicker })
      MERGE (c)-[:HAS_MODEL]->(m:FinancialModel { companyTicker: $companyTicker })
      SET m.fiscalYear = $fiscalYear,
          m.revenue = $revenue,
          m.revenueGrowthRate = $revenueGrowthRate,
          m.cogsPercent = $cogsPercent,
          m.sgaPercent = $sgaPercent,
          m.rdPercent = $rdPercent,
          m.daPercent = $daPercent,
          m.interestExpense = $interestExpense,
          m.taxRate = $taxRate,
          m.cashAndEquivalents = $cashAndEquivalents,
          m.accountsReceivable = $accountsReceivable,
          m.inventory = $inventory,
          m.ppe = $ppe,
          m.totalDebt = $totalDebt,
          m.accountsPayable = $accountsPayable,
          m.capexPercent = $capexPercent,
          m.nwcChange = $nwcChange,
          m.wacc = $wacc,
          m.terminalGrowthRate = $terminalGrowthRate,
          m.projectionYears = $projectionYears,
          m.sharesOutstanding = $sharesOutstanding,
          m.overrides = $overrides
      `,
      {
        companyTicker: model.companyTicker,
        fiscalYear: model.fiscalYear,
        ...model.drivers,
        overrides: JSON.stringify(model.overrides),
      },
    )
  } finally {
    await session.close()
  }
}

async function findFinancialModelByTicker(
  connection: Neo4jConnection,
  ticker: string,
): Promise<FinancialModel | null> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (c:Company { ticker: $ticker })-[:HAS_MODEL]->(m:FinancialModel)
      RETURN m
      `,
      { ticker },
    )
    const record = result.records[0]
    if (!record) return null

    const p = record.get("m").properties as Record<string, unknown>

    const drivers: FinancialModelDrivers = {
      revenue: Number(p["revenue"]),
      revenueGrowthRate: Number(p["revenueGrowthRate"]),
      cogsPercent: Number(p["cogsPercent"]),
      sgaPercent: Number(p["sgaPercent"]),
      rdPercent: Number(p["rdPercent"]),
      daPercent: Number(p["daPercent"]),
      interestExpense: Number(p["interestExpense"]),
      taxRate: Number(p["taxRate"]),
      cashAndEquivalents: Number(p["cashAndEquivalents"]),
      accountsReceivable: Number(p["accountsReceivable"]),
      inventory: Number(p["inventory"]),
      ppe: Number(p["ppe"]),
      totalDebt: Number(p["totalDebt"]),
      accountsPayable: Number(p["accountsPayable"]),
      capexPercent: Number(p["capexPercent"]),
      nwcChange: Number(p["nwcChange"]),
      wacc: Number(p["wacc"]),
      terminalGrowthRate: Number(p["terminalGrowthRate"]),
      projectionYears: Number(p["projectionYears"]),
      sharesOutstanding: Number(p["sharesOutstanding"]),
    }

    const overrides = p["overrides"]
      ? (JSON.parse(p["overrides"] as string) as Partial<FinancialModelDrivers>)
      : {}

    return {
      companyTicker: p["companyTicker"] as string,
      fiscalYear: Number(p["fiscalYear"]),
      drivers,
      overrides,
    }
  } finally {
    await session.close()
  }
}

async function deleteFinancialModel(
  connection: Neo4jConnection,
  ticker: string,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MATCH (c:Company { ticker: $ticker })-[:HAS_MODEL]->(m:FinancialModel)
      DETACH DELETE m
      `,
      { ticker },
    )
  } finally {
    await session.close()
  }
}

export { upsertFinancialModel, findFinancialModelByTicker, deleteFinancialModel }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/neo4j-client/financial-repository.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/neo4j-client/financial-repository.*
git commit --no-gpg-sign -m "feat: add Neo4j financial model repository linked to Company nodes"
```

---

### Task 5: Scenario Repository

**Files:**
- Create: `packages/server/src/neo4j-client/scenario-repository.ts`
- Create: `packages/server/src/neo4j-client/scenario-repository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/neo4j-client/scenario-repository.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createNeo4jConnection, closeNeo4jConnection } from "./connection.js"
import {
  upsertScenario,
  findScenarioById,
  listAllScenarios,
  deleteScenario,
  upsertTariffPolicy,
  findPoliciesForScenario,
  deleteTariffPolicy,
} from "./scenario-repository.js"
import type { Scenario, TariffPolicy } from "@tori/shared"
import type { Neo4jConnection } from "./connection.js"

const TEST_URI = process.env["NEO4J_URI"] ?? "bolt://localhost:7687"
const TEST_USER = process.env["NEO4J_USER"] ?? "neo4j"
const TEST_PASSWORD = process.env["NEO4J_PASSWORD"] ?? "changeme"

const TEST_SCENARIO_PREFIX = "test-scenario-"
const TEST_POLICY_PREFIX = "test-policy-"

function makeScenario(id: string): Scenario {
  return {
    id: `${TEST_SCENARIO_PREFIX}${id}`,
    name: `Scenario ${id}`,
    description: "Test scenario",
    policies: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

function makePolicy(id: string, scenarioId: string): TariffPolicy {
  return {
    id: `${TEST_POLICY_PREFIX}${id}`,
    scenarioId,
    name: `Policy ${id}`,
    tariffPercent: 0.25,
    targetCountry: "Taiwan",
    targetSector: null,
    targetProduct: null,
    affectedEdgeIds: [],
  }
}

describe("scenario-repository", () => {
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
      MATCH (s:Scenario)-[:CONTAINS_POLICY]->(p:TariffPolicy)
      WHERE s.id STARTS WITH $prefix
      DETACH DELETE p
      `,
      { prefix: TEST_SCENARIO_PREFIX },
    )
    await session.run(
      `MATCH (s:Scenario) WHERE s.id STARTS WITH $prefix DELETE s`,
      { prefix: TEST_SCENARIO_PREFIX },
    )
    await session.close()
  })

  afterAll(async () => {
    const session = connection.session()
    await session.run(
      `
      MATCH (s:Scenario)-[:CONTAINS_POLICY]->(p:TariffPolicy)
      WHERE s.id STARTS WITH $prefix
      DETACH DELETE p
      `,
      { prefix: TEST_SCENARIO_PREFIX },
    )
    await session.run(
      `MATCH (s:Scenario) WHERE s.id STARTS WITH $prefix DELETE s`,
      { prefix: TEST_SCENARIO_PREFIX },
    )
    await session.close()
    await closeNeo4jConnection(connection)
  })

  it("upserts a Scenario node and retrieves it by id", async () => {
    const scenario = makeScenario("base")
    await upsertScenario(connection, scenario)

    const found = await findScenarioById(connection, scenario.id)

    expect(found).not.toBeNull()
    expect(found!.id).toBe(scenario.id)
    expect(found!.name).toBe(scenario.name)
    expect(found!.description).toBe(scenario.description)
    expect(found!.policies).toHaveLength(0)
  })

  it("returns null when scenario does not exist", async () => {
    const found = await findScenarioById(connection, "does-not-exist-xyz")
    expect(found).toBeNull()
  })

  it("lists all scenarios", async () => {
    await upsertScenario(connection, makeScenario("list-a"))
    await upsertScenario(connection, makeScenario("list-b"))

    const all = await listAllScenarios(connection)
    const ids = all.map((s) => s.id)

    expect(ids).toContain(`${TEST_SCENARIO_PREFIX}list-a`)
    expect(ids).toContain(`${TEST_SCENARIO_PREFIX}list-b`)
  })

  it("upserts a TariffPolicy linked to a Scenario and retrieves policies", async () => {
    const scenario = makeScenario("with-policy")
    await upsertScenario(connection, scenario)

    const policy = makePolicy("p1", scenario.id)
    await upsertTariffPolicy(connection, policy)

    const policies = await findPoliciesForScenario(connection, scenario.id)

    expect(policies).toHaveLength(1)
    expect(policies[0]!.id).toBe(policy.id)
    expect(policies[0]!.tariffPercent).toBe(0.25)
    expect(policies[0]!.targetCountry).toBe("Taiwan")
    expect(policies[0]!.targetSector).toBeNull()
    expect(policies[0]!.affectedEdgeIds).toHaveLength(0)
  })

  it("returns policies with affectedEdgeIds when populated", async () => {
    const scenario = makeScenario("manual-edges")
    await upsertScenario(connection, scenario)

    const policy: TariffPolicy = {
      ...makePolicy("p2", scenario.id),
      affectedEdgeIds: ["edge-a", "edge-b"],
    }
    await upsertTariffPolicy(connection, policy)

    const policies = await findPoliciesForScenario(connection, scenario.id)
    expect(policies[0]!.affectedEdgeIds).toEqual(["edge-a", "edge-b"])
  })

  it("deletes a tariff policy", async () => {
    const scenario = makeScenario("del-policy")
    await upsertScenario(connection, scenario)

    const policy = makePolicy("del-p1", scenario.id)
    await upsertTariffPolicy(connection, policy)
    await deleteTariffPolicy(connection, policy.id)

    const policies = await findPoliciesForScenario(connection, scenario.id)
    expect(policies).toHaveLength(0)
  })

  it("deletes a scenario and its policies", async () => {
    const scenario = makeScenario("del-full")
    await upsertScenario(connection, scenario)
    await upsertTariffPolicy(connection, makePolicy("del-full-p1", scenario.id))
    await deleteScenario(connection, scenario.id)

    const found = await findScenarioById(connection, scenario.id)
    expect(found).toBeNull()
  })

  it("findScenarioById includes policies in the result", async () => {
    const scenario = makeScenario("with-policies-full")
    await upsertScenario(connection, scenario)
    await upsertTariffPolicy(connection, makePolicy("full-p1", scenario.id))
    await upsertTariffPolicy(connection, makePolicy("full-p2", scenario.id))

    const found = await findScenarioById(connection, scenario.id)
    expect(found!.policies).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/neo4j-client/scenario-repository.test.ts
```

Expected: FAIL -- cannot find module `./scenario-repository.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/neo4j-client/scenario-repository.ts`:
```typescript
import type { Scenario, TariffPolicy } from "@tori/shared"
import type { Neo4jConnection } from "./connection.js"

function recordToPolicy(p: Record<string, unknown>): TariffPolicy {
  const raw = p["affectedEdgeIds"]
  const affectedEdgeIds: readonly string[] = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === "string" && raw !== ""
      ? (JSON.parse(raw) as string[])
      : []

  return {
    id: p["id"] as string,
    scenarioId: p["scenarioId"] as string,
    name: p["name"] as string,
    tariffPercent: Number(p["tariffPercent"]),
    targetCountry: p["targetCountry"] as string,
    targetSector: (p["targetSector"] as string | null) ?? null,
    targetProduct: (p["targetProduct"] as string | null) ?? null,
    affectedEdgeIds,
  }
}

async function upsertScenario(
  connection: Neo4jConnection,
  scenario: Scenario,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MERGE (s:Scenario { id: $id })
      SET s.name = $name,
          s.description = $description,
          s.createdAt = $createdAt
      `,
      {
        id: scenario.id,
        name: scenario.name,
        description: scenario.description,
        createdAt: scenario.createdAt,
      },
    )
  } finally {
    await session.close()
  }
}

async function findScenarioById(
  connection: Neo4jConnection,
  id: string,
): Promise<Scenario | null> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (s:Scenario { id: $id })
      OPTIONAL MATCH (s)-[:CONTAINS_POLICY]->(p:TariffPolicy)
      RETURN s, collect(p) AS policies
      `,
      { id },
    )
    const record = result.records[0]
    if (!record) return null

    const s = record.get("s").properties as Record<string, unknown>
    const rawPolicies = record.get("policies") as Array<{ properties: Record<string, unknown> } | null>
    const policies = rawPolicies
      .filter((p): p is { properties: Record<string, unknown> } => p !== null)
      .map((p) => recordToPolicy(p.properties))

    return {
      id: s["id"] as string,
      name: s["name"] as string,
      description: s["description"] as string,
      createdAt: s["createdAt"] as string,
      policies,
    }
  } finally {
    await session.close()
  }
}

async function listAllScenarios(
  connection: Neo4jConnection,
): Promise<readonly Scenario[]> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (s:Scenario)
      OPTIONAL MATCH (s)-[:CONTAINS_POLICY]->(p:TariffPolicy)
      RETURN s, collect(p) AS policies
      ORDER BY s.createdAt
      `,
    )
    return result.records.map((record) => {
      const s = record.get("s").properties as Record<string, unknown>
      const rawPolicies = record.get("policies") as Array<{ properties: Record<string, unknown> } | null>
      const policies = rawPolicies
        .filter((p): p is { properties: Record<string, unknown> } => p !== null)
        .map((p) => recordToPolicy(p.properties))

      return {
        id: s["id"] as string,
        name: s["name"] as string,
        description: s["description"] as string,
        createdAt: s["createdAt"] as string,
        policies,
      }
    })
  } finally {
    await session.close()
  }
}

async function deleteScenario(
  connection: Neo4jConnection,
  id: string,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MATCH (s:Scenario { id: $id })
      OPTIONAL MATCH (s)-[:CONTAINS_POLICY]->(p:TariffPolicy)
      DETACH DELETE s, p
      `,
      { id },
    )
  } finally {
    await session.close()
  }
}

async function upsertTariffPolicy(
  connection: Neo4jConnection,
  policy: TariffPolicy,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `
      MATCH (s:Scenario { id: $scenarioId })
      MERGE (s)-[:CONTAINS_POLICY]->(p:TariffPolicy { id: $id })
      SET p.scenarioId = $scenarioId,
          p.name = $name,
          p.tariffPercent = $tariffPercent,
          p.targetCountry = $targetCountry,
          p.targetSector = $targetSector,
          p.targetProduct = $targetProduct,
          p.affectedEdgeIds = $affectedEdgeIds
      `,
      {
        id: policy.id,
        scenarioId: policy.scenarioId,
        name: policy.name,
        tariffPercent: policy.tariffPercent,
        targetCountry: policy.targetCountry,
        targetSector: policy.targetSector,
        targetProduct: policy.targetProduct,
        affectedEdgeIds: [...policy.affectedEdgeIds],
      },
    )
  } finally {
    await session.close()
  }
}

async function findPoliciesForScenario(
  connection: Neo4jConnection,
  scenarioId: string,
): Promise<readonly TariffPolicy[]> {
  const session = connection.session()
  try {
    const result = await session.run(
      `
      MATCH (s:Scenario { id: $scenarioId })-[:CONTAINS_POLICY]->(p:TariffPolicy)
      RETURN p
      `,
      { scenarioId },
    )
    return result.records.map((record) => {
      const p = record.get("p").properties as Record<string, unknown>
      return recordToPolicy(p)
    })
  } finally {
    await session.close()
  }
}

async function deleteTariffPolicy(
  connection: Neo4jConnection,
  id: string,
): Promise<void> {
  const session = connection.session()
  try {
    await session.run(
      `MATCH (p:TariffPolicy { id: $id }) DETACH DELETE p`,
      { id },
    )
  } finally {
    await session.close()
  }
}

export {
  upsertScenario,
  findScenarioById,
  listAllScenarios,
  deleteScenario,
  upsertTariffPolicy,
  findPoliciesForScenario,
  deleteTariffPolicy,
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/neo4j-client/scenario-repository.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/neo4j-client/scenario-repository.*
git commit --no-gpg-sign -m "feat: add Neo4j scenario and tariff policy repositories"
```

---

### Task 6: Neo4j Client Barrel Export

**Files:**
- Create: `packages/server/src/neo4j-client/index.ts`

- [ ] **Step 1: Create barrel export**

Create `packages/server/src/neo4j-client/index.ts`:
```typescript
export {
  createNeo4jConnection,
  closeNeo4jConnection,
} from "./connection.js"
export type { Neo4jConfig, Neo4jConnection } from "./connection.js"

export {
  upsertCompany,
  findCompanyByTicker,
  listAllCompanies,
  deleteCompany,
} from "./company-repository.js"

export {
  upsertEdge,
  findEdgeById,
  listEdgesForSupplier,
  listEdgesForCustomer,
  listAllEdges,
  updateEdge,
  deleteEdge,
} from "./edge-repository.js"

export {
  upsertFinancialModel,
  findFinancialModelByTicker,
  deleteFinancialModel,
} from "./financial-repository.js"

export {
  upsertScenario,
  findScenarioById,
  listAllScenarios,
  deleteScenario,
  upsertTariffPolicy,
  findPoliciesForScenario,
  deleteTariffPolicy,
} from "./scenario-repository.js"
```

- [ ] **Step 2: Run all neo4j-client tests**

```bash
pnpm --filter @tori/server test -- src/neo4j-client/
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/neo4j-client/index.ts
git commit --no-gpg-sign -m "feat: add neo4j-client barrel export"
```

---

### Task 7: Adapter Interface and Raw Types

**Files:**
- Create: `packages/server/src/data-adapters/adapter-interface.ts`

- [ ] **Step 1: Create the adapter interface and raw financial types**

Create `packages/server/src/data-adapters/adapter-interface.ts`:
```typescript
type RawIncomeStatement = {
  readonly fiscalYear: number
  readonly revenue: number
  readonly cogs: number
  readonly grossProfit: number
  readonly operatingExpenses: number
  readonly ebitda: number
  readonly ebit: number
  readonly interestExpense: number
  readonly netIncome: number
  readonly taxProvision: number
}

type RawBalanceSheet = {
  readonly fiscalYear: number
  readonly cashAndEquivalents: number
  readonly accountsReceivable: number
  readonly inventory: number
  readonly ppe: number
  readonly totalDebt: number
  readonly accountsPayable: number
  readonly totalAssets: number
  readonly totalLiabilities: number
  readonly totalEquity: number
}

type RawCashFlow = {
  readonly fiscalYear: number
  readonly operatingCashFlow: number
  readonly capex: number
  readonly freeCashFlow: number
  readonly da: number
}

type RawFinancials = {
  readonly ticker: string
  readonly companyName: string
  readonly sector: string
  readonly country: string
  readonly incomeStatements: readonly RawIncomeStatement[]
  readonly balanceSheets: readonly RawBalanceSheet[]
  readonly cashFlows: readonly RawCashFlow[]
}

type MarketData = {
  readonly ticker: string
  readonly price: number
  readonly marketCap: number
  readonly sharesOutstanding: number
  readonly beta: number
  readonly fiftyTwoWeekHigh: number
  readonly fiftyTwoWeekLow: number
  readonly lastUpdated: string
}

type FinancialDataAdapter = {
  readonly name: string
  readonly fetchFinancials: (ticker: string, years: number) => Promise<RawFinancials>
  readonly fetchMarketData: (ticker: string) => Promise<MarketData>
  readonly isAvailable: () => Promise<boolean>
}

export type {
  RawIncomeStatement,
  RawBalanceSheet,
  RawCashFlow,
  RawFinancials,
  MarketData,
  FinancialDataAdapter,
}
```

- [ ] **Step 2: No test needed for pure types -- commit directly**

```bash
git add packages/server/src/data-adapters/adapter-interface.ts
git commit --no-gpg-sign -m "feat: add FinancialDataAdapter interface and raw financial types"
```

---

### Task 8: FMP Adapter

**Files:**
- Create: `packages/server/src/data-adapters/fmp-adapter.ts`
- Create: `packages/server/src/data-adapters/fmp-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/data-adapters/fmp-adapter.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"
import { createFmpAdapter } from "./fmp-adapter.js"

const FMP_BASE = "https://financialmodelingprep.com/api/v3"
const TEST_API_KEY = "test-key-123"
const TEST_TICKER = "AAPL"

const mockIncomeStatements = [
  {
    date: "2025-09-27",
    calendarYear: "2025",
    revenue: 391_035_000_000,
    costOfRevenue: 210_352_000_000,
    grossProfit: 180_683_000_000,
    operatingExpenses: 57_467_000_000,
    ebitda: 134_661_000_000,
    operatingIncome: 123_216_000_000,
    interestExpense: 3_931_000_000,
    netIncome: 93_736_000_000,
    incomeTaxExpense: 29_749_000_000,
  },
  {
    date: "2024-09-28",
    calendarYear: "2024",
    revenue: 383_285_000_000,
    costOfRevenue: 210_352_000_000,
    grossProfit: 172_933_000_000,
    operatingExpenses: 54_847_000_000,
    ebitda: 129_626_000_000,
    operatingIncome: 118_086_000_000,
    interestExpense: 3_841_000_000,
    netIncome: 93_736_000_000,
    incomeTaxExpense: 24_350_000_000,
  },
]

const mockBalanceSheets = [
  {
    date: "2025-09-27",
    calendarYear: "2025",
    cashAndCashEquivalents: 29_943_000_000,
    netReceivables: 68_794_000_000,
    inventory: 7_286_000_000,
    propertyPlantEquipmentNet: 37_378_000_000,
    totalDebt: 101_304_000_000,
    accountPayables: 68_960_000_000,
    totalAssets: 364_980_000_000,
    totalLiabilities: 308_030_000_000,
    totalStockholdersEquity: 56_950_000_000,
  },
]

const mockCashFlows = [
  {
    date: "2025-09-27",
    calendarYear: "2025",
    operatingCashFlow: 118_254_000_000,
    capitalExpenditure: -9_447_000_000,
    freeCashFlow: 108_807_000_000,
    depreciationAndAmortization: 11_445_000_000,
  },
]

const mockProfile = [
  {
    symbol: TEST_TICKER,
    companyName: "Apple Inc.",
    sector: "Technology",
    country: "US",
    price: 213.49,
    mktCap: 3_240_000_000_000,
    volAvg: 50_000_000,
    beta: 1.24,
  },
]

const mockSharesOutstanding = {
  symbol: TEST_TICKER,
  sharesOutstanding: 15_204_137_000,
}

const server = setupServer(
  http.get(`${FMP_BASE}/income-statement/${TEST_TICKER}`, ({ request }) => {
    const url = new URL(request.url)
    if (url.searchParams.get("apikey") !== TEST_API_KEY) {
      return HttpResponse.json({ error: "Invalid API key" }, { status: 401 })
    }
    return HttpResponse.json(mockIncomeStatements)
  }),
  http.get(`${FMP_BASE}/balance-sheet-statement/${TEST_TICKER}`, () =>
    HttpResponse.json(mockBalanceSheets),
  ),
  http.get(`${FMP_BASE}/cash-flow-statement/${TEST_TICKER}`, () =>
    HttpResponse.json(mockCashFlows),
  ),
  http.get(`${FMP_BASE}/profile/${TEST_TICKER}`, () =>
    HttpResponse.json(mockProfile),
  ),
  http.get(`${FMP_BASE}/shares_float/${TEST_TICKER}`, () =>
    HttpResponse.json(mockSharesOutstanding),
  ),
)

describe("FMP adapter", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterAll(() => server.close())

  it("fetches income statements, balance sheets, and cash flows for a ticker", async () => {
    const adapter = createFmpAdapter({ apiKey: TEST_API_KEY })
    const result = await adapter.fetchFinancials(TEST_TICKER, 2)

    expect(result.ticker).toBe(TEST_TICKER)
    expect(result.companyName).toBe("Apple Inc.")
    expect(result.sector).toBe("Technology")
    expect(result.country).toBe("US")

    expect(result.incomeStatements).toHaveLength(2)
    expect(result.incomeStatements[0]!.fiscalYear).toBe(2025)
    expect(result.incomeStatements[0]!.revenue).toBe(391_035_000_000)
    expect(result.incomeStatements[0]!.cogs).toBe(210_352_000_000)

    expect(result.balanceSheets).toHaveLength(1)
    expect(result.balanceSheets[0]!.cashAndEquivalents).toBe(29_943_000_000)
    expect(result.balanceSheets[0]!.totalDebt).toBe(101_304_000_000)

    expect(result.cashFlows).toHaveLength(1)
    expect(result.cashFlows[0]!.freeCashFlow).toBe(108_807_000_000)
    expect(result.cashFlows[0]!.da).toBe(11_445_000_000)
  })

  it("fetches market data for a ticker", async () => {
    const adapter = createFmpAdapter({ apiKey: TEST_API_KEY })
    const result = await adapter.fetchMarketData(TEST_TICKER)

    expect(result.ticker).toBe(TEST_TICKER)
    expect(result.price).toBe(213.49)
    expect(result.marketCap).toBe(3_240_000_000_000)
    expect(result.sharesOutstanding).toBe(15_204_137_000)
    expect(result.beta).toBe(1.24)
    expect(result.lastUpdated).toBeDefined()
  })

  it("returns isAvailable true when profile endpoint responds", async () => {
    const adapter = createFmpAdapter({ apiKey: TEST_API_KEY })
    const available = await adapter.isAvailable()
    expect(available).toBe(true)
  })

  it("returns isAvailable false when API key is invalid (401 response)", async () => {
    const adapter = createFmpAdapter({ apiKey: "wrong-key" })
    const available = await adapter.isAvailable()
    expect(available).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/data-adapters/fmp-adapter.test.ts
```

Expected: FAIL -- cannot find module `./fmp-adapter.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/data-adapters/fmp-adapter.ts`:
```typescript
import type {
  FinancialDataAdapter,
  RawFinancials,
  RawIncomeStatement,
  RawBalanceSheet,
  RawCashFlow,
  MarketData,
} from "./adapter-interface.js"

const BASE_URL = "https://financialmodelingprep.com/api/v3"

type FmpConfig = {
  readonly apiKey: string
}

type FmpIncomeRecord = {
  readonly calendarYear: string
  readonly revenue: number
  readonly costOfRevenue: number
  readonly grossProfit: number
  readonly operatingExpenses: number
  readonly ebitda: number
  readonly operatingIncome: number
  readonly interestExpense: number
  readonly netIncome: number
  readonly incomeTaxExpense: number
}

type FmpBalanceRecord = {
  readonly calendarYear: string
  readonly cashAndCashEquivalents: number
  readonly netReceivables: number
  readonly inventory: number
  readonly propertyPlantEquipmentNet: number
  readonly totalDebt: number
  readonly accountPayables: number
  readonly totalAssets: number
  readonly totalLiabilities: number
  readonly totalStockholdersEquity: number
}

type FmpCashFlowRecord = {
  readonly calendarYear: string
  readonly operatingCashFlow: number
  readonly capitalExpenditure: number
  readonly freeCashFlow: number
  readonly depreciationAndAmortization: number
}

type FmpProfile = {
  readonly symbol: string
  readonly companyName: string
  readonly sector: string
  readonly country: string
  readonly price: number
  readonly mktCap: number
  readonly beta: number
}

type FmpSharesFloat = {
  readonly sharesOutstanding: number
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`FMP request failed: ${response.status} ${url}`)
  }
  return response.json() as Promise<T>
}

function mapIncomeStatement(record: FmpIncomeRecord): RawIncomeStatement {
  return {
    fiscalYear: Number(record.calendarYear),
    revenue: record.revenue,
    cogs: record.costOfRevenue,
    grossProfit: record.grossProfit,
    operatingExpenses: record.operatingExpenses,
    ebitda: record.ebitda,
    ebit: record.operatingIncome,
    interestExpense: record.interestExpense,
    netIncome: record.netIncome,
    taxProvision: record.incomeTaxExpense,
  }
}

function mapBalanceSheet(record: FmpBalanceRecord): RawBalanceSheet {
  return {
    fiscalYear: Number(record.calendarYear),
    cashAndEquivalents: record.cashAndCashEquivalents,
    accountsReceivable: record.netReceivables,
    inventory: record.inventory,
    ppe: record.propertyPlantEquipmentNet,
    totalDebt: record.totalDebt,
    accountsPayable: record.accountPayables,
    totalAssets: record.totalAssets,
    totalLiabilities: record.totalLiabilities,
    totalEquity: record.totalStockholdersEquity,
  }
}

function mapCashFlow(record: FmpCashFlowRecord): RawCashFlow {
  return {
    fiscalYear: Number(record.calendarYear),
    operatingCashFlow: record.operatingCashFlow,
    capex: Math.abs(record.capitalExpenditure),
    freeCashFlow: record.freeCashFlow,
    da: record.depreciationAndAmortization,
  }
}

function createFmpAdapter(config: FmpConfig): FinancialDataAdapter {
  const key = config.apiKey

  async function fetchFinancials(ticker: string, years: number): Promise<RawFinancials> {
    const [incomeRaw, balanceRaw, cashRaw, profileRaw] = await Promise.all([
      fetchJson<FmpIncomeRecord[]>(
        `${BASE_URL}/income-statement/${ticker}?limit=${years}&apikey=${key}`,
      ),
      fetchJson<FmpBalanceRecord[]>(
        `${BASE_URL}/balance-sheet-statement/${ticker}?limit=${years}&apikey=${key}`,
      ),
      fetchJson<FmpCashFlowRecord[]>(
        `${BASE_URL}/cash-flow-statement/${ticker}?limit=${years}&apikey=${key}`,
      ),
      fetchJson<FmpProfile[]>(
        `${BASE_URL}/profile/${ticker}?apikey=${key}`,
      ),
    ])

    const profile = profileRaw[0]
    if (!profile) {
      throw new Error(`FMP: no profile found for ${ticker}`)
    }

    return {
      ticker,
      companyName: profile.companyName,
      sector: profile.sector,
      country: profile.country,
      incomeStatements: incomeRaw.map(mapIncomeStatement),
      balanceSheets: balanceRaw.map(mapBalanceSheet),
      cashFlows: cashRaw.map(mapCashFlow),
    }
  }

  async function fetchMarketData(ticker: string): Promise<MarketData> {
    const [profileRaw, sharesRaw] = await Promise.all([
      fetchJson<FmpProfile[]>(`${BASE_URL}/profile/${ticker}?apikey=${key}`),
      fetchJson<FmpSharesFloat>(`${BASE_URL}/shares_float/${ticker}?apikey=${key}`),
    ])

    const profile = profileRaw[0]
    if (!profile) {
      throw new Error(`FMP: no profile found for ${ticker}`)
    }

    return {
      ticker,
      price: profile.price,
      marketCap: profile.mktCap,
      sharesOutstanding: sharesRaw.sharesOutstanding,
      beta: profile.beta,
      fiftyTwoWeekHigh: 0,
      fiftyTwoWeekLow: 0,
      lastUpdated: new Date().toISOString(),
    }
  }

  async function isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${BASE_URL}/profile/AAPL?apikey=${key}`)
      return response.ok
    } catch {
      return false
    }
  }

  return {
    name: "fmp",
    fetchFinancials,
    fetchMarketData,
    isAvailable,
  }
}

export { createFmpAdapter }
export type { FmpConfig }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/data-adapters/fmp-adapter.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/data-adapters/fmp-adapter.*
git commit --no-gpg-sign -m "feat: add FMP financial data adapter with MSW-mocked tests"
```

---

### Task 9: Yahoo Finance Adapter

**Files:**
- Create: `packages/server/src/data-adapters/yahoo-adapter.ts`
- Create: `packages/server/src/data-adapters/yahoo-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/data-adapters/yahoo-adapter.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { createYahooAdapter } from "./yahoo-adapter.js"

const TEST_TICKER = "AAPL"

const mockQuoteSummary = {
  incomeStatementHistory: {
    incomeStatementHistory: [
      {
        endDate: { raw: 1727395200 },
        totalRevenue: { raw: 391_035_000_000 },
        costOfRevenue: { raw: 210_352_000_000 },
        grossProfit: { raw: 180_683_000_000 },
        totalOperatingExpenses: { raw: 267_819_000_000 },
        ebit: { raw: 123_216_000_000 },
        interestExpense: { raw: -3_931_000_000 },
        netIncome: { raw: 93_736_000_000 },
        incomeTaxExpense: { raw: 29_749_000_000 },
      },
    ],
  },
  balanceSheetHistory: {
    balanceSheetStatements: [
      {
        endDate: { raw: 1727395200 },
        cash: { raw: 29_943_000_000 },
        netReceivables: { raw: 68_794_000_000 },
        inventory: { raw: 7_286_000_000 },
        propertyPlantEquipment: { raw: 37_378_000_000 },
        longTermDebt: { raw: 95_281_000_000 },
        shortLongTermDebt: { raw: 6_023_000_000 },
        accountsPayable: { raw: 68_960_000_000 },
        totalAssets: { raw: 364_980_000_000 },
        totalLiab: { raw: 308_030_000_000 },
        totalStockholderEquity: { raw: 56_950_000_000 },
      },
    ],
  },
  cashflowStatementHistory: {
    cashflowStatements: [
      {
        endDate: { raw: 1727395200 },
        totalCashFromOperatingActivities: { raw: 118_254_000_000 },
        capitalExpenditures: { raw: -9_447_000_000 },
        freeCashFlow: { raw: 108_807_000_000 },
        depreciation: { raw: 11_445_000_000 },
      },
    ],
  },
  price: {
    symbol: TEST_TICKER,
    shortName: "Apple Inc.",
    regularMarketPrice: { raw: 213.49 },
    marketCap: { raw: 3_240_000_000_000 },
    sharesOutstanding: { raw: 15_204_137_000 },
    beta: { raw: 1.24 },
    fiftyTwoWeekHigh: { raw: 237.23 },
    fiftyTwoWeekLow: { raw: 164.08 },
  },
  assetProfile: {
    sector: "Technology",
    country: "United States",
  },
}

vi.mock("yahoo-finance2", () => ({
  default: {
    quoteSummary: vi.fn().mockResolvedValue(mockQuoteSummary),
  },
}))

describe("Yahoo Finance adapter", () => {
  it("fetches financials by parsing quoteSummary income/balance/cashflow history", async () => {
    const adapter = createYahooAdapter()
    const result = await adapter.fetchFinancials(TEST_TICKER, 1)

    expect(result.ticker).toBe(TEST_TICKER)
    expect(result.companyName).toBe("Apple Inc.")
    expect(result.sector).toBe("Technology")

    expect(result.incomeStatements).toHaveLength(1)
    expect(result.incomeStatements[0]!.revenue).toBe(391_035_000_000)
    expect(result.incomeStatements[0]!.cogs).toBe(210_352_000_000)
    expect(result.incomeStatements[0]!.interestExpense).toBe(3_931_000_000)

    expect(result.balanceSheets).toHaveLength(1)
    expect(result.balanceSheets[0]!.cashAndEquivalents).toBe(29_943_000_000)
    expect(result.balanceSheets[0]!.totalDebt).toBe(101_304_000_000)

    expect(result.cashFlows).toHaveLength(1)
    expect(result.cashFlows[0]!.capex).toBe(9_447_000_000)
    expect(result.cashFlows[0]!.da).toBe(11_445_000_000)
  })

  it("fetches market data from the price module", async () => {
    const adapter = createYahooAdapter()
    const result = await adapter.fetchMarketData(TEST_TICKER)

    expect(result.ticker).toBe(TEST_TICKER)
    expect(result.price).toBe(213.49)
    expect(result.marketCap).toBe(3_240_000_000_000)
    expect(result.sharesOutstanding).toBe(15_204_137_000)
    expect(result.beta).toBe(1.24)
    expect(result.fiftyTwoWeekHigh).toBe(237.23)
    expect(result.fiftyTwoWeekLow).toBe(164.08)
  })

  it("reports isAvailable true when quoteSummary resolves", async () => {
    const adapter = createYahooAdapter()
    const available = await adapter.isAvailable()
    expect(available).toBe(true)
  })

  it("reports isAvailable false when quoteSummary throws", async () => {
    const yahoo = await import("yahoo-finance2")
    vi.spyOn(yahoo.default, "quoteSummary").mockRejectedValueOnce(
      new Error("network error"),
    )

    const adapter = createYahooAdapter()
    const available = await adapter.isAvailable()
    expect(available).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/data-adapters/yahoo-adapter.test.ts
```

Expected: FAIL -- cannot find module `./yahoo-adapter.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/data-adapters/yahoo-adapter.ts`:
```typescript
import yahooFinance from "yahoo-finance2"
import type {
  FinancialDataAdapter,
  RawFinancials,
  RawIncomeStatement,
  RawBalanceSheet,
  RawCashFlow,
  MarketData,
} from "./adapter-interface.js"

type WithRaw<T> = { raw: T }

type YahooIncomeStatement = {
  readonly endDate: WithRaw<number>
  readonly totalRevenue?: WithRaw<number>
  readonly costOfRevenue?: WithRaw<number>
  readonly grossProfit?: WithRaw<number>
  readonly totalOperatingExpenses?: WithRaw<number>
  readonly ebit?: WithRaw<number>
  readonly interestExpense?: WithRaw<number>
  readonly netIncome?: WithRaw<number>
  readonly incomeTaxExpense?: WithRaw<number>
}

type YahooBalanceSheet = {
  readonly endDate: WithRaw<number>
  readonly cash?: WithRaw<number>
  readonly netReceivables?: WithRaw<number>
  readonly inventory?: WithRaw<number>
  readonly propertyPlantEquipment?: WithRaw<number>
  readonly longTermDebt?: WithRaw<number>
  readonly shortLongTermDebt?: WithRaw<number>
  readonly accountsPayable?: WithRaw<number>
  readonly totalAssets?: WithRaw<number>
  readonly totalLiab?: WithRaw<number>
  readonly totalStockholderEquity?: WithRaw<number>
}

type YahooCashFlow = {
  readonly endDate: WithRaw<number>
  readonly totalCashFromOperatingActivities?: WithRaw<number>
  readonly capitalExpenditures?: WithRaw<number>
  readonly freeCashFlow?: WithRaw<number>
  readonly depreciation?: WithRaw<number>
}

type YahooQuoteSummary = {
  readonly incomeStatementHistory?: {
    readonly incomeStatementHistory: readonly YahooIncomeStatement[]
  }
  readonly balanceSheetHistory?: {
    readonly balanceSheetStatements: readonly YahooBalanceSheet[]
  }
  readonly cashflowStatementHistory?: {
    readonly cashflowStatements: readonly YahooCashFlow[]
  }
  readonly price?: {
    readonly symbol: string
    readonly shortName?: string
    readonly regularMarketPrice?: WithRaw<number>
    readonly marketCap?: WithRaw<number>
    readonly sharesOutstanding?: WithRaw<number>
    readonly beta?: WithRaw<number>
    readonly fiftyTwoWeekHigh?: WithRaw<number>
    readonly fiftyTwoWeekLow?: WithRaw<number>
  }
  readonly assetProfile?: {
    readonly sector?: string
    readonly country?: string
  }
}

function rawVal(field: WithRaw<number> | undefined, fallback = 0): number {
  return field?.raw ?? fallback
}

function fiscalYearFromTimestamp(ts: number): number {
  return new Date(ts * 1000).getFullYear()
}

function mapIncomeStatement(record: YahooIncomeStatement): RawIncomeStatement {
  return {
    fiscalYear: fiscalYearFromTimestamp(record.endDate.raw),
    revenue: rawVal(record.totalRevenue),
    cogs: rawVal(record.costOfRevenue),
    grossProfit: rawVal(record.grossProfit),
    operatingExpenses: rawVal(record.totalOperatingExpenses),
    ebitda: rawVal(record.ebit),
    ebit: rawVal(record.ebit),
    interestExpense: Math.abs(rawVal(record.interestExpense)),
    netIncome: rawVal(record.netIncome),
    taxProvision: rawVal(record.incomeTaxExpense),
  }
}

function mapBalanceSheet(record: YahooBalanceSheet): RawBalanceSheet {
  const longTermDebt = rawVal(record.longTermDebt)
  const shortTermDebt = rawVal(record.shortLongTermDebt)
  return {
    fiscalYear: fiscalYearFromTimestamp(record.endDate.raw),
    cashAndEquivalents: rawVal(record.cash),
    accountsReceivable: rawVal(record.netReceivables),
    inventory: rawVal(record.inventory),
    ppe: rawVal(record.propertyPlantEquipment),
    totalDebt: longTermDebt + shortTermDebt,
    accountsPayable: rawVal(record.accountsPayable),
    totalAssets: rawVal(record.totalAssets),
    totalLiabilities: rawVal(record.totalLiab),
    totalEquity: rawVal(record.totalStockholderEquity),
  }
}

function mapCashFlow(record: YahooCashFlow): RawCashFlow {
  return {
    fiscalYear: fiscalYearFromTimestamp(record.endDate.raw),
    operatingCashFlow: rawVal(record.totalCashFromOperatingActivities),
    capex: Math.abs(rawVal(record.capitalExpenditures)),
    freeCashFlow: rawVal(record.freeCashFlow),
    da: rawVal(record.depreciation),
  }
}

function createYahooAdapter(): FinancialDataAdapter {
  async function fetchFinancials(ticker: string, years: number): Promise<RawFinancials> {
    const summary = (await yahooFinance.quoteSummary(ticker, {
      modules: [
        "incomeStatementHistory",
        "balanceSheetHistory",
        "cashflowStatementHistory",
        "price",
        "assetProfile",
      ],
    })) as YahooQuoteSummary

    const incomeRaw = summary.incomeStatementHistory?.incomeStatementHistory ?? []
    const balanceRaw = summary.balanceSheetHistory?.balanceSheetStatements ?? []
    const cashRaw = summary.cashflowStatementHistory?.cashflowStatements ?? []

    return {
      ticker,
      companyName: summary.price?.shortName ?? ticker,
      sector: summary.assetProfile?.sector ?? "Unknown",
      country: summary.assetProfile?.country ?? "Unknown",
      incomeStatements: incomeRaw.slice(0, years).map(mapIncomeStatement),
      balanceSheets: balanceRaw.slice(0, years).map(mapBalanceSheet),
      cashFlows: cashRaw.slice(0, years).map(mapCashFlow),
    }
  }

  async function fetchMarketData(ticker: string): Promise<MarketData> {
    const summary = (await yahooFinance.quoteSummary(ticker, {
      modules: ["price"],
    })) as YahooQuoteSummary

    const price = summary.price

    return {
      ticker,
      price: rawVal(price?.regularMarketPrice),
      marketCap: rawVal(price?.marketCap),
      sharesOutstanding: rawVal(price?.sharesOutstanding),
      beta: rawVal(price?.beta),
      fiftyTwoWeekHigh: rawVal(price?.fiftyTwoWeekHigh),
      fiftyTwoWeekLow: rawVal(price?.fiftyTwoWeekLow),
      lastUpdated: new Date().toISOString(),
    }
  }

  async function isAvailable(): Promise<boolean> {
    try {
      await yahooFinance.quoteSummary("AAPL", { modules: ["price"] })
      return true
    } catch {
      return false
    }
  }

  return {
    name: "yahoo",
    fetchFinancials,
    fetchMarketData,
    isAvailable,
  }
}

export { createYahooAdapter }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/data-adapters/yahoo-adapter.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/data-adapters/yahoo-adapter.*
git commit --no-gpg-sign -m "feat: add Yahoo Finance adapter via yahoo-finance2 with vi.mock tests"
```

---

### Task 10: SEC EDGAR Adapter

**Files:**
- Create: `packages/server/src/data-adapters/edgar-adapter.ts`
- Create: `packages/server/src/data-adapters/edgar-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/data-adapters/edgar-adapter.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"
import { createEdgarAdapter } from "./edgar-adapter.js"

const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index"
const EDGAR_BROWSE = "https://www.sec.gov/cgi-bin/browse-edgar"
const EDGAR_FILINGS = "https://data.sec.gov/submissions"

const TEST_TICKER = "AAPL"
const TEST_CIK = "0000320193"
const TEST_ACCESSION = "0000320193-25-000123"
const TEST_ACCESSION_CLEAN = TEST_ACCESSION.replace(/-/g, "")

const mockSearchResponse = {
  hits: {
    hits: [
      {
        _source: {
          period_of_report: "2025-09-27",
          entity_name: "Apple Inc.",
          file_date: "2025-11-01",
          accession_no: TEST_ACCESSION,
          form_type: "10-K",
        },
      },
    ],
    total: { value: 1 },
  },
}

const mockBrowseResponse = `
<html>
  <body>
    <input name="CIK" value="${TEST_CIK}" />
  </body>
</html>
`

const mockSubmissions = {
  cik: TEST_CIK,
  name: "Apple Inc.",
  filings: {
    recent: {
      accessionNumber: [TEST_ACCESSION_CLEAN],
      form: ["10-K"],
      filingDate: ["2025-11-01"],
      primaryDocument: ["aapl-20250927.htm"],
      reportDate: ["2025-09-27"],
    },
  },
}

const mockFilingIndex = {
  directory: {
    item: [
      { name: "aapl-20250927.htm", type: "10-K", description: "Annual report" },
      { name: "aapl-20250927_htm.xml", type: "XML", description: "XBRL instance" },
    ],
  },
}

const mockFilingHtml = `
<html>
<body>
<p>Apple Inc. Annual Report on Form 10-K for fiscal year ended September 27, 2025.</p>
<p>Our primary supplier for advanced logic chips is Taiwan Semiconductor Manufacturing Company.</p>
<p>We also source components from Broadcom Inc. and Qualcomm Incorporated.</p>
</body>
</html>
`

const server = setupServer(
  http.get(EDGAR_SEARCH, () => HttpResponse.json(mockSearchResponse)),
  http.get(EDGAR_BROWSE, () => new HttpResponse(mockBrowseResponse, {
    headers: { "Content-Type": "text/html" },
  })),
  http.get(`${EDGAR_FILINGS}/${TEST_CIK}.json`, () =>
    HttpResponse.json(mockSubmissions),
  ),
  http.get(
    `https://www.sec.gov/Archives/edgar/data/${TEST_CIK.replace(/^0+/, "")}/${TEST_ACCESSION_CLEAN}/index.json`,
    () => HttpResponse.json(mockFilingIndex),
  ),
  http.get(
    `https://www.sec.gov/Archives/edgar/data/${TEST_CIK.replace(/^0+/, "")}/${TEST_ACCESSION_CLEAN}/aapl-20250927.htm`,
    () => new HttpResponse(mockFilingHtml, {
      headers: { "Content-Type": "text/html" },
    }),
  ),
)

describe("SEC EDGAR adapter", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterAll(() => server.close())

  it("searches for recent 10-K filings by ticker", async () => {
    const adapter = createEdgarAdapter()
    const filings = await adapter.searchFilings(TEST_TICKER, "10-K", 1)

    expect(filings).toHaveLength(1)
    expect(filings[0]!.form).toBe("10-K")
    expect(filings[0]!.ticker).toBe(TEST_TICKER)
    expect(filings[0]!.accessionNumber).toBe(TEST_ACCESSION)
    expect(filings[0]!.filingDate).toBe("2025-11-01")
  })

  it("resolves CIK for a given ticker", async () => {
    const adapter = createEdgarAdapter()
    const cik = await adapter.resolveCik(TEST_TICKER)
    expect(cik).toBe(TEST_CIK)
  })

  it("fetches the raw text of the primary filing document", async () => {
    const adapter = createEdgarAdapter()
    const text = await adapter.fetchFilingText(TEST_TICKER, TEST_ACCESSION)

    expect(text).toContain("Apple Inc.")
    expect(text).toContain("Taiwan Semiconductor Manufacturing Company")
    expect(text).toContain("Broadcom Inc.")
  })

  it("lists recent filings from submissions endpoint", async () => {
    const adapter = createEdgarAdapter()
    const filings = await adapter.listRecentFilings(TEST_CIK, "10-K", 1)

    expect(filings).toHaveLength(1)
    expect(filings[0]!.form).toBe("10-K")
    expect(filings[0]!.accessionNumber).toBe(TEST_ACCESSION)
    expect(filings[0]!.primaryDocument).toBe("aapl-20250927.htm")
  })

  it("isAvailable always returns true (EDGAR requires no API key)", async () => {
    const adapter = createEdgarAdapter()
    const available = await adapter.isAvailable()
    expect(available).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/data-adapters/edgar-adapter.test.ts
```

Expected: FAIL -- cannot find module `./edgar-adapter.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/data-adapters/edgar-adapter.ts`:
```typescript
const EDGAR_SEARCH_BASE = "https://efts.sec.gov/LATEST/search-index"
const EDGAR_BROWSE_BASE = "https://www.sec.gov/cgi-bin/browse-edgar"
const EDGAR_SUBMISSIONS_BASE = "https://data.sec.gov/submissions"
const EDGAR_ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data"

type FilingRecord = {
  readonly ticker: string
  readonly form: string
  readonly accessionNumber: string
  readonly filingDate: string
  readonly reportDate: string
  readonly primaryDocument: string
}

type EdgarAdapter = {
  readonly name: string
  readonly searchFilings: (
    ticker: string,
    form: string,
    limit: number,
  ) => Promise<readonly FilingRecord[]>
  readonly resolveCik: (ticker: string) => Promise<string>
  readonly fetchFilingText: (ticker: string, accessionNumber: string) => Promise<string>
  readonly listRecentFilings: (
    cik: string,
    form: string,
    limit: number,
  ) => Promise<readonly FilingRecord[]>
  readonly isAvailable: () => Promise<boolean>
}

type EdgarSearchHit = {
  readonly _source: {
    readonly period_of_report: string
    readonly entity_name: string
    readonly file_date: string
    readonly accession_no: string
    readonly form_type: string
  }
}

type EdgarSearchResponse = {
  readonly hits: {
    readonly hits: readonly EdgarSearchHit[]
    readonly total: { readonly value: number }
  }
}

type EdgarSubmissions = {
  readonly cik: string
  readonly name: string
  readonly filings: {
    readonly recent: {
      readonly accessionNumber: readonly string[]
      readonly form: readonly string[]
      readonly filingDate: readonly string[]
      readonly primaryDocument: readonly string[]
      readonly reportDate: readonly string[]
    }
  }
}

type EdgarFilingIndexItem = {
  readonly name: string
  readonly type: string
  readonly description: string
}

type EdgarFilingIndex = {
  readonly directory: {
    readonly item: readonly EdgarFilingIndexItem[]
  }
}

function formatAccession(raw: string): string {
  const clean = raw.replace(/-/g, "")
  return `${clean.slice(0, 10)}-${clean.slice(10, 12)}-${clean.slice(12)}`
}

function cleanCik(cik: string): string {
  return cik.replace(/^0+/, "")
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "tori-project research@example.com" },
  })
  if (!response.ok) {
    throw new Error(`EDGAR request failed: ${response.status} ${url}`)
  }
  return response.text()
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": "tori-project research@example.com" },
  })
  if (!response.ok) {
    throw new Error(`EDGAR request failed: ${response.status} ${url}`)
  }
  return response.json() as Promise<T>
}

function createEdgarAdapter(): EdgarAdapter {
  async function searchFilings(
    ticker: string,
    form: string,
    limit: number,
  ): Promise<readonly FilingRecord[]> {
    const url =
      `${EDGAR_SEARCH_BASE}?q=%22${ticker}%22&dateRange=custom` +
      `&startdt=2020-01-01&forms=${form}&hits.hits._source.form_type=${form}` +
      `&hits.hits.total.relation=eq&hits.hits._source.period_of_report=*`

    const data = await fetchJson<EdgarSearchResponse>(url)
    const hits = data.hits.hits.slice(0, limit)

    return hits.map((hit) => ({
      ticker,
      form: hit._source.form_type,
      accessionNumber: hit._source.accession_no,
      filingDate: hit._source.file_date,
      reportDate: hit._source.period_of_report,
      primaryDocument: "",
    }))
  }

  async function resolveCik(ticker: string): Promise<string> {
    const url = `${EDGAR_BROWSE_BASE}?company=${ticker}&CIK=${ticker}&type=10-K&dateb=&owner=include&count=1&search_text=&action=getcompany`
    const html = await fetchText(url)

    const match = html.match(/name="CIK"\s+value="(\d+)"/i)
    if (!match || !match[1]) {
      throw new Error(`EDGAR: could not resolve CIK for ticker ${ticker}`)
    }
    return match[1].padStart(10, "0")
  }

  async function listRecentFilings(
    cik: string,
    form: string,
    limit: number,
  ): Promise<readonly FilingRecord[]> {
    const paddedCik = cik.padStart(10, "0")
    const data = await fetchJson<EdgarSubmissions>(
      `${EDGAR_SUBMISSIONS_BASE}/${paddedCik}.json`,
    )

    const recent = data.filings.recent
    const results: FilingRecord[] = []

    for (let i = 0; i < recent.form.length && results.length < limit; i++) {
      if (recent.form[i] !== form) continue

      const rawAccession = recent.accessionNumber[i] ?? ""
      const formatted = formatAccession(rawAccession)

      results.push({
        ticker: "",
        form: recent.form[i] ?? form,
        accessionNumber: formatted,
        filingDate: recent.filingDate[i] ?? "",
        reportDate: recent.reportDate[i] ?? "",
        primaryDocument: recent.primaryDocument[i] ?? "",
      })
    }

    return results
  }

  async function fetchFilingText(
    ticker: string,
    accessionNumber: string,
  ): Promise<string> {
    const cik = await resolveCik(ticker)
    const cikClean = cleanCik(cik)
    const accessionClean = accessionNumber.replace(/-/g, "")

    const indexUrl =
      `${EDGAR_ARCHIVES_BASE}/${cikClean}/${accessionClean}/index.json`
    const index = await fetchJson<EdgarFilingIndex>(indexUrl)

    const items = Array.isArray(index.directory.item)
      ? index.directory.item
      : [index.directory.item]

    const primaryDoc = items.find(
      (item) =>
        item.type === "10-K" ||
        item.type === "10-Q" ||
        item.name.endsWith(".htm") ||
        item.name.endsWith(".html"),
    )

    if (!primaryDoc) {
      throw new Error(
        `EDGAR: no primary document found for accession ${accessionNumber}`,
      )
    }

    const docUrl =
      `${EDGAR_ARCHIVES_BASE}/${cikClean}/${accessionClean}/${primaryDoc.name}`
    return fetchText(docUrl)
  }

  async function isAvailable(): Promise<boolean> {
    return true
  }

  return {
    name: "edgar",
    searchFilings,
    resolveCik,
    fetchFilingText,
    listRecentFilings,
    isAvailable,
  }
}

export { createEdgarAdapter }
export type { EdgarAdapter, FilingRecord }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/data-adapters/edgar-adapter.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/data-adapters/edgar-adapter.*
git commit --no-gpg-sign -m "feat: add SEC EDGAR adapter for filing search and text extraction"
```

---

### Task 11: Adapter Orchestrator

**Files:**
- Create: `packages/server/src/data-adapters/orchestrator.ts`
- Create: `packages/server/src/data-adapters/orchestrator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/data-adapters/orchestrator.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import { createAdapterOrchestrator } from "./orchestrator.js"
import type { FinancialDataAdapter, RawFinancials, MarketData } from "./adapter-interface.js"

const TEST_TICKER = "AAPL"

function makeRawFinancials(ticker: string): RawFinancials {
  return {
    ticker,
    companyName: "Apple Inc.",
    sector: "Technology",
    country: "US",
    incomeStatements: [],
    balanceSheets: [],
    cashFlows: [],
  }
}

function makeMarketData(ticker: string): MarketData {
  return {
    ticker,
    price: 200.0,
    marketCap: 3_000_000_000_000,
    sharesOutstanding: 15_000_000_000,
    beta: 1.2,
    fiftyTwoWeekHigh: 240.0,
    fiftyTwoWeekLow: 160.0,
    lastUpdated: "2026-01-01T00:00:00.000Z",
  }
}

function makeAdapter(
  name: string,
  available: boolean,
  financials?: RawFinancials,
  marketData?: MarketData,
): FinancialDataAdapter {
  return {
    name,
    isAvailable: vi.fn().mockResolvedValue(available),
    fetchFinancials: vi.fn().mockResolvedValue(financials ?? makeRawFinancials(TEST_TICKER)),
    fetchMarketData: vi.fn().mockResolvedValue(marketData ?? makeMarketData(TEST_TICKER)),
  }
}

describe("adapter orchestrator", () => {
  it("uses the primary adapter when it is available", async () => {
    const primary = makeAdapter("fmp", true)
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    await orchestrator.fetchFinancials(TEST_TICKER, 3)

    expect(primary.isAvailable).toHaveBeenCalledOnce()
    expect(primary.fetchFinancials).toHaveBeenCalledWith(TEST_TICKER, 3)
    expect(fallback.fetchFinancials).not.toHaveBeenCalled()
  })

  it("falls back to secondary adapter when primary is unavailable", async () => {
    const primary = makeAdapter("fmp", false)
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    const result = await orchestrator.fetchFinancials(TEST_TICKER, 3)

    expect(primary.isAvailable).toHaveBeenCalledOnce()
    expect(primary.fetchFinancials).not.toHaveBeenCalled()
    expect(fallback.fetchFinancials).toHaveBeenCalledWith(TEST_TICKER, 3)
    expect(result.ticker).toBe(TEST_TICKER)
  })

  it("falls back to secondary adapter when primary fetch throws", async () => {
    const primary = makeAdapter("fmp", true)
    vi.spyOn(primary, "fetchFinancials").mockRejectedValueOnce(
      new Error("rate limited"),
    )
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    const result = await orchestrator.fetchFinancials(TEST_TICKER, 3)

    expect(fallback.fetchFinancials).toHaveBeenCalledWith(TEST_TICKER, 3)
    expect(result.ticker).toBe(TEST_TICKER)
  })

  it("uses primary adapter for market data when available", async () => {
    const primary = makeAdapter("fmp", true)
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    await orchestrator.fetchMarketData(TEST_TICKER)

    expect(primary.fetchMarketData).toHaveBeenCalledWith(TEST_TICKER)
    expect(fallback.fetchMarketData).not.toHaveBeenCalled()
  })

  it("falls back to secondary for market data when primary is unavailable", async () => {
    const primary = makeAdapter("fmp", false)
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    const result = await orchestrator.fetchMarketData(TEST_TICKER)

    expect(fallback.fetchMarketData).toHaveBeenCalledWith(TEST_TICKER)
    expect(result.ticker).toBe(TEST_TICKER)
  })

  it("throws when both adapters are unavailable", async () => {
    const primary = makeAdapter("fmp", false)
    const fallback = makeAdapter("yahoo", false)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    await expect(orchestrator.fetchFinancials(TEST_TICKER, 3)).rejects.toThrow(
      "No financial data adapter available",
    )
  })

  it("throws when both adapters fail to fetch", async () => {
    const primary = makeAdapter("fmp", true)
    const fallback = makeAdapter("yahoo", true)
    vi.spyOn(primary, "fetchFinancials").mockRejectedValueOnce(new Error("fmp error"))
    vi.spyOn(fallback, "fetchFinancials").mockRejectedValueOnce(new Error("yahoo error"))
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    await expect(orchestrator.fetchFinancials(TEST_TICKER, 3)).rejects.toThrow(
      "No financial data adapter available",
    )
  })

  it("reports available true when at least one adapter is available", async () => {
    const primary = makeAdapter("fmp", false)
    const fallback = makeAdapter("yahoo", true)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    const available = await orchestrator.isAvailable()
    expect(available).toBe(true)
  })

  it("reports available false when no adapter is available", async () => {
    const primary = makeAdapter("fmp", false)
    const fallback = makeAdapter("yahoo", false)
    const orchestrator = createAdapterOrchestrator({ primary, fallback })

    const available = await orchestrator.isAvailable()
    expect(available).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/data-adapters/orchestrator.test.ts
```

Expected: FAIL -- cannot find module `./orchestrator.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/data-adapters/orchestrator.ts`:
```typescript
import type {
  FinancialDataAdapter,
  RawFinancials,
  MarketData,
} from "./adapter-interface.js"

type OrchestratorConfig = {
  readonly primary: FinancialDataAdapter
  readonly fallback: FinancialDataAdapter
}

type OrchestratorAdapter = {
  readonly fetchFinancials: (ticker: string, years: number) => Promise<RawFinancials>
  readonly fetchMarketData: (ticker: string) => Promise<MarketData>
  readonly isAvailable: () => Promise<boolean>
}

async function tryWithFallback<T>(
  primary: FinancialDataAdapter,
  fallback: FinancialDataAdapter,
  operation: (adapter: FinancialDataAdapter) => Promise<T>,
): Promise<T> {
  const primaryAvailable = await primary.isAvailable()

  if (primaryAvailable) {
    try {
      return await operation(primary)
    } catch {
      // primary failed at fetch time -- try fallback
    }
  }

  const fallbackAvailable = await fallback.isAvailable()
  if (!fallbackAvailable) {
    throw new Error("No financial data adapter available")
  }

  try {
    return await operation(fallback)
  } catch {
    throw new Error("No financial data adapter available")
  }
}

function createAdapterOrchestrator(config: OrchestratorConfig): OrchestratorAdapter {
  const { primary, fallback } = config

  async function fetchFinancials(ticker: string, years: number): Promise<RawFinancials> {
    return tryWithFallback(primary, fallback, (adapter) =>
      adapter.fetchFinancials(ticker, years),
    )
  }

  async function fetchMarketData(ticker: string): Promise<MarketData> {
    return tryWithFallback(primary, fallback, (adapter) =>
      adapter.fetchMarketData(ticker),
    )
  }

  async function isAvailable(): Promise<boolean> {
    const [primaryOk, fallbackOk] = await Promise.all([
      primary.isAvailable(),
      fallback.isAvailable(),
    ])
    return primaryOk || fallbackOk
  }

  return {
    fetchFinancials,
    fetchMarketData,
    isAvailable,
  }
}

export { createAdapterOrchestrator }
export type { OrchestratorConfig, OrchestratorAdapter }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/data-adapters/orchestrator.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/data-adapters/orchestrator.*
git commit --no-gpg-sign -m "feat: add adapter orchestrator with FMP->Yahoo fallback strategy"
```

---

### Task 12: Data Adapters Barrel Export

**Files:**
- Create: `packages/server/src/data-adapters/index.ts`

- [ ] **Step 1: Create barrel export**

Create `packages/server/src/data-adapters/index.ts`:
```typescript
export type {
  RawIncomeStatement,
  RawBalanceSheet,
  RawCashFlow,
  RawFinancials,
  MarketData,
  FinancialDataAdapter,
} from "./adapter-interface.js"

export { createFmpAdapter } from "./fmp-adapter.js"
export type { FmpConfig } from "./fmp-adapter.js"

export { createYahooAdapter } from "./yahoo-adapter.js"

export { createEdgarAdapter } from "./edgar-adapter.js"
export type { EdgarAdapter, FilingRecord } from "./edgar-adapter.js"

export { createAdapterOrchestrator } from "./orchestrator.js"
export type { OrchestratorConfig, OrchestratorAdapter } from "./orchestrator.js"
```

- [ ] **Step 2: Run all data adapter tests**

```bash
pnpm --filter @tori/server test -- src/data-adapters/
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/data-adapters/index.ts
git commit --no-gpg-sign -m "feat: add data-adapters barrel export"
```

---

### Task 13: Full Phase 4 Test Run

- [ ] **Step 1: Run all server tests**

```bash
pnpm --filter @tori/server test
```

Expected: all tests PASS across dcf-engine, graph-engine, neo4j-client, and data-adapters

- [ ] **Step 2: TypeScript type check**

```bash
pnpm --filter @tori/server lint
```

Expected: no type errors

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit --no-gpg-sign -m "chore: phase 4 data layer complete -- neo4j client + data adapters"
```

---

That completes Phase 4. The data layer now:
- Connects to Neo4j with a typed driver wrapper
- Persists and retrieves Company nodes, SUPPLIES_TO relationships, FinancialModel nodes, and Scenario/TariffPolicy nodes
- Uses MERGE semantics for all writes (safe to call multiple times)
- Provides a pluggable FinancialDataAdapter interface
- Ships FMP adapter using plain fetch against the v3 API
- Ships Yahoo Finance adapter using the yahoo-finance2 package
- Ships SEC EDGAR adapter for filing search and full-text extraction
- Orchestrates adapters with FMP-first, Yahoo-fallback strategy
- All adapter tests use MSW for HTTP mocking with zero real API calls
- All Neo4j tests use the real Docker Compose instance with isolated test data prefixes
