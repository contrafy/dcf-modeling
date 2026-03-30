# Graph-Based DCF Supply Chain -- Phase 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the monorepo, shared types/schemas, Docker Compose infrastructure, and basic Express server with WebSocket support -- everything needed before the engines can be built.

**Architecture:** pnpm workspace monorepo with three packages: `@tori/shared` (types + Zod schemas), `@tori/server` (Express + Socket.io), `@tori/client` (React + Vite). Docker Compose runs Neo4j, Redis, and the app container.

**Tech Stack:** TypeScript 5.7+, pnpm workspaces, Vitest, Express 5, Socket.io 4, Zod, Docker Compose

**Spec reference:** `docs/superpowers/specs/2026-03-29-graph-dcf-supply-chain-design.md`

---

### Task 1: Initialize Monorepo

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Initialize git and root package.json**

```bash
cd /home/contrafy/git/toriProject
git init
```

Create `package.json`:
```json
{
  "name": "tori-project",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @tori/server dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "test:watch": "pnpm -r test:watch",
    "lint": "pnpm -r lint"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

- [ ] **Step 2: Create pnpm workspace config**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

- [ ] **Step 3: Create base tsconfig**

Create `tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2024"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true
  }
}
```

- [ ] **Step 4: Create .gitignore and .env.example**

Create `.gitignore`:
```
node_modules/
dist/
.env
*.log
.DS_Store
neo4j/data/
neo4j/logs/
```

Create `.env.example`:
```
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
FMP_API_KEY=your_fmp_api_key
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme
REDIS_URL=redis://localhost:6379
PORT=3000
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example
git commit -m "feat: initialize monorepo with pnpm workspaces and base tsconfig"
```

---

### Task 2: Create Shared Package with Core Types

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types/company.ts`
- Create: `packages/shared/src/types/financial-model.ts`
- Create: `packages/shared/src/types/graph.ts`
- Create: `packages/shared/src/types/scenario.ts`
- Create: `packages/shared/src/types/dcf.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create shared package scaffolding**

Create `packages/shared/package.json`:
```json
{
  "name": "@tori/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
```

Create `packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Create company types**

Create `packages/shared/src/types/company.ts`:
```typescript
type CompanySource = "manual" | "llm" | "sec_filing"

type Company = {
  readonly ticker: string
  readonly name: string
  readonly sector: string
  readonly country: string
  readonly marketCap: number
  readonly lastUpdated: string
}

export type { Company, CompanySource }
```

- [ ] **Step 3: Create financial model types**

Create `packages/shared/src/types/financial-model.ts`:
```typescript
type IncomeStatementDrivers = {
  readonly revenue: number
  readonly revenueGrowthRate: number
  readonly cogsPercent: number
  readonly sgaPercent: number
  readonly rdPercent: number
  readonly daPercent: number
  readonly interestExpense: number
  readonly taxRate: number
}

type BalanceSheetDrivers = {
  readonly cashAndEquivalents: number
  readonly accountsReceivable: number
  readonly inventory: number
  readonly ppe: number
  readonly totalDebt: number
  readonly accountsPayable: number
}

type CashFlowDrivers = {
  readonly capexPercent: number
  readonly nwcChange: number
}

type DCFParameters = {
  readonly wacc: number
  readonly terminalGrowthRate: number
  readonly projectionYears: number
  readonly sharesOutstanding: number
}

type FinancialModelDrivers = IncomeStatementDrivers &
  BalanceSheetDrivers &
  CashFlowDrivers &
  DCFParameters

type FinancialModel = {
  readonly companyTicker: string
  readonly fiscalYear: number
  readonly drivers: FinancialModelDrivers
  readonly overrides: Partial<FinancialModelDrivers>
}

type IncomeStatement = {
  readonly revenue: number
  readonly cogs: number
  readonly grossProfit: number
  readonly sga: number
  readonly rd: number
  readonly ebitda: number
  readonly da: number
  readonly ebit: number
  readonly interestExpense: number
  readonly ebt: number
  readonly tax: number
  readonly netIncome: number
}

type BalanceSheet = {
  readonly cashAndEquivalents: number
  readonly accountsReceivable: number
  readonly inventory: number
  readonly totalCurrentAssets: number
  readonly ppe: number
  readonly totalAssets: number
  readonly accountsPayable: number
  readonly totalDebt: number
  readonly totalLiabilities: number
  readonly equity: number
}

type CashFlowStatement = {
  readonly netIncome: number
  readonly da: number
  readonly nwcChange: number
  readonly operatingCashFlow: number
  readonly capex: number
  readonly freeCashFlow: number
}

type ThreeStatementOutput = {
  readonly incomeStatement: IncomeStatement
  readonly balanceSheet: BalanceSheet
  readonly cashFlowStatement: CashFlowStatement
}

export type {
  IncomeStatementDrivers,
  BalanceSheetDrivers,
  CashFlowDrivers,
  DCFParameters,
  FinancialModelDrivers,
  FinancialModel,
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
  ThreeStatementOutput,
}
```

- [ ] **Step 4: Create graph types**

Create `packages/shared/src/types/graph.ts`:
```typescript
import type { Company } from "./company.js"
import type { FinancialModel } from "./financial-model.js"
import type { DCFResult } from "./dcf.js"

type SupplyEdge = {
  readonly id: string
  readonly fromTicker: string
  readonly toTicker: string
  readonly revenueWeight: number
  readonly productCategory: string
  readonly confidence: number
  readonly source: "manual" | "llm" | "sec_filing"
  readonly passthrough: number
  readonly lastVerified: string
}

type CompanyNode = {
  readonly company: Company
  readonly financialModel: FinancialModel
  readonly computedDCF: DCFResult | null
}

type SupplyChainGraph = {
  readonly nodes: ReadonlyMap<string, CompanyNode>
  readonly edges: readonly SupplyEdge[]
  readonly adjacency: ReadonlyMap<string, readonly SupplyEdge[]>
}

export type { SupplyEdge, CompanyNode, SupplyChainGraph }
```

- [ ] **Step 5: Create scenario types**

Create `packages/shared/src/types/scenario.ts`:
```typescript
type TariffPolicy = {
  readonly id: string
  readonly scenarioId: string
  readonly name: string
  readonly tariffPercent: number
  readonly targetCountry: string
  readonly targetSector: string | null
  readonly targetProduct: string | null
  readonly affectedEdgeIds: readonly string[]
}

type Scenario = {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly policies: readonly TariffPolicy[]
  readonly createdAt: string
}

export type { TariffPolicy, Scenario }
```

- [ ] **Step 6: Create DCF result types**

Create `packages/shared/src/types/dcf.ts`:
```typescript
import type { ThreeStatementOutput } from "./financial-model.js"

type DCFResult = {
  readonly projectedFCFs: readonly number[]
  readonly terminalValue: number
  readonly discountedFCFs: readonly number[]
  readonly discountedTerminalValue: number
  readonly enterpriseValue: number
  readonly netDebt: number
  readonly equityValue: number
  readonly perShareValue: number
  readonly threeStatements: readonly ThreeStatementOutput[]
}

type ShockImpact = {
  readonly ticker: string
  readonly baselineValuation: number
  readonly shockedValuation: number
  readonly delta: number
  readonly percentChange: number
}

type SimulationResult = {
  readonly scenarioId: string
  readonly impacts: ReadonlyMap<string, ShockImpact>
  readonly iterationCount: number
  readonly converged: boolean
}

type PropagationStep = {
  readonly iteration: number
  readonly affectedTicker: string
  readonly previousValuation: number
  readonly newValuation: number
  readonly delta: number
}

export type { DCFResult, ShockImpact, SimulationResult, PropagationStep }
```

- [ ] **Step 7: Create barrel export**

Create `packages/shared/src/index.ts`:
```typescript
export type {
  Company,
  CompanySource,
} from "./types/company.js"

export type {
  IncomeStatementDrivers,
  BalanceSheetDrivers,
  CashFlowDrivers,
  DCFParameters,
  FinancialModelDrivers,
  FinancialModel,
  IncomeStatement,
  BalanceSheet,
  CashFlowStatement,
  ThreeStatementOutput,
} from "./types/financial-model.js"

export type {
  SupplyEdge,
  CompanyNode,
  SupplyChainGraph,
} from "./types/graph.js"

export type {
  TariffPolicy,
  Scenario,
} from "./types/scenario.js"

export type {
  DCFResult,
  ShockImpact,
  SimulationResult,
  PropagationStep,
} from "./types/dcf.js"
```

- [ ] **Step 8: Install dependencies and verify types compile**

```bash
cd /home/contrafy/git/toriProject
pnpm install
pnpm --filter @tori/shared lint
```

Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/
git commit -m "feat: add @tori/shared package with core domain types"
```

---

### Task 3: Create Zod Schemas at Trust Boundaries

**Files:**
- Create: `packages/shared/src/schemas/company.ts`
- Create: `packages/shared/src/schemas/financial-model.ts`
- Create: `packages/shared/src/schemas/graph.ts`
- Create: `packages/shared/src/schemas/scenario.ts`
- Create: `packages/shared/src/schemas/index.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (add zod dep)

- [ ] **Step 1: Create company schema**

Create `packages/shared/src/schemas/company.ts`:
```typescript
import { z } from "zod"

const CompanySchema = z.object({
  ticker: z.string().min(1).max(10),
  name: z.string().min(1),
  sector: z.string().min(1),
  country: z.string().min(1),
  marketCap: z.number().nonnegative(),
  lastUpdated: z.string().datetime(),
})

const CreateCompanySchema = CompanySchema.omit({ lastUpdated: true })

export { CompanySchema, CreateCompanySchema }
```

- [ ] **Step 2: Create financial model schema**

Create `packages/shared/src/schemas/financial-model.ts`:
```typescript
import { z } from "zod"

const percent = z.number().min(0).max(1)
const positiveNumber = z.number().nonnegative()

const FinancialModelDriversSchema = z.object({
  revenue: positiveNumber,
  revenueGrowthRate: z.number(),
  cogsPercent: percent,
  sgaPercent: percent,
  rdPercent: percent,
  daPercent: percent,
  interestExpense: z.number(),
  taxRate: percent,
  cashAndEquivalents: positiveNumber,
  accountsReceivable: positiveNumber,
  inventory: positiveNumber,
  ppe: positiveNumber,
  totalDebt: positiveNumber,
  accountsPayable: positiveNumber,
  capexPercent: percent,
  nwcChange: z.number(),
  wacc: z.number().positive(),
  terminalGrowthRate: z.number(),
  projectionYears: z.number().int().min(1).max(20),
  sharesOutstanding: positiveNumber,
})

const FinancialModelSchema = z.object({
  companyTicker: z.string().min(1),
  fiscalYear: z.number().int().min(1900).max(2100),
  drivers: FinancialModelDriversSchema,
  overrides: FinancialModelDriversSchema.partial(),
})

const UpdateFinancialModelSchema = z.object({
  drivers: FinancialModelDriversSchema.partial().optional(),
  overrides: FinancialModelDriversSchema.partial().optional(),
})

export {
  FinancialModelDriversSchema,
  FinancialModelSchema,
  UpdateFinancialModelSchema,
}
```

- [ ] **Step 3: Create graph schema**

Create `packages/shared/src/schemas/graph.ts`:
```typescript
import { z } from "zod"

const SupplyEdgeSchema = z.object({
  id: z.string().min(1),
  fromTicker: z.string().min(1),
  toTicker: z.string().min(1),
  revenueWeight: z.number().min(0).max(1),
  productCategory: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source: z.enum(["manual", "llm", "sec_filing"]),
  passthrough: z.number().min(0).max(1).default(0.7),
  lastVerified: z.string().datetime(),
})

const CreateSupplyEdgeSchema = SupplyEdgeSchema.omit({
  id: true,
  lastVerified: true,
})

const UpdateSupplyEdgeSchema = z.object({
  revenueWeight: z.number().min(0).max(1).optional(),
  productCategory: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  passthrough: z.number().min(0).max(1).optional(),
})

export { SupplyEdgeSchema, CreateSupplyEdgeSchema, UpdateSupplyEdgeSchema }
```

- [ ] **Step 4: Create scenario schema**

Create `packages/shared/src/schemas/scenario.ts`:
```typescript
import { z } from "zod"

const TariffPolicySchema = z.object({
  id: z.string().min(1),
  scenarioId: z.string().min(1),
  name: z.string().min(1),
  tariffPercent: z.number().min(0).max(1),
  targetCountry: z.string().min(1),
  targetSector: z.string().nullable().default(null),
  targetProduct: z.string().nullable().default(null),
  affectedEdgeIds: z.array(z.string()),
})

const CreateTariffPolicySchema = TariffPolicySchema.omit({
  id: true,
  scenarioId: true,
  affectedEdgeIds: true,
})

const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  policies: z.array(TariffPolicySchema),
  createdAt: z.string().datetime(),
})

const CreateScenarioSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
})

export {
  TariffPolicySchema,
  CreateTariffPolicySchema,
  ScenarioSchema,
  CreateScenarioSchema,
}
```

- [ ] **Step 5: Create schemas barrel export and update main index**

Create `packages/shared/src/schemas/index.ts`:
```typescript
export {
  CompanySchema,
  CreateCompanySchema,
} from "./company.js"

export {
  FinancialModelDriversSchema,
  FinancialModelSchema,
  UpdateFinancialModelSchema,
} from "./financial-model.js"

export {
  SupplyEdgeSchema,
  CreateSupplyEdgeSchema,
  UpdateSupplyEdgeSchema,
} from "./graph.js"

export {
  TariffPolicySchema,
  CreateTariffPolicySchema,
  ScenarioSchema,
  CreateScenarioSchema,
} from "./scenario.js"
```

Update `packages/shared/src/index.ts` -- append at the end:
```typescript
export {
  CompanySchema,
  CreateCompanySchema,
  FinancialModelDriversSchema,
  FinancialModelSchema,
  UpdateFinancialModelSchema,
  SupplyEdgeSchema,
  CreateSupplyEdgeSchema,
  UpdateSupplyEdgeSchema,
  TariffPolicySchema,
  CreateTariffPolicySchema,
  ScenarioSchema,
  CreateScenarioSchema,
} from "./schemas/index.js"
```

- [ ] **Step 6: Verify types compile**

```bash
pnpm --filter @tori/shared lint
```

Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/
git commit -m "feat: add Zod schemas for trust boundary validation"
```

---

### Task 4: Create Server Package Scaffolding

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/vitest.config.ts`
- Create: `packages/server/src/index.ts`

- [ ] **Step 1: Create server package.json**

Create `packages/server/package.json`:
```json
{
  "name": "@tori/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@tori/shared": "workspace:*",
    "express": "^5.0.0",
    "socket.io": "^4.8.0",
    "ioredis": "^5.4.0",
    "neo4j-driver": "^5.27.0",
    "zod": "^3.24.0",
    "crypto-randomuuid": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0",
    "@types/express": "^5.0.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create server tsconfig**

Create `packages/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vitest config**

Create `packages/server/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
```

- [ ] **Step 4: Create minimal server entry point**

Create `packages/server/src/index.ts`:
```typescript
import express from "express"
import { createServer } from "node:http"
import { Server } from "socket.io"

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: "*" },
})

app.use(express.json())

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" })
})

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`)
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

