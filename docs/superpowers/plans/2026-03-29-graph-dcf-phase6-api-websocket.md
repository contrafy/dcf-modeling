# Graph-Based DCF Supply Chain -- Phase 6: API + WebSocket Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete REST API and WebSocket event system that the React client will consume. Thin controllers that delegate to graph-engine, dcf-engine, and the Neo4j repositories provided by Phase 4. WebSocket events broadcast real-time updates to subscribed clients after every mutation.

**Architecture:** Express 5 routers mounted under `/api`, one router per domain (graph, financial, extraction, scenario, simulation, data). A `socket-handler.ts` module registers Socket.io event listeners and exposes an `emit` helper used by routers when data changes. Zod schemas from `@tori/shared` are validated in a single middleware before reaching any handler.

**Tech Stack:** TypeScript strict mode, Express 5, Socket.io 4, Zod, Vitest, supertest, socket.io-client (test only)

**Spec reference:** `docs/superpowers/specs/2026-03-29-graph-dcf-supply-chain-design.md` -- Section 6

**Prerequisites:**
- Phase 1 complete (monorepo, shared types + schemas)
- Phase 2 complete (DCF engine: `calculateDCF`, `mergeDrivers`, `deriveThreeStatements`)
- Phase 3 complete (graph engine: `createGraph`, `addNode`, `addEdge`, `removeNode`, `removeEdge`, `matchAffectedEdges`, `propagateShock`)
- Phase 4 complete (Neo4j repositories and data-adapter orchestrator -- imported as interfaces, mocked in tests)
- Phase 5 complete (LLM extraction pipeline -- imported as interface, mocked in tests)

---

### Task 1: Validation Middleware

**Files:**
- Create: `packages/server/src/api/validation.ts`
- Create: `packages/server/src/api/validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/api/validation.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { z } from "zod"
import { validateBody, validateParams } from "./validation.js"

function makeApp(): Express {
  const app = express()
  app.use(express.json())

  const BodySchema = z.object({
    name: z.string().min(1),
    value: z.number().positive(),
  })

  const ParamsSchema = z.object({
    id: z.string().uuid(),
  })

  app.post(
    "/test-body",
    validateBody(BodySchema),
    (_req, res) => { res.json({ ok: true }) },
  )

  app.get(
    "/test-params/:id",
    validateParams(ParamsSchema),
    (_req, res) => { res.json({ ok: true }) },
  )

  return app
}

describe("validateBody", () => {
  it("passes valid request body to handler", async () => {
    const app = makeApp()
    const response = await request(app)
      .post("/test-body")
      .send({ name: "apple", value: 42 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it("returns 400 with Zod error details when body is invalid", async () => {
    const app = makeApp()
    const response = await request(app)
      .post("/test-body")
      .send({ name: "", value: -1 })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      error: "Validation failed",
      issues: expect.arrayContaining([
        expect.objectContaining({ path: expect.any(Array) }),
      ]),
    })
  })

  it("returns 400 when body is missing required fields", async () => {
    const app = makeApp()
    const response = await request(app)
      .post("/test-body")
      .send({})

    expect(response.status).toBe(400)
    expect(response.body.error).toBe("Validation failed")
  })

  it("returns 400 when body is not JSON", async () => {
    const app = makeApp()
    const response = await request(app)
      .post("/test-body")
      .set("Content-Type", "application/json")
      .send("not-json-at-all{{{")

    expect(response.status).toBe(400)
  })
})

describe("validateParams", () => {
  it("passes valid params to handler", async () => {
    const app = makeApp()
    const response = await request(app)
      .get("/test-params/550e8400-e29b-41d4-a716-446655440000")

    expect(response.status).toBe(200)
  })

  it("returns 400 when param fails schema", async () => {
    const app = makeApp()
    const response = await request(app)
      .get("/test-params/not-a-uuid")

    expect(response.status).toBe(400)
    expect(response.body.error).toBe("Validation failed")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/api/validation.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/api/validation.ts`:
```typescript
import type { Request, Response, NextFunction } from "express"
import { z } from "zod"

type ValidationErrorBody = {
  readonly error: string
  readonly issues: readonly z.ZodIssue[]
}

function sendValidationError(res: Response, issues: readonly z.ZodIssue[]): void {
  const body: ValidationErrorBody = { error: "Validation failed", issues }
  res.status(400).json(body)
}

function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      sendValidationError(res, result.error.issues)
      return
    }
    req.body = result.data as Record<string, unknown>
    next()
  }
}

function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params)
    if (!result.success) {
      sendValidationError(res, result.error.issues)
      return
    }
    next()
  }
}

export { validateBody, validateParams }
export type { ValidationErrorBody }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/api/validation.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/api/validation.ts packages/server/src/api/validation.test.ts
git commit --no-gpg-sign -m "feat: add Zod validation middleware for request body and params"
```

---

### Task 2: WebSocket Events and Socket Handler

**Files:**
- Create: `packages/server/src/websocket/events.ts`
- Create: `packages/server/src/websocket/socket-handler.ts`
- Create: `packages/server/src/websocket/socket-handler.test.ts`
- Create: `packages/server/src/websocket/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/websocket/socket-handler.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createSocketHandler } from "./socket-handler.js"
import type { Server, Socket } from "socket.io"
import { EVENTS } from "./events.js"

function makeSocket(rooms: Set<string> = new Set()): Socket {
  return {
    id: "test-socket-id",
    join: vi.fn((room: string) => { rooms.add(room) }),
    leave: vi.fn((room: string) => { rooms.delete(room) }),
    on: vi.fn(),
    emit: vi.fn(),
    rooms,
  } as unknown as Socket
}

function makeIo(): Server {
  return {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  } as unknown as Server
}

describe("createSocketHandler", () => {
  it("registers connection-scoped event listeners on each socket", () => {
    const io = makeIo()
    const socket = makeSocket()
    const handler = createSocketHandler(io)

    handler.onConnection(socket)

    const onCalls = vi.mocked(socket.on).mock.calls.map(([event]) => event)
    expect(onCalls).toContain("subscribe:graph")
    expect(onCalls).toContain("subscribe:simulation")
    expect(onCalls).toContain("subscribe:node")
  })

  it("joins the graph room when subscribe:graph is received", () => {
    const io = makeIo()
    const rooms = new Set<string>()
    const socket = makeSocket(rooms)
    const handler = createSocketHandler(io)

    handler.onConnection(socket)

    const onCalls = vi.mocked(socket.on).mock.calls
    const graphHandler = onCalls.find(([event]) => event === "subscribe:graph")?.[1] as (() => void) | undefined
    graphHandler?.()

    expect(vi.mocked(socket.join)).toHaveBeenCalledWith("room:graph")
  })

  it("joins the simulation room when subscribe:simulation is received", () => {
    const io = makeIo()
    const rooms = new Set<string>()
    const socket = makeSocket(rooms)
    const handler = createSocketHandler(io)

    handler.onConnection(socket)

    const onCalls = vi.mocked(socket.on).mock.calls
    const simHandler = onCalls.find(([event]) => event === "subscribe:simulation")?.[1] as (() => void) | undefined
    simHandler?.()

    expect(vi.mocked(socket.join)).toHaveBeenCalledWith("room:simulation")
  })

  it("joins a per-node room when subscribe:node is received with a ticker", () => {
    const io = makeIo()
    const rooms = new Set<string>()
    const socket = makeSocket(rooms)
    const handler = createSocketHandler(io)

    handler.onConnection(socket)

    const onCalls = vi.mocked(socket.on).mock.calls
    const nodeHandler = onCalls.find(([event]) => event === "subscribe:node")?.[1] as ((ticker: string) => void) | undefined
    nodeHandler?.("AAPL")

    expect(vi.mocked(socket.join)).toHaveBeenCalledWith("room:node:AAPL")
  })
})

describe("emitGraphUpdated", () => {
  it("broadcasts to the graph room with graph data", () => {
    const io = makeIo()
    const handler = createSocketHandler(io)
    const payload = { nodes: [], edges: [] }

    handler.emitGraphUpdated(payload)

    expect(vi.mocked(io.to)).toHaveBeenCalledWith("room:graph")
    expect(vi.mocked(io.to("room:graph").emit)).toHaveBeenCalledWith(
      EVENTS.GRAPH_UPDATED,
      payload,
    )
  })
})

describe("emitSimulationStep", () => {
  it("broadcasts a propagation step to the simulation room", () => {
    const io = makeIo()
    const handler = createSocketHandler(io)
    const step = { iteration: 1, affectedTicker: "AAPL", previousValuation: 1000, newValuation: 900, delta: -100 }

    handler.emitSimulationStep(step)

    expect(vi.mocked(io.to)).toHaveBeenCalledWith("room:simulation")
    expect(vi.mocked(io.to("room:simulation").emit)).toHaveBeenCalledWith(
      EVENTS.SIMULATION_STEP,
      step,
    )
  })
})

describe("emitNodeUpdated", () => {
  it("broadcasts to both graph room and per-node room", () => {
    const io = makeIo()
    const handler = createSocketHandler(io)
    const payload = { ticker: "NVDA", data: {} }

    handler.emitNodeUpdated("NVDA", payload)

    expect(vi.mocked(io.to)).toHaveBeenCalledWith("room:graph")
    expect(vi.mocked(io.to)).toHaveBeenCalledWith("room:node:NVDA")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/websocket/socket-handler.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create events constants**

Create `packages/server/src/websocket/events.ts`:
```typescript
const EVENTS = {
  // Server -> Client
  GRAPH_UPDATED: "graph:updated",
  NODE_UPDATED: "node:updated",
  EDGE_UPDATED: "edge:updated",
  SIMULATION_STARTED: "simulation:started",
  SIMULATION_STEP: "simulation:step",
  SIMULATION_COMPLETED: "simulation:completed",
  DCF_RECALCULATED: "dcf:recalculated",
  EXTRACTION_PROGRESS: "extraction:progress",
} as const

