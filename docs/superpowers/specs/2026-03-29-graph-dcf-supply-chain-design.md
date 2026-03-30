# Graph-Based DCF for Supply Chains -- Design Spec

**Date:** 2026-03-29
**Status:** Draft
**Approach:** Monolith-First Modular (Approach A)

---

## 1. Overview

A system that models companies as nodes in a supply chain graph, links them with revenue-dependency-weighted edges, runs full 3-statement DCF valuations per node, and propagates tariff/trade-policy shocks through the network to visualize cascading valuation impacts in real time.

**Core value proposition:** Instead of valuing a company in isolation, see how its valuation shifts when a tariff hits a supplier three layers deep in its dependency chain.

---

## 2. Architecture

### 2.1 High-Level

```
+---------------------------+
|     React SPA (Vite)      |
|  D3.js Graph + Dashboard  |
|  WebSocket Client         |
+----------+----------------+
           |
           | HTTP + WebSocket
           |
+----------v----------------+
|   Node.js Server (Express)|
|                           |
|  +---------------------+  |
|  | API Layer (REST+WS)  | |
|  +---------------------+  |
|  | Graph Engine (in-mem)| |
|  +---------------------+  |
|  | DCF Engine           | |
|  +---------------------+  |
|  | Data Adapters        | |
|  +---------------------+  |
|  | LLM Service (Groq)  | |
|  +---------------------+  |
+----------+----------------+
           |
    +------+------+
    |             |
+---v---+   +----v----+
| Neo4j |   | Redis   |
| (graph|   | (WS pub/|
| store)|   |  sub)   |
+-------+   +---------+
```

### 2.2 Containers (Docker Compose)

| Container | Image | Purpose |
|-----------|-------|---------|
| `app` | Custom Node.js | Express server + React static build |
| `neo4j` | neo4j:5 | Persistent graph storage, Cypher queries |
| `redis` | redis:7-alpine | WebSocket pub/sub, session cache |

### 2.3 Internal Modules (TypeScript)

All modules live in a single Node.js process but are isolated behind explicit interfaces. Each can be extracted to a service later without rewriting consumers.

| Module | Responsibility |
|--------|---------------|
| `@tori/graph-engine` | In-memory graph representation, traversal, shock propagation algorithms |
| `@tori/dcf-engine` | 3-statement financial model template, DCF calculation, sensitivity analysis |
| `@tori/data-adapters` | Pluggable adapters for financial data APIs (FMP, Yahoo Finance, SEC EDGAR) |
| `@tori/llm-service` | Groq API client, supply chain extraction prompts, structured output parsing |
| `@tori/api` | Express routes, WebSocket handlers, request validation |
| `@tori/neo4j-client` | Neo4j driver wrapper, Cypher query builders, graph persistence |

---

## 3. Data Model

### 3.1 Graph Schema (Neo4j)

```
(:Company {
  ticker: string,          // e.g. "AAPL"
  name: string,            // e.g. "Apple Inc."
  sector: string,
  country: string,
  marketCap: float,
  lastUpdated: datetime
})

(:Company)-[:SUPPLIES_TO {
  revenueWeight: float,    // 0.0-1.0, fraction of supplier revenue from this relationship
  productCategory: string, // e.g. "Advanced Logic Chips"
  confidence: float,       // LLM extraction confidence score
  source: string,          // "manual" | "llm" | "sec_filing"
  lastVerified: datetime
}]->(:Company)

(:Company)-[:HAS_MODEL]->(:FinancialModel)

(:FinancialModel {
  companyTicker: string,
  fiscalYear: int,
  // Income Statement drivers
  revenue: float,
  revenueGrowthRate: float,
  cogsPercent: float,
  sgaPercent: float,
  rdPercent: float,
  daPercent: float,
  interestExpense: float,
  taxRate: float,
  // Balance Sheet drivers
  cashAndEquivalents: float,
  accountsReceivable: float,
  inventory: float,
  ppe: float,
  totalDebt: float,
  accountsPayable: float,
  // Cash Flow drivers
  capexPercent: float,
  nwcChange: float,
  // DCF parameters
  wacc: float,
  terminalGrowthRate: float,
  projectionYears: int,
  // Overrides (sparse -- only populated where user deviates from template)
  overrides: JSON
})

(:Scenario {
  id: string,
  name: string,
  description: string,
  createdAt: datetime
})

(:Scenario)-[:CONTAINS_POLICY]->(:TariffPolicy)

(:TariffPolicy {
  id: string,
  scenarioId: string,
  name: string,             // e.g. "25% semiconductor tariff"
  tariffPercent: float,
  targetCountry: string,    // country being tariffed
  targetSector: string,     // optional sector filter
  targetProduct: string,    // optional product filter
  affectedEdges: [string],  // auto-computed or manually overridden edge IDs
})
```