const PORT = process.env["PORT"] ?? 3000

httpServer.listen(PORT, () => {
  console.log(`Tori server running on port ${PORT}`)
})

export { app, httpServer, io }
```

- [ ] **Step 5: Install all dependencies**

```bash
cd /home/contrafy/git/toriProject
pnpm install
```

- [ ] **Step 6: Verify types compile**

```bash
pnpm --filter @tori/server lint
```

Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server/
git commit -m "feat: add @tori/server package with Express + Socket.io entry point"
```

---

### Task 5: Server Health Check Test

**Files:**
- Create: `packages/server/src/api/health.test.ts`
- Create: `packages/server/src/api/health.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/api/health.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import request from "supertest"
import express from "express"
import { healthRouter } from "./health.js"

function createTestApp() {
  const app = express()
  app.use("/api", healthRouter)
  return app
}

describe("GET /api/health", () => {
  it("returns status ok", async () => {
    const app = createTestApp()
    const response = await request(app).get("/api/health")

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: "ok" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/api/health.test.ts
```

Expected: FAIL -- cannot find module `./health.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/api/health.ts`:
```typescript
import { Router } from "express"

const healthRouter = Router()

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

export { healthRouter }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/api/health.test.ts
```

Expected: PASS

- [ ] **Step 5: Update server index to use health router**