const ROOMS = {
  GRAPH: "room:graph",
  SIMULATION: "room:simulation",
  node: (ticker: string) => `room:node:${ticker}`,
} as const

export { EVENTS, ROOMS }
```

- [ ] **Step 4: Write socket handler implementation**

Create `packages/server/src/websocket/socket-handler.ts`:
```typescript
import type { Server, Socket } from "socket.io"
import type { PropagationStep, ShockImpact } from "@tori/shared"
import { EVENTS, ROOMS } from "./events.js"

type GraphUpdatedPayload = {
  readonly nodes: readonly unknown[]
  readonly edges: readonly unknown[]
}

type NodeUpdatedPayload = {
  readonly ticker: string
  readonly data: unknown
}

type EdgeUpdatedPayload = {
  readonly edgeId: string
  readonly data: unknown
}

type SimulationStartedPayload = {
  readonly scenarioId: string
  readonly jobId: string
}

type SimulationCompletedPayload = {
  readonly scenarioId: string
  readonly impacts: readonly ShockImpact[]
  readonly iterationCount: number
  readonly converged: boolean
}

type DCFRecalculatedPayload = {
  readonly ticker: string
  readonly equityValue: number
  readonly perShareValue: number
}

type ExtractionProgressPayload = {
  readonly ticker: string
  readonly status: "started" | "fetching" | "extracting" | "done" | "error"
  readonly message: string
}

type SocketHandler = {
  readonly onConnection: (socket: Socket) => void
  readonly emitGraphUpdated: (payload: GraphUpdatedPayload) => void
  readonly emitNodeUpdated: (ticker: string, payload: NodeUpdatedPayload) => void
  readonly emitEdgeUpdated: (edgeId: string, payload: EdgeUpdatedPayload) => void
  readonly emitSimulationStarted: (payload: SimulationStartedPayload) => void
  readonly emitSimulationStep: (step: PropagationStep) => void
  readonly emitSimulationCompleted: (payload: SimulationCompletedPayload) => void
  readonly emitDCFRecalculated: (payload: DCFRecalculatedPayload) => void
  readonly emitExtractionProgress: (payload: ExtractionProgressPayload) => void
}

function createSocketHandler(io: Server): SocketHandler {
  function onConnection(socket: Socket): void {
    socket.on("subscribe:graph", () => {
      socket.join(ROOMS.GRAPH)
    })

    socket.on("subscribe:simulation", () => {
      socket.join(ROOMS.SIMULATION)
    })

    socket.on("subscribe:node", (ticker: string) => {
      socket.join(ROOMS.node(ticker))
    })
  }

  function emitGraphUpdated(payload: GraphUpdatedPayload): void {
    io.to(ROOMS.GRAPH).emit(EVENTS.GRAPH_UPDATED, payload)
  }

  function emitNodeUpdated(ticker: string, payload: NodeUpdatedPayload): void {
    io.to(ROOMS.GRAPH).emit(EVENTS.NODE_UPDATED, payload)
    io.to(ROOMS.node(ticker)).emit(EVENTS.NODE_UPDATED, payload)
  }

  function emitEdgeUpdated(edgeId: string, payload: EdgeUpdatedPayload): void {
    io.to(ROOMS.GRAPH).emit(EVENTS.EDGE_UPDATED, payload)
  }

  function emitSimulationStarted(payload: SimulationStartedPayload): void {
    io.to(ROOMS.SIMULATION).emit(EVENTS.SIMULATION_STARTED, payload)
  }

  function emitSimulationStep(step: PropagationStep): void {
    io.to(ROOMS.SIMULATION).emit(EVENTS.SIMULATION_STEP, step)
  }

  function emitSimulationCompleted(payload: SimulationCompletedPayload): void {
    io.to(ROOMS.SIMULATION).emit(EVENTS.SIMULATION_COMPLETED, payload)
  }

  function emitDCFRecalculated(payload: DCFRecalculatedPayload): void {
    io.to(ROOMS.GRAPH).emit(EVENTS.DCF_RECALCULATED, payload)
    io.to(ROOMS.node(payload.ticker)).emit(EVENTS.DCF_RECALCULATED, payload)
  }

  function emitExtractionProgress(payload: ExtractionProgressPayload): void {
    io.to(ROOMS.GRAPH).emit(EVENTS.EXTRACTION_PROGRESS, payload)
  }

  return {
    onConnection,
    emitGraphUpdated,
    emitNodeUpdated,
    emitEdgeUpdated,
    emitSimulationStarted,
    emitSimulationStep,
    emitSimulationCompleted,
    emitDCFRecalculated,
    emitExtractionProgress,
  }
}

export { createSocketHandler }
export type {
  SocketHandler,
  GraphUpdatedPayload,
  NodeUpdatedPayload,
  EdgeUpdatedPayload,
  SimulationStartedPayload,
  SimulationCompletedPayload,
  DCFRecalculatedPayload,
  ExtractionProgressPayload,
}
```

- [ ] **Step 5: Create websocket index**

Create `packages/server/src/websocket/index.ts`:
```typescript
export { createSocketHandler } from "./socket-handler.js"
export { EVENTS, ROOMS } from "./events.js"
export type {
  SocketHandler,
  GraphUpdatedPayload,
  NodeUpdatedPayload,
  EdgeUpdatedPayload,
  SimulationStartedPayload,
  SimulationCompletedPayload,
  DCFRecalculatedPayload,
  ExtractionProgressPayload,
} from "./socket-handler.js"
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/websocket/socket-handler.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/websocket/
git commit --no-gpg-sign -m "feat: add WebSocket event constants and socket handler with room subscriptions"
```

---

### Task 3: Graph Router

**Files:**
- Create: `packages/server/src/api/graph-router.ts`
- Create: `packages/server/src/api/graph-router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/api/graph-router.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createGraphRouter } from "./graph-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

// Repositories are provided by Phase 4 -- mock the interface here
type GraphRepository = {
  getGraph: () => Promise<{ nodes: unknown[]; edges: unknown[] }>
  addCompany: (data: unknown) => Promise<unknown>
  removeCompany: (ticker: string) => Promise<void>
  addEdge: (data: unknown) => Promise<unknown>
  removeEdge: (id: string) => Promise<void>
  updateEdge: (id: string, data: unknown) => Promise<unknown>
}