### 3.2 In-Memory Graph (TypeScript)

The in-memory engine mirrors Neo4j's data but in a structure optimized for traversal and simulation:

```typescript
type CompanyNode = {
  readonly ticker: string
  readonly name: string
  readonly sector: string
  readonly country: string
  readonly financialModel: FinancialModel
  readonly computedDCF: DCFResult
}

type SupplyEdge = {
  readonly fromTicker: string
  readonly toTicker: string
  readonly revenueWeight: number
  readonly productCategory: string
}

type SupplyChainGraph = {
  readonly nodes: ReadonlyMap<string, CompanyNode>
  readonly edges: readonly SupplyEdge[]
  readonly adjacency: ReadonlyMap<string, readonly SupplyEdge[]>
}
```

---

## 4. Core Engines

### 4.1 DCF Engine

**Template-based 3-statement model:**

Each company node gets a standardized financial model with ~15 key drivers. The engine derives the full 3-statement output:

1. **Income Statement:** Revenue -> COGS -> Gross Profit -> SGA -> R&D -> EBITDA -> D&A -> EBIT -> Interest -> EBT -> Tax -> Net Income
2. **Balance Sheet:** Assets (Cash, AR, Inventory, PPE) = Liabilities (AP, Debt) + Equity. Driven by % of revenue assumptions.
3. **Cash Flow Statement:** Net Income + D&A - Changes in NWC - CapEx = Free Cash Flow

**DCF Calculation:**
- Project FCF for N years (default 5) using growth and margin drivers
- Terminal value via Gordon Growth Model: TV = FCF_terminal * (1 + g) / (WACC - g)
- Discount all cash flows back at WACC
- Enterprise Value = Sum of discounted FCFs + discounted Terminal Value
- Equity Value = EV - Net Debt
- Per-share value = Equity Value / Shares Outstanding

**Override mechanism:** Users can override any driver for any company. Overrides are stored as a sparse JSON object -- only non-default values are persisted. The engine merges: `templateDefaults <- apiData <- userOverrides`.

### 4.2 Graph Engine -- Shock Propagation

**Algorithm: Revenue-Weighted Cascade**

When a tariff shock is applied:

1. **Identify affected edges:** Match tariff policy (country + sector + product) against edge metadata. User can also manually select edges.
2. **Calculate direct impact:** For each affected edge, compute revenue reduction: `revenueHit = (supplierRevenue * edgeRevenueWeight) * tariffPercent * passthrough`. Passthrough is a configurable parameter (0-1) representing how much of the tariff cost is absorbed vs passed on.
3. **Propagate upstream:** For each directly affected company, recompute its financial model with reduced revenue. This changes its purchasing power, which reduces revenue for its suppliers proportionally to their `revenueWeight`.
4. **Iterate until convergence:** Continue propagation until the delta in any node's valuation drops below a threshold (e.g., < 0.1% change). Cap at a maximum iteration depth to prevent infinite loops in cyclic graphs.
5. **Compute deltas:** For every node, compare pre-shock DCF valuation to post-shock valuation. Store the delta.

**Output:** A map of `ticker -> { baselineValuation, shockedValuation, delta, percentChange }` for every node in the graph.

**Cycle handling:** Supply chains can have cycles (company A supplies B which supplies C which supplies A). The iterative propagation with convergence threshold handles this naturally -- values stabilize after a few iterations.

### 4.3 LLM Service (Groq)

**Purpose:** Extract supply chain relationships from text sources.

**Configuration:**
- Default model: `llama-3.3-70b-versatile`
- Configurable via environment variable: `GROQ_MODEL`
- API key via: `GROQ_API_KEY`