Update `packages/server/src/index.ts` -- replace the inline health route:
```typescript
import express from "express"
import { createServer } from "node:http"
import { Server } from "socket.io"
import { healthRouter } from "./api/health.js"

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: "*" },
})

app.use(express.json())
app.use("/api", healthRouter)

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`)
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

const PORT = process.env["PORT"] ?? 3000

httpServer.listen(PORT, () => {
  console.log(`Tori server running on port ${PORT}`)
})

export { app, httpServer, io }
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/api/
git commit -m "feat: extract health endpoint into router with test"
```

---

### Task 6: Docker Compose Setup

**Files:**
- Create: `docker-compose.yml`
- Create: `Dockerfile`
- Create: `neo4j/conf/.gitkeep`
- Create: `neo4j/init/.gitkeep`

- [ ] **Step 1: Create Dockerfile**

Create `Dockerfile`:
```dockerfile
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY . .
RUN pnpm --filter @tori/shared build && pnpm --filter @tori/server build

FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/server/package.json ./packages/server/

EXPOSE 3000
CMD ["node", "packages/server/dist/index.js"]
```

- [ ] **Step 2: Create docker-compose.yml**

Create `docker-compose.yml`:
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
      - GROQ_MODEL=${GROQ_MODEL:-llama-3.3-70b-versatile}
      - FMP_API_KEY=${FMP_API_KEY}
      - PORT=3000
    depends_on:
      neo4j:
        condition: service_healthy
      redis:
        condition: service_healthy

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
    healthcheck:
      test: ["CMD-SHELL", "neo4j status || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  neo4j_data:
```