function makeRepo(overrides: Partial<GraphRepository> = {}): GraphRepository {
  return {
    getGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    addCompany: vi.fn().mockResolvedValue({ ticker: "AAPL", name: "Apple Inc.", sector: "Tech", country: "US", marketCap: 3_000_000_000_000, lastUpdated: "2026-01-01T00:00:00.000Z" }),
    removeCompany: vi.fn().mockResolvedValue(undefined),
    addEdge: vi.fn().mockResolvedValue({ id: "e1", fromTicker: "TSM", toTicker: "AAPL", revenueWeight: 0.25, productCategory: "Chips", confidence: 0.9, source: "manual", passthrough: 0.7, lastVerified: "2026-01-01T00:00:00.000Z" }),
    removeEdge: vi.fn().mockResolvedValue(undefined),
    updateEdge: vi.fn().mockResolvedValue({ id: "e1", fromTicker: "TSM", toTicker: "AAPL", revenueWeight: 0.30, productCategory: "Chips", confidence: 0.9, source: "manual", passthrough: 0.7, lastVerified: "2026-01-01T00:00:00.000Z" }),
    ...overrides,
  }
}

function makeSocketHandler(): SocketHandler {
  return {
    onConnection: vi.fn(),
    emitGraphUpdated: vi.fn(),
    emitNodeUpdated: vi.fn(),
    emitEdgeUpdated: vi.fn(),
    emitSimulationStarted: vi.fn(),
    emitSimulationStep: vi.fn(),
    emitSimulationCompleted: vi.fn(),
    emitDCFRecalculated: vi.fn(),
    emitExtractionProgress: vi.fn(),
  }
}

function makeApp(repo: GraphRepository, ws: SocketHandler): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/graph", createGraphRouter(repo, ws))
  return app
}

describe("GET /api/graph", () => {
  it("returns the full graph with nodes and edges", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).get("/api/graph")

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ nodes: [], edges: [] })
    expect(repo.getGraph).toHaveBeenCalledOnce()
  })
})

describe("POST /api/graph/companies", () => {
  it("creates a company and returns 201", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .post("/api/graph/companies")
      .send({ ticker: "AAPL", name: "Apple Inc.", sector: "Technology", country: "US", marketCap: 3_000_000_000_000 })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ ticker: "AAPL" })
    expect(repo.addCompany).toHaveBeenCalledOnce()
  })

  it("emits graph:updated after creating a company", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app)
      .post("/api/graph/companies")
      .send({ ticker: "AAPL", name: "Apple Inc.", sector: "Technology", country: "US", marketCap: 3_000_000_000_000 })

    expect(ws.emitGraphUpdated).toHaveBeenCalledOnce()
  })

  it("returns 400 for invalid company data", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .post("/api/graph/companies")
      .send({ ticker: "", name: "" })

    expect(response.status).toBe(400)
    expect(repo.addCompany).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/graph/companies/:ticker", () => {
  it("removes a company and returns 204", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).delete("/api/graph/companies/AAPL")

    expect(response.status).toBe(204)
    expect(repo.removeCompany).toHaveBeenCalledWith("AAPL")
  })

  it("emits graph:updated after removing a company", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app).delete("/api/graph/companies/AAPL")

    expect(ws.emitGraphUpdated).toHaveBeenCalledOnce()
  })
})

describe("POST /api/graph/edges", () => {
  it("creates an edge and returns 201", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .post("/api/graph/edges")
      .send({
        fromTicker: "TSM",
        toTicker: "AAPL",
        revenueWeight: 0.25,
        productCategory: "Advanced Logic Chips",
        confidence: 0.9,
        source: "manual",
      })

    expect(response.status).toBe(201)
    expect(repo.addEdge).toHaveBeenCalledOnce()
  })

  it("emits graph:updated after creating an edge", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app)
      .post("/api/graph/edges")
      .send({
        fromTicker: "TSM",
        toTicker: "AAPL",
        revenueWeight: 0.25,
        productCategory: "Advanced Logic Chips",
        confidence: 0.9,
        source: "manual",
      })

    expect(ws.emitGraphUpdated).toHaveBeenCalledOnce()
  })

  it("returns 400 when revenueWeight is outside 0-1 range", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .post("/api/graph/edges")
      .send({
        fromTicker: "TSM",
        toTicker: "AAPL",
        revenueWeight: 1.5,
        productCategory: "Chips",
        confidence: 0.9,
        source: "manual",
      })

    expect(response.status).toBe(400)
    expect(repo.addEdge).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/graph/edges/:id", () => {
  it("removes an edge and returns 204", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).delete("/api/graph/edges/e1")

    expect(response.status).toBe(204)
    expect(repo.removeEdge).toHaveBeenCalledWith("e1")
  })

  it("emits graph:updated after removing an edge", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app).delete("/api/graph/edges/e1")

    expect(ws.emitGraphUpdated).toHaveBeenCalledOnce()
  })
})

describe("PATCH /api/graph/edges/:id", () => {
  it("updates edge metadata and returns the updated edge", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .patch("/api/graph/edges/e1")
      .send({ revenueWeight: 0.30 })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ id: "e1", revenueWeight: 0.30 })
    expect(repo.updateEdge).toHaveBeenCalledWith("e1", { revenueWeight: 0.30 })
  })

  it("emits edge:updated after patching an edge", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app)
      .patch("/api/graph/edges/e1")
      .send({ revenueWeight: 0.30 })

    expect(ws.emitEdgeUpdated).toHaveBeenCalledWith("e1", expect.any(Object))
  })

  it("returns 400 for invalid patch body", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .patch("/api/graph/edges/e1")
      .send({ revenueWeight: -0.5 })

    expect(response.status).toBe(400)
    expect(repo.updateEdge).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/api/graph-router.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/api/graph-router.ts`:
```typescript
import { Router, type IRouter } from "express"
import {
  CreateCompanySchema,
  CreateSupplyEdgeSchema,
  UpdateSupplyEdgeSchema,
} from "@tori/shared"
import { validateBody } from "./validation.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

type GraphRepository = {
  readonly getGraph: () => Promise<{ nodes: unknown[]; edges: unknown[] }>
  readonly addCompany: (data: unknown) => Promise<unknown>
  readonly removeCompany: (ticker: string) => Promise<void>
  readonly addEdge: (data: unknown) => Promise<unknown>
  readonly removeEdge: (id: string) => Promise<void>
  readonly updateEdge: (id: string, data: unknown) => Promise<unknown>
}

function createGraphRouter(repo: GraphRepository, ws: SocketHandler): IRouter {
  const router = Router()

  router.get("/", async (_req, res) => {
    const graph = await repo.getGraph()
    res.json(graph)
  })

  router.post(
    "/companies",
    validateBody(CreateCompanySchema),
    async (req, res) => {
      const company = await repo.addCompany(req.body)
      const graph = await repo.getGraph()
      ws.emitGraphUpdated({ nodes: graph.nodes, edges: graph.edges })
      res.status(201).json(company)
    },
  )

  router.delete("/companies/:ticker", async (req, res) => {
    await repo.removeCompany(req.params["ticker"]!)
    const graph = await repo.getGraph()
    ws.emitGraphUpdated({ nodes: graph.nodes, edges: graph.edges })
    res.status(204).send()
  })

  router.post(
    "/edges",
    validateBody(CreateSupplyEdgeSchema),
    async (req, res) => {
      const edge = await repo.addEdge(req.body)
      const graph = await repo.getGraph()
      ws.emitGraphUpdated({ nodes: graph.nodes, edges: graph.edges })
      res.status(201).json(edge)
    },
  )

  router.delete("/edges/:id", async (req, res) => {
    await repo.removeEdge(req.params["id"]!)
    const graph = await repo.getGraph()
    ws.emitGraphUpdated({ nodes: graph.nodes, edges: graph.edges })
    res.status(204).send()
  })

  router.patch(
    "/edges/:id",
    validateBody(UpdateSupplyEdgeSchema),
    async (req, res) => {
      const id = req.params["id"]!
      const edge = await repo.updateEdge(id, req.body)
      ws.emitEdgeUpdated(id, { edgeId: id, data: edge })
      res.json(edge)
    },
  )

  return router
}

export { createGraphRouter }
export type { GraphRepository }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/api/graph-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/api/graph-router.ts packages/server/src/api/graph-router.test.ts
git commit --no-gpg-sign -m "feat: add graph CRUD router with Zod validation and WebSocket broadcast"
```

---

### Task 4: Financial Router

**Files:**
- Create: `packages/server/src/api/financial-router.ts`
- Create: `packages/server/src/api/financial-router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/api/financial-router.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createFinancialRouter } from "./financial-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"
import type { FinancialModel, DCFResult } from "@tori/shared"