**Extraction pipeline:**
1. User provides a seed company (e.g., "Apple")
2. System fetches 10-K filing text from SEC EDGAR
3. LLM extracts structured relationships:
   ```json
   {
     "company": "Apple Inc.",
     "suppliers": [
       {
         "name": "Taiwan Semiconductor Manufacturing",
         "ticker": "TSM",
         "relationship": "Primary foundry for A-series and M-series chips",
         "productCategory": "Advanced Logic Chips",
         "estimatedRevenueWeight": 0.25,
         "confidence": 0.92,
         "source": "10-K FY2025, page 12"
       }
     ],
     "customers": [...]
   }
   ```
4. Results presented to user for approval/editing before insertion into graph
5. Recursive: each newly added company can be expanded further

---

## 5. Data Adapters

Pluggable adapter interface. Ship with free sources, designed so premium sources can be added later.

### 5.1 Adapter Interface

```typescript
type FinancialDataAdapter = {
  readonly name: string
  readonly fetchFinancials: (ticker: string, years: number) => Promise<RawFinancials>
  readonly fetchMarketData: (ticker: string) => Promise<MarketData>
  readonly isAvailable: () => Promise<boolean>
}
```

### 5.2 Initial Adapters

| Adapter | Data | Rate Limits | Notes |
|---------|------|-------------|-------|
| **Financial Modeling Prep** | 3-statement financials, ratios, company profiles | 250 req/day (free) | Primary source for financial statements |
| **Yahoo Finance** (via `yahoo-finance2`) | Real-time prices, market cap, basic fundamentals | Unofficial, no hard limit | Backup financials + real-time market data |
| **SEC EDGAR** | 10-K/10-Q filings (full text + XBRL) | 10 req/sec | Filing text for LLM extraction, XBRL for structured data |

**Fallback strategy:** Try FMP first. If rate-limited or missing data, fall back to Yahoo Finance. SEC EDGAR is always available for filing text regardless.

### 5.3 Manual Entry

For demo companies (AAPL, NVDA, etc.), pre-populate with manually curated financial models. These serve as:
- Demo data for showcasing the system
- Ground truth for validating API-sourced data
- Templates for similar companies

---

## 6. API Design

### 6.1 REST Endpoints

```
# Graph CRUD
GET    /api/graph                    -- Get full graph (nodes + edges)
POST   /api/graph/companies          -- Add company node
DELETE /api/graph/companies/:ticker   -- Remove company node
POST   /api/graph/edges              -- Add supply relationship
DELETE /api/graph/edges/:id          -- Remove relationship
PATCH  /api/graph/edges/:id          -- Update edge weight/metadata

# Financial Models
GET    /api/companies/:ticker/financials  -- Get financial model
PUT    /api/companies/:ticker/financials  -- Update financial model / overrides
POST   /api/companies/:ticker/dcf         -- Trigger DCF recalculation

# LLM Extraction
POST   /api/extract/supply-chain     -- Extract relationships for a company
POST   /api/extract/approve          -- Approve extracted relationships

# Scenarios
GET    /api/scenarios                -- List scenarios
POST   /api/scenarios                -- Create scenario
GET    /api/scenarios/:id            -- Get scenario details
POST   /api/scenarios/:id/policies   -- Add tariff policy to scenario
DELETE /api/scenarios/:id/policies/:pid -- Remove policy

# Simulation
POST   /api/simulate/:scenarioId     -- Run shock simulation (returns job ID)

# Data
POST   /api/data/fetch/:ticker       -- Fetch financial data from external APIs
```

### 6.2 WebSocket Events

```
# Client -> Server
ws:subscribe:graph          -- Subscribe to graph updates
ws:subscribe:simulation     -- Subscribe to simulation progress
ws:subscribe:node/:ticker   -- Subscribe to specific node updates

# Server -> Client
ws:graph:updated            -- Graph structure changed
ws:node:updated             -- Single node data changed
ws:edge:updated             -- Single edge data changed
ws:simulation:started       -- Simulation job started
ws:simulation:step          -- Propagation step completed (for animation)
ws:simulation:completed     -- Full simulation results ready
ws:dcf:recalculated         -- DCF values updated for a node
ws:extraction:progress      -- LLM extraction progress update
```