- [ ] **Step 3: Create neo4j directories**

```bash
mkdir -p neo4j/conf neo4j/init
touch neo4j/conf/.gitkeep neo4j/init/.gitkeep
```

- [ ] **Step 4: Update .gitignore for neo4j data**

Append to `.gitignore`:
```
neo4j/data/
neo4j/logs/
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml Dockerfile neo4j/ .gitignore
git commit -m "feat: add Docker Compose with Neo4j, Redis, and app containers"
```

---

### Task 7: Create Client Package Scaffolding

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/tsconfig.node.json`
- Create: `packages/client/vite.config.ts`
- Create: `packages/client/index.html`
- Create: `packages/client/src/main.tsx`
- Create: `packages/client/src/App.tsx`
- Create: `packages/client/src/vite-env.d.ts`

- [ ] **Step 1: Create client package.json**

Create `packages/client/package.json`:
```json
{
  "name": "@tori/client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@tori/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "socket.io-client": "^4.8.0",
    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.60.0",
    "d3": "^7.9.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vitest": "^3.0.0",
    "jsdom": "^25.0.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/d3": "^7.4.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0"
  }
}
```

- [ ] **Step 2: Create client tsconfig files**

Create `packages/client/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `packages/client/tsconfig.node.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2024"],
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 3: Create vite config**

Create `packages/client/vite.config.ts`:
```typescript
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
    setupFiles: ["src/test-setup.ts"],
  },
})
```

- [ ] **Step 4: Create index.html and entry files**

Create `packages/client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tori -- Supply Chain DCF</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `packages/client/src/vite-env.d.ts`:
```typescript
/// <reference types="vite/client" />
```