type FinancialRepository = {
  getFinancials: (ticker: string) => Promise<FinancialModel | null>
  updateFinancials: (ticker: string, data: unknown) => Promise<FinancialModel>
  recalculateDCF: (ticker: string) => Promise<DCFResult>
}

function makeDrivers() {
  return {
    revenue: 400_000_000_000,
    revenueGrowthRate: 0.08,
    cogsPercent: 0.56,
    sgaPercent: 0.06,
    rdPercent: 0.07,
    daPercent: 0.04,
    interestExpense: 3_900_000_000,
    taxRate: 0.15,
    cashAndEquivalents: 165_000_000_000,
    accountsReceivable: 51_000_000_000,
    inventory: 7_000_000_000,
    ppe: 43_000_000_000,
    totalDebt: 104_000_000_000,
    accountsPayable: 62_000_000_000,
    capexPercent: 0.03,
    nwcChange: 2_000_000_000,
    wacc: 0.09,
    terminalGrowthRate: 0.03,
    projectionYears: 5,
    sharesOutstanding: 15_200_000_000,
  }
}

function makeModel(ticker: string): FinancialModel {
  return {
    companyTicker: ticker,
    fiscalYear: 2025,
    drivers: makeDrivers(),
    overrides: {},
  }
}

function makeDCFResult(): DCFResult {
  return {
    projectedFCFs: [80_000_000_000, 86_000_000_000, 92_000_000_000, 99_000_000_000, 107_000_000_000],
    terminalValue: 1_800_000_000_000,
    discountedFCFs: [73_000_000_000, 71_000_000_000, 69_000_000_000, 67_000_000_000, 65_000_000_000],
    discountedTerminalValue: 1_100_000_000_000,
    enterpriseValue: 1_445_000_000_000,
    netDebt: -61_000_000_000,
    equityValue: 1_506_000_000_000,
    perShareValue: 99.08,
    threeStatements: [],
  }
}

function makeRepo(overrides: Partial<FinancialRepository> = {}): FinancialRepository {
  return {
    getFinancials: vi.fn().mockResolvedValue(makeModel("AAPL")),
    updateFinancials: vi.fn().mockResolvedValue(makeModel("AAPL")),
    recalculateDCF: vi.fn().mockResolvedValue(makeDCFResult()),
    ...overrides,
  }
}

function makeSocketHandler(): SocketHandler {
  return {
    onConnection: vi.fn(),
    emitGraphUpdated: vi.fn(),
    emitNodeUpdated: vi.fn(),
    emitEdgeUpdated: vi.fn(),
    emitSimulationStarted: vi.fn(),
    emitSimulationStep: vi.fn(),
    emitSimulationCompleted: vi.fn(),
    emitDCFRecalculated: vi.fn(),
    emitExtractionProgress: vi.fn(),
  }
}

function makeApp(repo: FinancialRepository, ws: SocketHandler): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/companies", createFinancialRouter(repo, ws))
  return app
}

describe("GET /api/companies/:ticker/financials", () => {
  it("returns the financial model for a known ticker", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).get("/api/companies/AAPL/financials")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ companyTicker: "AAPL" })
    expect(repo.getFinancials).toHaveBeenCalledWith("AAPL")
  })

  it("returns 404 when ticker has no financial model", async () => {
    const repo = makeRepo({ getFinancials: vi.fn().mockResolvedValue(null) })
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).get("/api/companies/UNKNOWN/financials")

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ error: expect.stringContaining("not found") })
  })
})

describe("PUT /api/companies/:ticker/financials", () => {
  it("updates drivers and returns the updated model", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .put("/api/companies/AAPL/financials")
      .send({ drivers: { wacc: 0.10 } })

    expect(response.status).toBe(200)
    expect(repo.updateFinancials).toHaveBeenCalledWith("AAPL", { drivers: { wacc: 0.10 } })
  })

  it("emits node:updated after updating financials", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app)
      .put("/api/companies/AAPL/financials")
      .send({ overrides: { wacc: 0.10 } })

    expect(ws.emitNodeUpdated).toHaveBeenCalledWith("AAPL", expect.any(Object))
  })

  it("returns 400 for invalid driver values", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app)
      .put("/api/companies/AAPL/financials")
      .send({ drivers: { wacc: -1 } })

    expect(response.status).toBe(400)
    expect(repo.updateFinancials).not.toHaveBeenCalled()
  })
})

describe("POST /api/companies/:ticker/dcf", () => {
  it("triggers DCF recalculation and returns the result", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    const response = await request(app).post("/api/companies/AAPL/dcf")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ equityValue: expect.any(Number) })
    expect(repo.recalculateDCF).toHaveBeenCalledWith("AAPL")
  })

  it("emits dcf:recalculated after computation", async () => {
    const repo = makeRepo()
    const ws = makeSocketHandler()
    const app = makeApp(repo, ws)

    await request(app).post("/api/companies/AAPL/dcf")

    expect(ws.emitDCFRecalculated).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "AAPL" }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/api/financial-router.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/api/financial-router.ts`:
```typescript
import { Router, type IRouter } from "express"
import type { FinancialModel, DCFResult } from "@tori/shared"
import { UpdateFinancialModelSchema } from "@tori/shared"
import { validateBody } from "./validation.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

type FinancialRepository = {
  readonly getFinancials: (ticker: string) => Promise<FinancialModel | null>
  readonly updateFinancials: (ticker: string, data: unknown) => Promise<FinancialModel>
  readonly recalculateDCF: (ticker: string) => Promise<DCFResult>
}

function createFinancialRouter(repo: FinancialRepository, ws: SocketHandler): IRouter {
  const router = Router()

  router.get("/:ticker/financials", async (req, res) => {
    const ticker = req.params["ticker"]!
    const model = await repo.getFinancials(ticker)
    if (model === null) {
      res.status(404).json({ error: `Financial model for ${ticker} not found` })
      return
    }
    res.json(model)
  })

  router.put(
    "/:ticker/financials",
    validateBody(UpdateFinancialModelSchema),
    async (req, res) => {
      const ticker = req.params["ticker"]!
      const model = await repo.updateFinancials(ticker, req.body)
      ws.emitNodeUpdated(ticker, { ticker, data: model })
      res.json(model)
    },
  )

  router.post("/:ticker/dcf", async (req, res) => {
    const ticker = req.params["ticker"]!
    const result = await repo.recalculateDCF(ticker)
    ws.emitDCFRecalculated({
      ticker,
      equityValue: result.equityValue,
      perShareValue: result.perShareValue,
    })
    res.json(result)
  })

  return router
}

export { createFinancialRouter }
export type { FinancialRepository }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/api/financial-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/api/financial-router.ts packages/server/src/api/financial-router.test.ts
git commit --no-gpg-sign -m "feat: add financial model router with GET/PUT/DCF endpoints and WebSocket broadcast"
```

---

### Task 5: Scenario Router

**Files:**
- Create: `packages/server/src/api/scenario-router.ts`
- Create: `packages/server/src/api/scenario-router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/api/scenario-router.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createScenarioRouter } from "./scenario-router.js"
import type { Scenario, TariffPolicy } from "@tori/shared"

type ScenarioRepository = {
  listScenarios: () => Promise<Scenario[]>
  createScenario: (data: unknown) => Promise<Scenario>
  getScenario: (id: string) => Promise<Scenario | null>
  addPolicy: (scenarioId: string, data: unknown) => Promise<TariffPolicy>
  removePolicy: (scenarioId: string, policyId: string) => Promise<void>
}