---

## 7. Frontend

### 7.1 Tech Stack

| Tool | Purpose |
|------|---------|
| React 19 | UI framework |
| Vite | Build tool |
| D3.js v7 | Force-directed graph visualization |
| Socket.io Client | WebSocket communication |
| Zustand | State management (lightweight, immutable-friendly) |
| TanStack Query | Server state / API caching |
| Tailwind CSS v4 | Styling foundation |

### 7.2 Aesthetic: Cyberpunk / Neon Data Viz

**Theme:**
- Deep black/dark navy background (#0a0a0f, #0d1117)
- Neon accent colors: cyan (#00f0ff), magenta (#ff00e5), electric green (#39ff14), amber (#ffb800)
- Graph edges glow with neon trails; intensity reflects revenue weight
- Shock propagation animates as a neon pulse traveling along edges
- Node halos pulse based on valuation delta magnitude
- Monospace font for financial data (JetBrains Mono or similar)
- Display font for headings: something sharp and distinctive (Orbitron, Exo 2, or Rajdhani)
- Scanline overlay or subtle grid pattern on background for depth
- Glassmorphism cards with dark translucent backgrounds and neon borders

### 7.3 Dashboard Layout

```
+-------------------------------------------------------+
|  Header: Logo + Scenario Selector + Sim Controls      |
+-------------------------------------------------------+
|  Portfolio Summary Bar (always visible)                |
|  [Total Value] [Shock Exposure] [Most At-Risk Node]   |
|  [Node Count]  [Edge Count]     [Sim Status]          |
+-------------------------------------------------------+
|                                                        |
|                                                        |
|           D3 Force-Directed Graph                      |
|           (hero widget, ~60% viewport)                 |
|                                                        |
|                                                        |
+---------------------------+---------------------------+
|  Selected Node Detail     |  Scenario / Shock Panel   |
|  - 3 Statement Summary    |  - Active policies        |
|  - DCF Output             |  - Add tariff policy      |
|  - Key Metrics            |  - Before/After deltas    |
|  - Sensitivity Sliders    |  - Run simulation button  |
+---------------------------+---------------------------+
```

### 7.4 Graph Interactions

- **Search bar:** Type company name/ticker to find or add nodes
- **Click node:** Select it, populate detail panel, highlight connected edges
- **Drag node:** Reposition in the force layout
- **Right-click node:** Context menu (expand supply chain, remove, edit financials)
- **Click edge:** Show dependency details (revenue weight, product category, confidence)
- **Scroll:** Zoom in/out
- **Double-click empty space:** Open "add company" dialog
- **Shift+click multiple nodes:** Multi-select for bulk operations

### 7.5 Shock Visualization

When a simulation runs:
1. Affected edges flash red/amber based on tariff severity
2. A neon pulse animates from the shock origin outward through the graph, following the propagation path
3. Node halos shift from green (minimal impact) to red (severe impact) based on valuation delta
4. Delta percentages fade in next to each node
5. The portfolio summary bar updates in real time as each propagation step completes
6. Animation speed is configurable (instant / slow / step-by-step)

---

## 8. Tariff Shock System

### 8.1 Three Layers of Shock Definition

**Layer 1: Policy-Level**
Define tariffs at the policy level. The system auto-identifies affected edges.
- Example: "25% tariff on all semiconductor products from Taiwan"
- Matching: edges where `targetCountry` matches supplier's country AND `productCategory` matches

**Layer 2: Edge-Level Override**
After policy matching, user can manually override which edges are affected and the impact percentage per edge.

**Layer 3: Scenario Composition**
Multiple policies compose into named scenarios. Users can compare:
- Baseline (no shocks)
- Scenario A ("Mild tariff: 10% on Taiwan semis")
- Scenario B ("Trade war: 25% on all China + Taiwan tech")

Side-by-side comparison shows delta between any two scenarios across all nodes.

### 8.2 Passthrough Parameter

Not all tariff costs are borne equally. A `passthrough` parameter (0.0-1.0) per edge controls how much of the tariff cost propagates:
- 1.0 = full cost passed to customer (customer's COGS increases)
- 0.0 = supplier absorbs entirely (supplier's margin shrinks)
- Default: 0.7 (industry standard assumption)

---

## 9. Testing Strategy

Follows TDD as specified in CLAUDE.md. Test behavior, not implementation.

| Layer | Tool | Focus |
|-------|------|-------|
| Graph Engine | Vitest | Propagation correctness, cycle handling, convergence |
| DCF Engine | Vitest | 3-statement linkage, DCF math, override merging |
| Data Adapters | Vitest + MSW | API response parsing, fallback logic, error handling |
| API Routes | Vitest + Supertest | Request validation, response shape, auth |
| React Components | Vitest + React Testing Library | User interactions, data display, state management |
| WebSocket | Vitest + mock-socket | Event emission, subscription management |
| E2E | Playwright | Full user flows: add company, run simulation, view results |

---

## 10. Project Structure

```
tori-project/
  docker-compose.yml
  packages/
    server/
      src/
        api/              # Express routes + WebSocket handlers
        graph-engine/     # In-memory graph, traversal, propagation
        dcf-engine/       # 3-statement model, DCF calculations
        data-adapters/    # FMP, Yahoo Finance, SEC EDGAR adapters
        llm-service/      # Groq client, extraction prompts
        neo4j-client/     # Neo4j driver wrapper, Cypher builders
        index.ts          # Server entry point
      package.json
      tsconfig.json
    client/
      src/
        components/
          graph/          # D3 force-directed graph component
          dashboard/      # Summary cards, portfolio metrics
          financials/     # 3-statement display, DCF output
          scenarios/      # Scenario builder, tariff policy forms
          shared/         # Buttons, inputs, modals, layout
        hooks/            # Custom React hooks
        stores/           # Zustand stores
        api/              # TanStack Query hooks, WebSocket client
        styles/           # Tailwind config, global styles, theme
        App.tsx
        main.tsx
      package.json
      tsconfig.json
      vite.config.ts
    shared/               # Shared TypeScript types between client and server
      src/
        types/
        schemas/          # Zod schemas (trust boundary validation)
      package.json
      tsconfig.json
  docs/
  neo4j/
    conf/                 # Neo4j config
    init/                 # Cypher seed scripts
```

---

## 11. Docker Compose

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NEO4J_URI=bolt://neo4j:7687
      - NEO4J_USER=neo4j
      - NEO4J_PASSWORD=changeme
      - REDIS_URL=redis://redis:6379
      - GROQ_API_KEY=${GROQ_API_KEY}
      - GROQ_MODEL=llama-3.3-70b-versatile
      - FMP_API_KEY=${FMP_API_KEY}
    depends_on:
      - neo4j
      - redis

  neo4j:
    image: neo4j:5
    ports:
      - "7474:7474"
      - "7687:7687"
    environment:
      - NEO4J_AUTH=neo4j/changeme
    volumes:
      - neo4j_data:/data
      - ./neo4j/conf:/conf
      - ./neo4j/init:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  neo4j_data:
```

---

## 12. Demo Data

Pre-built supply chain for demonstration:

**Apple Semiconductor Chain:**
- Apple (AAPL) <- TSMC (TSM) <- ASML (ASML)
- Apple (AAPL) <- TSMC (TSM) <- Tokyo Electron (8035.T)
- Apple (AAPL) <- Broadcom (AVGO)
- Apple (AAPL) <- Qualcomm (QCOM) <- TSMC (TSM)

**NVIDIA AI Chain:**
- NVIDIA (NVDA) <- TSMC (TSM) <- ASML (ASML)
- NVIDIA (NVDA) <- SK Hynix (000660.KS) <- Lam Research (LRCX)
- NVIDIA (NVDA) -> Microsoft (MSFT)
- NVIDIA (NVDA) -> Meta (META)
- NVIDIA (NVDA) -> Amazon (AMZN)

These will be manually curated with accurate financial models and verified supply chain weights.

---

## 13. Non-Goals (Explicit)

- No user authentication or multi-tenancy (solo tool)
- No mobile responsiveness (desktop-first dashboard)
- No historical backtesting of shocks
- No real-time market data streaming (fetch on demand)
- No options/derivatives modeling
- No Kubernetes deployment (Docker Compose only for now)

---

## 14. Open Questions

None remaining. All design decisions have been resolved through the Q&A process.