Create `packages/client/src/main.tsx`:
```typescript
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App.js"

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Root element not found")

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Create `packages/client/src/App.tsx`:
```typescript
function App() {
  return (
    <div>
      <h1>Tori</h1>
      <p>Supply Chain DCF Engine</p>
    </div>
  )
}

export { App }
```

Create `packages/client/src/test-setup.ts`:
```typescript
import "@testing-library/jest-dom/vitest"
```

- [ ] **Step 5: Create base CSS with Tailwind and cyberpunk theme variables**

Create `packages/client/src/styles/global.css`:
```css
@import "tailwindcss";

@theme {
  --color-void: #0a0a0f;
  --color-abyss: #0d1117;
  --color-surface: #161b22;
  --color-surface-bright: #21262d;
  --color-neon-cyan: #00f0ff;
  --color-neon-magenta: #ff00e5;
  --color-neon-green: #39ff14;
  --color-neon-amber: #ffb800;
  --color-neon-red: #ff3131;
  --color-text-primary: #e6edf3;
  --color-text-secondary: #8b949e;
  --color-text-muted: #484f58;
  --color-border-glow: rgba(0, 240, 255, 0.15);

  --font-display: "Orbitron", sans-serif;
  --font-mono: "JetBrains Mono", monospace;
  --font-body: "Exo 2", sans-serif;
}

@layer base {
  body {
    background-color: var(--color-void);
    color: var(--color-text-primary);
    font-family: var(--font-body);
  }
}
```

Update `packages/client/src/main.tsx` to import styles -- add at top:
```typescript
import "./styles/global.css"
```

- [ ] **Step 6: Install dependencies and verify**

```bash
cd /home/contrafy/git/toriProject
pnpm install
pnpm --filter @tori/client lint
```

Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/client/
git commit -m "feat: add @tori/client package with React, Vite, Tailwind, and cyberpunk theme"
```

---

That completes Phase 1. After this phase, we have:
- A working monorepo with 3 packages
- All shared domain types and Zod schemas
- An Express + Socket.io server with health check
- A React + Vite client with cyberpunk CSS theme
- Docker Compose with Neo4j + Redis
- Full test infrastructure (Vitest) in both server and client