function makeScenario(id: string): Scenario {
  return {
    id,
    name: "Trade War Scenario",
    description: "25% tariffs on all Taiwan semis",
    policies: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

function makePolicy(id: string): TariffPolicy {
  return {
    id,
    scenarioId: "s1",
    name: "25% Taiwan semiconductor tariff",
    tariffPercent: 0.25,
    targetCountry: "Taiwan",
    targetSector: "Semiconductors",
    targetProduct: null,
    affectedEdgeIds: [],
  }
}

function makeRepo(overrides: Partial<ScenarioRepository> = {}): ScenarioRepository {
  return {
    listScenarios: vi.fn().mockResolvedValue([makeScenario("s1")]),
    createScenario: vi.fn().mockResolvedValue(makeScenario("s1")),
    getScenario: vi.fn().mockResolvedValue(makeScenario("s1")),
    addPolicy: vi.fn().mockResolvedValue(makePolicy("p1")),
    removePolicy: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeApp(repo: ScenarioRepository): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/scenarios", createScenarioRouter(repo))
  return app
}

describe("GET /api/scenarios", () => {
  it("returns a list of scenarios", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app).get("/api/scenarios")

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
    expect(response.body[0]).toMatchObject({ id: "s1" })
  })
})

describe("POST /api/scenarios", () => {
  it("creates a scenario and returns 201", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app)
      .post("/api/scenarios")
      .send({ name: "Trade War Scenario", description: "Severe tariffs on all trade partners" })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ id: "s1", name: "Trade War Scenario" })
    expect(repo.createScenario).toHaveBeenCalledOnce()
  })

  it("returns 400 when name is missing", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app)
      .post("/api/scenarios")
      .send({ description: "no name given" })

    expect(response.status).toBe(400)
    expect(repo.createScenario).not.toHaveBeenCalled()
  })
})

describe("GET /api/scenarios/:id", () => {
  it("returns the scenario with its policies", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app).get("/api/scenarios/s1")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ id: "s1" })
    expect(repo.getScenario).toHaveBeenCalledWith("s1")
  })

  it("returns 404 when scenario does not exist", async () => {
    const repo = makeRepo({ getScenario: vi.fn().mockResolvedValue(null) })
    const app = makeApp(repo)

    const response = await request(app).get("/api/scenarios/does-not-exist")

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ error: expect.stringContaining("not found") })
  })
})

describe("POST /api/scenarios/:id/policies", () => {
  it("adds a tariff policy to the scenario and returns 201", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app)
      .post("/api/scenarios/s1/policies")
      .send({
        name: "25% Taiwan semiconductor tariff",
        tariffPercent: 0.25,
        targetCountry: "Taiwan",
      })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ id: "p1" })
    expect(repo.addPolicy).toHaveBeenCalledWith("s1", expect.any(Object))
  })

  it("returns 400 when tariffPercent exceeds 1", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app)
      .post("/api/scenarios/s1/policies")
      .send({
        name: "Invalid tariff",
        tariffPercent: 2.0,
        targetCountry: "Taiwan",
      })

    expect(response.status).toBe(400)
    expect(repo.addPolicy).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/scenarios/:id/policies/:pid", () => {
  it("removes a policy and returns 204", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app).delete("/api/scenarios/s1/policies/p1")

    expect(response.status).toBe(204)
    expect(repo.removePolicy).toHaveBeenCalledWith("s1", "p1")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/api/scenario-router.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/api/scenario-router.ts`:
```typescript
import { Router, type IRouter } from "express"
import type { Scenario, TariffPolicy } from "@tori/shared"
import { CreateScenarioSchema, CreateTariffPolicySchema } from "@tori/shared"
import { validateBody } from "./validation.js"

type ScenarioRepository = {
  readonly listScenarios: () => Promise<Scenario[]>
  readonly createScenario: (data: unknown) => Promise<Scenario>
  readonly getScenario: (id: string) => Promise<Scenario | null>
  readonly addPolicy: (scenarioId: string, data: unknown) => Promise<TariffPolicy>
  readonly removePolicy: (scenarioId: string, policyId: string) => Promise<void>
}

function createScenarioRouter(repo: ScenarioRepository): IRouter {
  const router = Router()

  router.get("/", async (_req, res) => {
    const scenarios = await repo.listScenarios()
    res.json(scenarios)
  })

  router.post(
    "/",
    validateBody(CreateScenarioSchema),
    async (req, res) => {
      const scenario = await repo.createScenario(req.body)
      res.status(201).json(scenario)
    },
  )

  router.get("/:id", async (req, res) => {
    const id = req.params["id"]!
    const scenario = await repo.getScenario(id)
    if (scenario === null) {
      res.status(404).json({ error: `Scenario ${id} not found` })
      return
    }
    res.json(scenario)
  })

  router.post(
    "/:id/policies",
    validateBody(CreateTariffPolicySchema),
    async (req, res) => {
      const scenarioId = req.params["id"]!
      const policy = await repo.addPolicy(scenarioId, req.body)
      res.status(201).json(policy)
    },
  )

  router.delete("/:id/policies/:pid", async (req, res) => {
    const scenarioId = req.params["id"]!
    const policyId = req.params["pid"]!
    await repo.removePolicy(scenarioId, policyId)
    res.status(204).send()
  })

  return router
}

export { createScenarioRouter }
export type { ScenarioRepository }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/api/scenario-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/api/scenario-router.ts packages/server/src/api/scenario-router.test.ts
git commit --no-gpg-sign -m "feat: add scenario and tariff policy router with Zod validation"
```

---

### Task 6: Simulation Router

**Files:**
- Create: `packages/server/src/api/simulation-router.ts`
- Create: `packages/server/src/api/simulation-router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/api/simulation-router.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createSimulationRouter } from "./simulation-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"
import type { SimulationResult, ShockImpact, PropagationStep } from "@tori/shared"

type SimulationService = {
  runSimulation: (
    scenarioId: string,
    onStep: (step: PropagationStep) => void,
  ) => Promise<SimulationResult>
}

function makeImpact(ticker: string): ShockImpact {
  return {
    ticker,
    baselineValuation: 1_000_000,
    shockedValuation: 800_000,
    delta: -200_000,
    percentChange: -0.20,
  }
}

function makeResult(scenarioId: string): SimulationResult {
  return {
    scenarioId,
    impacts: new Map([
      ["AAPL", makeImpact("AAPL")],
      ["TSM", makeImpact("TSM")],
    ]),
    iterationCount: 3,
    converged: true,
  }
}

function makeService(overrides: Partial<SimulationService> = {}): SimulationService {
  return {
    runSimulation: vi.fn().mockImplementation(
      async (scenarioId: string, onStep: (step: PropagationStep) => void) => {
        onStep({ iteration: 1, affectedTicker: "TSM", previousValuation: 1_000_000, newValuation: 900_000, delta: -100_000 })
        onStep({ iteration: 2, affectedTicker: "AAPL", previousValuation: 1_000_000, newValuation: 850_000, delta: -150_000 })
        return makeResult(scenarioId)
      },
    ),
    ...overrides,
  }
}

function makeSocketHandler(): SocketHandler {
  return {
    onConnection: vi.fn(),
    emitGraphUpdated: vi.fn(),
    emitNodeUpdated: vi.fn(),
    emitEdgeUpdated: vi.fn(),
    emitSimulationStarted: vi.fn(),
    emitSimulationStep: vi.fn(),
    emitSimulationCompleted: vi.fn(),
    emitDCFRecalculated: vi.fn(),
    emitExtractionProgress: vi.fn(),
  }
}

function makeApp(service: SimulationService, ws: SocketHandler): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/simulate", createSimulationRouter(service, ws))
  return app
}

describe("POST /api/simulate/:scenarioId", () => {
  it("runs the simulation and returns aggregated results", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app).post("/api/simulate/s1")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      scenarioId: "s1",
      iterationCount: 3,
      converged: true,
    })
    expect(response.body.impacts).toHaveLength(2)
  })

  it("emits simulation:started before running", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    await request(app).post("/api/simulate/s1")

    expect(ws.emitSimulationStarted).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioId: "s1" }),
    )
  })

  it("emits simulation:step for each propagation iteration", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    await request(app).post("/api/simulate/s1")

    expect(ws.emitSimulationStep).toHaveBeenCalledTimes(2)
    expect(ws.emitSimulationStep).toHaveBeenCalledWith(
      expect.objectContaining({ affectedTicker: "TSM" }),
    )
    expect(ws.emitSimulationStep).toHaveBeenCalledWith(
      expect.objectContaining({ affectedTicker: "AAPL" }),
    )
  })

  it("emits simulation:completed with serialized impacts", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    await request(app).post("/api/simulate/s1")

    expect(ws.emitSimulationCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        scenarioId: "s1",
        converged: true,
        impacts: expect.arrayContaining([
          expect.objectContaining({ ticker: "AAPL" }),
        ]),
      }),
    )
  })

  it("serializes Map impacts to array in REST response", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app).post("/api/simulate/s1")

    // JSON.stringify cannot serialize Maps -- verify the response is an array
    expect(Array.isArray(response.body.impacts)).toBe(true)
    expect(response.body.impacts).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/api/simulation-router.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/api/simulation-router.ts`:
```typescript
import { Router, type IRouter } from "express"
import type { SimulationResult, PropagationStep } from "@tori/shared"
import type { SocketHandler } from "../websocket/socket-handler.js"
import { randomUUID } from "node:crypto"

type SimulationService = {
  readonly runSimulation: (
    scenarioId: string,
    onStep: (step: PropagationStep) => void,
  ) => Promise<SimulationResult>
}

function serializeResult(result: SimulationResult): Record<string, unknown> {
  return {
    scenarioId: result.scenarioId,
    iterationCount: result.iterationCount,
    converged: result.converged,
    impacts: Array.from(result.impacts.values()),
  }
}

function createSimulationRouter(service: SimulationService, ws: SocketHandler): IRouter {
  const router = Router()

  router.post("/:scenarioId", async (req, res) => {
    const scenarioId = req.params["scenarioId"]!
    const jobId = randomUUID()

    ws.emitSimulationStarted({ scenarioId, jobId })

    const result = await service.runSimulation(scenarioId, (step) => {
      ws.emitSimulationStep(step)
    })

    const impacts = Array.from(result.impacts.values())

    ws.emitSimulationCompleted({
      scenarioId: result.scenarioId,
      impacts,
      iterationCount: result.iterationCount,
      converged: result.converged,
    })

    res.json(serializeResult(result))
  })

  return router
}

export { createSimulationRouter }
export type { SimulationService }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/api/simulation-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/api/simulation-router.ts packages/server/src/api/simulation-router.test.ts
git commit --no-gpg-sign -m "feat: add simulation router with real-time step emission and serialized impact response"
```

---

### Task 7: Extraction Router

**Files:**
- Create: `packages/server/src/api/extraction-router.ts`
- Create: `packages/server/src/api/extraction-router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/api/extraction-router.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createExtractionRouter } from "./extraction-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

type ExtractedRelationship = {
  name: string
  ticker: string
  relationship: string
  productCategory: string
  estimatedRevenueWeight: number
  confidence: number
  source: string
}

type ExtractionResult = {
  company: string
  ticker: string
  suppliers: ExtractedRelationship[]
  customers: ExtractedRelationship[]
  extractionId: string
}

type ExtractionService = {
  extractSupplyChain: (
    ticker: string,
    onProgress: (status: string, message: string) => void,
  ) => Promise<ExtractionResult>
  approveExtraction: (extractionId: string, approvedIds: string[]) => Promise<void>
}

function makeExtractionResult(): ExtractionResult {
  return {
    company: "Apple Inc.",
    ticker: "AAPL",
    extractionId: "ext-123",
    suppliers: [
      {
        name: "Taiwan Semiconductor Manufacturing",
        ticker: "TSM",
        relationship: "Primary foundry for A-series chips",
        productCategory: "Advanced Logic Chips",
        estimatedRevenueWeight: 0.25,
        confidence: 0.92,
        source: "10-K FY2025",
      },
    ],
    customers: [],
  }
}

function makeService(overrides: Partial<ExtractionService> = {}): ExtractionService {
  return {
    extractSupplyChain: vi.fn().mockImplementation(
      async (ticker: string, onProgress: (status: string, message: string) => void) => {
        onProgress("fetching", `Fetching 10-K for ${ticker}`)
        onProgress("extracting", "Sending to LLM for extraction")
        onProgress("done", "Extraction complete")
        return makeExtractionResult()
      },
    ),
    approveExtraction: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeSocketHandler(): SocketHandler {
  return {
    onConnection: vi.fn(),
    emitGraphUpdated: vi.fn(),
    emitNodeUpdated: vi.fn(),
    emitEdgeUpdated: vi.fn(),
    emitSimulationStarted: vi.fn(),
    emitSimulationStep: vi.fn(),
    emitSimulationCompleted: vi.fn(),
    emitDCFRecalculated: vi.fn(),
    emitExtractionProgress: vi.fn(),
  }
}

function makeApp(service: ExtractionService, ws: SocketHandler): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/extract", createExtractionRouter(service, ws))
  return app
}

describe("POST /api/extract/supply-chain", () => {
  it("extracts supply chain relationships and returns them", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app)
      .post("/api/extract/supply-chain")
      .send({ ticker: "AAPL" })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      ticker: "AAPL",
      extractionId: "ext-123",
      suppliers: expect.arrayContaining([
        expect.objectContaining({ ticker: "TSM" }),
      ]),
    })
    expect(service.extractSupplyChain).toHaveBeenCalledWith("AAPL", expect.any(Function))
  })

  it("emits extraction:progress events during extraction", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    await request(app)
      .post("/api/extract/supply-chain")
      .send({ ticker: "AAPL" })

    expect(ws.emitExtractionProgress).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "AAPL", status: "fetching" }),
    )
    expect(ws.emitExtractionProgress).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "AAPL", status: "done" }),
    )
  })

  it("returns 400 when ticker is missing from request body", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app)
      .post("/api/extract/supply-chain")
      .send({})

    expect(response.status).toBe(400)
    expect(service.extractSupplyChain).not.toHaveBeenCalled()
  })

  it("returns 400 when ticker is an empty string", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app)
      .post("/api/extract/supply-chain")
      .send({ ticker: "" })

    expect(response.status).toBe(400)
  })
})

describe("POST /api/extract/approve", () => {
  it("approves extracted relationships and returns 204", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app)
      .post("/api/extract/approve")
      .send({ extractionId: "ext-123", approvedIds: ["TSM", "AVGO"] })

    expect(response.status).toBe(204)
    expect(service.approveExtraction).toHaveBeenCalledWith("ext-123", ["TSM", "AVGO"])
  })

  it("emits graph:updated after approving relationships", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    await request(app)
      .post("/api/extract/approve")
      .send({ extractionId: "ext-123", approvedIds: ["TSM"] })

    expect(ws.emitGraphUpdated).toHaveBeenCalledOnce()
  })

  it("returns 400 when extractionId is missing", async () => {
    const service = makeService()
    const ws = makeSocketHandler()
    const app = makeApp(service, ws)

    const response = await request(app)
      .post("/api/extract/approve")
      .send({ approvedIds: ["TSM"] })

    expect(response.status).toBe(400)
    expect(service.approveExtraction).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/api/extraction-router.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/api/extraction-router.ts`:
```typescript
import { Router, type IRouter } from "express"
import { z } from "zod"
import { validateBody } from "./validation.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

type ExtractedRelationship = {
  readonly name: string
  readonly ticker: string
  readonly relationship: string
  readonly productCategory: string
  readonly estimatedRevenueWeight: number
  readonly confidence: number
  readonly source: string
}

type ExtractionResult = {
  readonly company: string
  readonly ticker: string
  readonly extractionId: string
  readonly suppliers: readonly ExtractedRelationship[]
  readonly customers: readonly ExtractedRelationship[]
}

type ExtractionService = {
  readonly extractSupplyChain: (
    ticker: string,
    onProgress: (status: string, message: string) => void,
  ) => Promise<ExtractionResult>
  readonly approveExtraction: (extractionId: string, approvedIds: readonly string[]) => Promise<void>
}

const ExtractSupplyChainSchema = z.object({
  ticker: z.string().min(1),
})

const ApproveExtractionSchema = z.object({
  extractionId: z.string().min(1),
  approvedIds: z.array(z.string()),
})

function createExtractionRouter(service: ExtractionService, ws: SocketHandler): IRouter {
  const router = Router()

  router.post(
    "/supply-chain",
    validateBody(ExtractSupplyChainSchema),
    async (req, res) => {
      const { ticker } = req.body as { ticker: string }

      const result = await service.extractSupplyChain(ticker, (status, message) => {
        ws.emitExtractionProgress({
          ticker,
          status: status as "started" | "fetching" | "extracting" | "done" | "error",
          message,
        })
      })

      res.json(result)
    },
  )

  router.post(
    "/approve",
    validateBody(ApproveExtractionSchema),
    async (req, res) => {
      const { extractionId, approvedIds } = req.body as { extractionId: string; approvedIds: string[] }
      await service.approveExtraction(extractionId, approvedIds)
      // Fetch updated graph and broadcast -- service handles persistence
      ws.emitGraphUpdated({ nodes: [], edges: [] })
      res.status(204).send()
    },
  )

  return router
}

export { createExtractionRouter }
export type { ExtractionService, ExtractionResult, ExtractedRelationship }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/api/extraction-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/api/extraction-router.ts packages/server/src/api/extraction-router.test.ts
git commit --no-gpg-sign -m "feat: add LLM extraction router with progress events and approval flow"
```

---

### Task 8: Data Router

**Files:**
- Create: `packages/server/src/api/data-router.ts`
- Create: `packages/server/src/api/data-router.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/api/data-router.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createDataRouter } from "./data-router.js"

type FetchedFinancials = {
  ticker: string
  source: string
  revenue: number
  fiscalYear: number
}

type DataAdapterOrchestrator = {
  fetchAndStore: (ticker: string) => Promise<FetchedFinancials>
}

function makeOrchestrator(overrides: Partial<DataAdapterOrchestrator> = {}): DataAdapterOrchestrator {
  return {
    fetchAndStore: vi.fn().mockResolvedValue({
      ticker: "AAPL",
      source: "fmp",
      revenue: 400_000_000_000,
      fiscalYear: 2025,
    }),
    ...overrides,
  }
}

function makeApp(orchestrator: DataAdapterOrchestrator): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/data", createDataRouter(orchestrator))
  return app
}

describe("POST /api/data/fetch/:ticker", () => {
  it("fetches financial data and returns the result", async () => {
    const orchestrator = makeOrchestrator()
    const app = makeApp(orchestrator)

    const response = await request(app).post("/api/data/fetch/AAPL")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ ticker: "AAPL", source: "fmp" })
    expect(orchestrator.fetchAndStore).toHaveBeenCalledWith("AAPL")
  })

  it("passes the ticker from URL params to the orchestrator", async () => {
    const orchestrator = makeOrchestrator()
    const app = makeApp(orchestrator)

    await request(app).post("/api/data/fetch/NVDA")

    expect(orchestrator.fetchAndStore).toHaveBeenCalledWith("NVDA")
  })

  it("returns 500 when the adapter fails", async () => {
    const orchestrator = makeOrchestrator({
      fetchAndStore: vi.fn().mockRejectedValue(new Error("FMP rate limit exceeded")),
    })
    const app = makeApp(orchestrator)

    const response = await request(app).post("/api/data/fetch/AAPL")

    expect(response.status).toBe(500)
    expect(response.body).toMatchObject({ error: expect.stringContaining("Failed to fetch") })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/api/data-router.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/api/data-router.ts`:
```typescript
import { Router, type IRouter } from "express"

type FetchedFinancials = {
  readonly ticker: string
  readonly source: string
  readonly revenue: number
  readonly fiscalYear: number
}

type DataAdapterOrchestrator = {
  readonly fetchAndStore: (ticker: string) => Promise<FetchedFinancials>
}

function createDataRouter(orchestrator: DataAdapterOrchestrator): IRouter {
  const router = Router()

  router.post("/fetch/:ticker", async (req, res) => {
    const ticker = req.params["ticker"]!
    try {
      const result = await orchestrator.fetchAndStore(ticker)
      res.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.status(500).json({ error: `Failed to fetch data for ${ticker}: ${message}` })
    }
  })

  return router
}

export { createDataRouter }
export type { DataAdapterOrchestrator, FetchedFinancials }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/api/data-router.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/api/data-router.ts packages/server/src/api/data-router.test.ts
git commit --no-gpg-sign -m "feat: add data fetch router delegating to adapter orchestrator"
```

---

### Task 9: API Index and Server Integration

**Files:**
- Create: `packages/server/src/api/index.ts`
- Modify: `packages/server/src/index.ts`
- Create: `packages/server/src/api/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/api/index.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createApiRouter } from "./index.js"
import type { GraphRepository } from "./graph-router.js"
import type { FinancialRepository } from "./financial-router.js"
import type { ScenarioRepository } from "./scenario-router.js"
import type { SimulationService } from "./simulation-router.js"
import type { ExtractionService } from "./extraction-router.js"
import type { DataAdapterOrchestrator } from "./data-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

function makeGraphRepo(): GraphRepository {
  return {
    getGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    addCompany: vi.fn().mockResolvedValue({}),
    removeCompany: vi.fn().mockResolvedValue(undefined),
    addEdge: vi.fn().mockResolvedValue({}),
    removeEdge: vi.fn().mockResolvedValue(undefined),
    updateEdge: vi.fn().mockResolvedValue({}),
  }
}

function makeFinancialRepo(): FinancialRepository {
  return {
    getFinancials: vi.fn().mockResolvedValue(null),
    updateFinancials: vi.fn().mockResolvedValue({}),
    recalculateDCF: vi.fn().mockResolvedValue({}),
  }
}

function makeScenarioRepo(): ScenarioRepository {
  return {
    listScenarios: vi.fn().mockResolvedValue([]),
    createScenario: vi.fn().mockResolvedValue({}),
    getScenario: vi.fn().mockResolvedValue(null),
    addPolicy: vi.fn().mockResolvedValue({}),
    removePolicy: vi.fn().mockResolvedValue(undefined),
  }
}

function makeSimService(): SimulationService {
  return {
    runSimulation: vi.fn().mockResolvedValue({
      scenarioId: "s1",
      impacts: new Map(),
      iterationCount: 0,
      converged: true,
    }),
  }
}

function makeExtractionService(): ExtractionService {
  return {
    extractSupplyChain: vi.fn().mockResolvedValue({}),
    approveExtraction: vi.fn().mockResolvedValue(undefined),
  }
}

function makeDataOrchestrator(): DataAdapterOrchestrator {
  return {
    fetchAndStore: vi.fn().mockResolvedValue({}),
  }
}

function makeSocketHandler(): SocketHandler {
  return {
    onConnection: vi.fn(),
    emitGraphUpdated: vi.fn(),
    emitNodeUpdated: vi.fn(),
    emitEdgeUpdated: vi.fn(),
    emitSimulationStarted: vi.fn(),
    emitSimulationStep: vi.fn(),
    emitSimulationCompleted: vi.fn(),
    emitDCFRecalculated: vi.fn(),
    emitExtractionProgress: vi.fn(),
  }
}

function makeApp(): Express {
  const app = express()
  app.use(express.json())
  app.use(
    "/api",
    createApiRouter({
      graphRepo: makeGraphRepo(),
      financialRepo: makeFinancialRepo(),
      scenarioRepo: makeScenarioRepo(),
      simulationService: makeSimService(),
      extractionService: makeExtractionService(),
      dataOrchestrator: makeDataOrchestrator(),
      socketHandler: makeSocketHandler(),
    }),
  )
  return app
}

describe("API router mounting", () => {
  it("mounts health endpoint", async () => {
    const app = makeApp()
    const response = await request(app).get("/api/health")
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: "ok" })
  })

  it("mounts graph endpoints under /api/graph", async () => {
    const app = makeApp()
    const response = await request(app).get("/api/graph")
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ nodes: [], edges: [] })
  })

  it("mounts scenario endpoints under /api/scenarios", async () => {
    const app = makeApp()
    const response = await request(app).get("/api/scenarios")
    expect(response.status).toBe(200)
    expect(response.body).toEqual([])
  })

  it("mounts financial endpoints under /api/companies", async () => {
    const app = makeApp()
    const response = await request(app).get("/api/companies/AAPL/financials")
    // 404 is expected because mock returns null -- confirms mount is correct
    expect(response.status).toBe(404)
  })

  it("mounts simulation endpoint under /api/simulate", async () => {
    const app = makeApp()
    const response = await request(app).post("/api/simulate/s1")
    expect(response.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/api/index.test.ts
```

Expected: FAIL

- [ ] **Step 3: Create the API index**

Create `packages/server/src/api/index.ts`:
```typescript
import { Router, type IRouter } from "express"
import { healthRouter } from "./health.js"
import { createGraphRouter, type GraphRepository } from "./graph-router.js"
import { createFinancialRouter, type FinancialRepository } from "./financial-router.js"
import { createScenarioRouter, type ScenarioRepository } from "./scenario-router.js"
import { createSimulationRouter, type SimulationService } from "./simulation-router.js"
import { createExtractionRouter, type ExtractionService } from "./extraction-router.js"
import { createDataRouter, type DataAdapterOrchestrator } from "./data-router.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

type ApiRouterDeps = {
  readonly graphRepo: GraphRepository
  readonly financialRepo: FinancialRepository
  readonly scenarioRepo: ScenarioRepository
  readonly simulationService: SimulationService
  readonly extractionService: ExtractionService
  readonly dataOrchestrator: DataAdapterOrchestrator
  readonly socketHandler: SocketHandler
}

function createApiRouter(deps: ApiRouterDeps): IRouter {
  const router = Router()

  router.use(healthRouter)
  router.use("/graph", createGraphRouter(deps.graphRepo, deps.socketHandler))
  router.use("/companies", createFinancialRouter(deps.financialRepo, deps.socketHandler))
  router.use("/scenarios", createScenarioRouter(deps.scenarioRepo))
  router.use("/simulate", createSimulationRouter(deps.simulationService, deps.socketHandler))
  router.use("/extract", createExtractionRouter(deps.extractionService, deps.socketHandler))
  router.use("/data", createDataRouter(deps.dataOrchestrator))

  return router
}

export { createApiRouter }
export type { ApiRouterDeps }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/api/index.test.ts
```

Expected: PASS

- [ ] **Step 5: Update server entry point to use the new API router**

Edit `packages/server/src/index.ts`:
```typescript
import express, { type Express } from "express"
import { createServer } from "node:http"
import { Server } from "socket.io"
import { createApiRouter } from "./api/index.js"
import { createSocketHandler } from "./websocket/index.js"

// Placeholder service factories -- replaced when Phase 4 and Phase 5 repositories are wired
import type { GraphRepository } from "./api/graph-router.js"
import type { FinancialRepository } from "./api/financial-router.js"
import type { ScenarioRepository } from "./api/scenario-router.js"
import type { SimulationService } from "./api/simulation-router.js"
import type { ExtractionService } from "./api/extraction-router.js"
import type { DataAdapterOrchestrator } from "./api/data-router.js"

function makeNotImplemented(name: string): never {
  throw new Error(`${name} not yet wired -- complete Phase 4 and Phase 5 first`)
}

const graphRepo: GraphRepository = {
  getGraph: () => makeNotImplemented("graphRepo.getGraph"),
  addCompany: () => makeNotImplemented("graphRepo.addCompany"),
  removeCompany: () => makeNotImplemented("graphRepo.removeCompany"),
  addEdge: () => makeNotImplemented("graphRepo.addEdge"),
  removeEdge: () => makeNotImplemented("graphRepo.removeEdge"),
  updateEdge: () => makeNotImplemented("graphRepo.updateEdge"),
}

const financialRepo: FinancialRepository = {
  getFinancials: () => makeNotImplemented("financialRepo.getFinancials"),
  updateFinancials: () => makeNotImplemented("financialRepo.updateFinancials"),
  recalculateDCF: () => makeNotImplemented("financialRepo.recalculateDCF"),
}

const scenarioRepo: ScenarioRepository = {
  listScenarios: () => makeNotImplemented("scenarioRepo.listScenarios"),
  createScenario: () => makeNotImplemented("scenarioRepo.createScenario"),
  getScenario: () => makeNotImplemented("scenarioRepo.getScenario"),
  addPolicy: () => makeNotImplemented("scenarioRepo.addPolicy"),
  removePolicy: () => makeNotImplemented("scenarioRepo.removePolicy"),
}

const simulationService: SimulationService = {
  runSimulation: () => makeNotImplemented("simulationService.runSimulation"),
}

const extractionService: ExtractionService = {
  extractSupplyChain: () => makeNotImplemented("extractionService.extractSupplyChain"),
  approveExtraction: () => makeNotImplemented("extractionService.approveExtraction"),
}

const dataOrchestrator: DataAdapterOrchestrator = {
  fetchAndStore: () => makeNotImplemented("dataOrchestrator.fetchAndStore"),
}

const app: Express = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: "*" },
})

const socketHandler = createSocketHandler(io)

app.use(express.json())
app.use(
  "/api",
  createApiRouter({
    graphRepo,
    financialRepo,
    scenarioRepo,
    simulationService,
    extractionService,
    dataOrchestrator,
    socketHandler,
  }),
)

io.on("connection", (socket) => {
  socketHandler.onConnection(socket)
})

const PORT = process.env["PORT"] ?? 3000

httpServer.listen(PORT, () => {
  console.log(`Tori server running on port ${PORT}`)
})

export { app, httpServer, io }
```

- [ ] **Step 6: Run all tests to verify nothing is broken**

```bash
pnpm --filter @tori/server test
```

Expected: all existing tests PASS, new tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/api/index.ts packages/server/src/api/index.test.ts packages/server/src/index.ts
git commit --no-gpg-sign -m "feat: mount all API routers and wire socket handler into server entry point"
```

---

### Task 10: Full Test Suite Run

- [ ] **Step 1: Run the complete server test suite**

```bash
pnpm --filter @tori/server test
```

Expected: all tests PASS, no skipped tests

- [ ] **Step 2: TypeScript type-check**

```bash
pnpm --filter @tori/server lint
```

Expected: zero type errors

- [ ] **Step 3: Commit final verification**

```bash
git add -A
git commit --no-gpg-sign -m "feat: complete Phase 6 -- REST + WebSocket API layer fully tested and type-checked"
```

---

## Summary

Phase 6 adds the complete API + WebSocket surface:

| File | Purpose |
|------|---------|
| `api/validation.ts` | Generic Zod validation middleware for body and params |
| `api/graph-router.ts` | Graph CRUD (GET/POST/DELETE companies, POST/DELETE/PATCH edges) |
| `api/financial-router.ts` | Financial model GET/PUT and DCF trigger |
| `api/scenario-router.ts` | Scenario CRUD + tariff policy management |
| `api/simulation-router.ts` | Shock simulation with per-step WebSocket emission |
| `api/extraction-router.ts` | LLM extraction trigger and approval |
| `api/data-router.ts` | External financial data fetch |
| `api/index.ts` | Mounts all routers under a single `createApiRouter` factory |
| `websocket/events.ts` | Event name constants |
| `websocket/socket-handler.ts` | Room subscription and typed emit helpers |
| `websocket/index.ts` | Re-exports for clean imports |

All routers accept their dependencies (repositories, services, socket handler) via constructor injection, making them trivially mockable in tests. The server `index.ts` provides stub implementations that throw "not yet wired" errors until Phase 4 and Phase 5 supply the real repositories.
