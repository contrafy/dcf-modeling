# Graph-Based DCF Supply Chain -- Phase 7: Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full React dashboard with D3 force-directed supply chain graph, cyberpunk/neon aesthetic, real-time WebSocket updates, and interactive shock simulation visualization.

**Architecture:** React 19 SPA with Zustand for UI state, TanStack Query for server state, Socket.io client for real-time events, D3.js for the force-directed graph. All components are functional with hooks.

**Tech Stack:** React 19, Vite, D3.js v7, Socket.io Client, Zustand, TanStack Query, Tailwind CSS v4

**Spec reference:** `docs/superpowers/specs/2026-03-29-graph-dcf-supply-chain-design.md` -- Section 7

**Prerequisite:** Phase 6 complete (API + WebSocket)

---

### Task 1: Google Fonts + Base HTML

**Files:**
- Modify: `packages/client/index.html`

- [ ] **Step 1: Add Google Fonts to index.html**

Update `packages/client/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tori -- Supply Chain DCF</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@300;400;500;600;700&family=Exo+2:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/index.html
git commit --no-gpg-sign -m "feat: add Google Fonts for Orbitron, JetBrains Mono, Exo 2"
```

---

### Task 2: API Client + Socket.io Client

**Files:**
- Create: `packages/client/src/api/client.ts`
- Create: `packages/client/src/api/socket.ts`
- Create: `packages/client/src/api/queries.ts`

- [ ] **Step 1: Create base API client**

Create `packages/client/src/api/client.ts`:
```typescript
const API_BASE = "/api"

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `API error: ${response.status}`)
  }
  return response.json() as Promise<T>
}

function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path)
}

function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  })
}

function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) })
}

function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) })
}

function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" })
}

export { apiGet, apiPost, apiPut, apiPatch, apiDelete }
```

- [ ] **Step 2: Create Socket.io client**

Create `packages/client/src/api/socket.ts`:
```typescript
import { io, Socket } from "socket.io-client"

let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    socket = io({ transports: ["websocket"] })
  }
  return socket
}

function subscribeToGraph(): void {
  getSocket().emit("subscribe:graph")
}

function subscribeToSimulation(): void {
  getSocket().emit("subscribe:simulation")
}

function subscribeToNode(ticker: string): void {
  getSocket().emit("subscribe:node", ticker)
}

export { getSocket, subscribeToGraph, subscribeToSimulation, subscribeToNode }
```

- [ ] **Step 3: Create TanStack Query hooks**

Create `packages/client/src/api/queries.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./client.js"

function useGraph() {
  return useQuery({
    queryKey: ["graph"],
    queryFn: () => apiGet<{ nodes: unknown[]; edges: unknown[] }>("/graph"),
  })
}

function useCompanyFinancials(ticker: string | null) {
  return useQuery({
    queryKey: ["financials", ticker],
    queryFn: () => apiGet(`/companies/${ticker}/financials`),
    enabled: ticker !== null,
  })
}

function useScenarios() {
  return useQuery({
    queryKey: ["scenarios"],
    queryFn: () => apiGet<unknown[]>("/scenarios"),
  })
}

function useAddCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (company: { ticker: string; name: string; sector: string; country: string; marketCap: number }) =>
      apiPost("/graph/companies", company),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["graph"] }),
  })
}

function useRemoveCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ticker: string) => apiDelete(`/graph/companies/${ticker}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["graph"] }),
  })
}

function useAddEdge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (edge: { fromTicker: string; toTicker: string; revenueWeight: number; productCategory: string; confidence: number; source: string; passthrough: number }) =>
      apiPost("/graph/edges", edge),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["graph"] }),
  })
}

function useUpdateEdge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      apiPatch(`/graph/edges/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["graph"] }),
  })
}

function useUpdateFinancials() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ticker, data }: { ticker: string; data: unknown }) =>
      apiPut(`/companies/${ticker}/financials`, data),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["financials", v.ticker] }),
  })
}

function useRunDCF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ticker: string) => apiPost(`/companies/${ticker}/dcf`),
    onSuccess: (_d, ticker) => qc.invalidateQueries({ queryKey: ["financials", ticker] }),
  })
}

function useCreateScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description: string }) => apiPost("/scenarios", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios"] }),
  })
}

function useAddPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scenarioId, policy }: { scenarioId: string; policy: unknown }) =>
      apiPost(`/scenarios/${scenarioId}/policies`, policy),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios"] }),
  })
}

function useRunSimulation() {
  return useMutation({
    mutationFn: (scenarioId: string) => apiPost(`/simulate/${scenarioId}`),
  })
}

function useFetchFinancialData() {
  return useMutation({
    mutationFn: (ticker: string) => apiPost(`/data/fetch/${ticker}`),
  })
}

function useExtractSupplyChain() {
  return useMutation({
    mutationFn: (data: { ticker: string }) => apiPost("/extract/supply-chain", data),
  })
}

export {
  useGraph, useCompanyFinancials, useScenarios,
  useAddCompany, useRemoveCompany, useAddEdge, useUpdateEdge,
  useUpdateFinancials, useRunDCF,
  useCreateScenario, useAddPolicy, useRunSimulation,
  useFetchFinancialData, useExtractSupplyChain,
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/api/
git commit --no-gpg-sign -m "feat: add API client, Socket.io client, and TanStack Query hooks"
```

---

### Task 3: Zustand Stores

**Files:**
- Create: `packages/client/src/stores/graph-store.ts`
- Create: `packages/client/src/stores/selection-store.ts`
- Create: `packages/client/src/stores/scenario-store.ts`
- Create: `packages/client/src/stores/simulation-store.ts`

- [ ] **Step 1: Create graph store**

Create `packages/client/src/stores/graph-store.ts`:
```typescript
import { create } from "zustand"

type GraphNode = {
  readonly ticker: string
  readonly name: string
  readonly sector: string
  readonly country: string
  readonly marketCap: number
  readonly x?: number
  readonly y?: number
}

type GraphEdge = {
  readonly id: string
  readonly fromTicker: string
  readonly toTicker: string
  readonly revenueWeight: number
  readonly productCategory: string
  readonly passthrough: number
}

type GraphStore = {
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
  setGraph: (nodes: readonly GraphNode[], edges: readonly GraphEdge[]) => void
  updateNode: (ticker: string, patch: Partial<GraphNode>) => void
}

const useGraphStore = create<GraphStore>((set) => ({
  nodes: [],
  edges: [],
  setGraph: (nodes, edges) => set({ nodes, edges }),
  updateNode: (ticker, patch) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.ticker === ticker ? { ...n, ...patch } : n)),
    })),
}))

export { useGraphStore }
export type { GraphNode, GraphEdge }
```

- [ ] **Step 2: Create selection store**

Create `packages/client/src/stores/selection-store.ts`:
```typescript
import { create } from "zustand"

type SelectionStore = {
  readonly selectedTicker: string | null
  readonly selectedEdgeId: string | null
  selectNode: (ticker: string | null) => void
  selectEdge: (edgeId: string | null) => void
  clearSelection: () => void
}

const useSelectionStore = create<SelectionStore>((set) => ({
  selectedTicker: null,
  selectedEdgeId: null,
  selectNode: (ticker) => set({ selectedTicker: ticker, selectedEdgeId: null }),
  selectEdge: (edgeId) => set({ selectedEdgeId: edgeId, selectedTicker: null }),
  clearSelection: () => set({ selectedTicker: null, selectedEdgeId: null }),
}))

export { useSelectionStore }
```

- [ ] **Step 3: Create scenario store**

Create `packages/client/src/stores/scenario-store.ts`:
```typescript
import { create } from "zustand"

type Policy = {
  readonly id: string
  readonly name: string
  readonly tariffPercent: number
  readonly targetCountry: string
  readonly targetSector: string | null
  readonly targetProduct: string | null
}

type Scenario = {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly policies: readonly Policy[]
}

type ScenarioStore = {
  readonly scenarios: readonly Scenario[]
  readonly activeScenarioId: string | null
  setScenarios: (scenarios: readonly Scenario[]) => void
  setActiveScenario: (id: string | null) => void
}

const useScenarioStore = create<ScenarioStore>((set) => ({
  scenarios: [],
  activeScenarioId: null,
  setScenarios: (scenarios) => set({ scenarios }),
  setActiveScenario: (id) => set({ activeScenarioId: id }),
}))

export { useScenarioStore }
export type { Scenario, Policy }
```

- [ ] **Step 4: Create simulation store**

Create `packages/client/src/stores/simulation-store.ts`:
```typescript
import { create } from "zustand"

type ShockImpact = {
  readonly ticker: string
  readonly baselineValuation: number
  readonly shockedValuation: number
  readonly delta: number
  readonly percentChange: number
}

type SimulationStore = {
  readonly isRunning: boolean
  readonly impacts: readonly ShockImpact[]
  readonly animationStep: number
  readonly converged: boolean
  setRunning: (running: boolean) => void
  setImpacts: (impacts: readonly ShockImpact[]) => void
  setAnimationStep: (step: number) => void
  setConverged: (converged: boolean) => void
  reset: () => void
}

const useSimulationStore = create<SimulationStore>((set) => ({
  isRunning: false,
  impacts: [],
  animationStep: 0,
  converged: false,
  setRunning: (isRunning) => set({ isRunning }),
  setImpacts: (impacts) => set({ impacts }),
  setAnimationStep: (animationStep) => set({ animationStep }),
  setConverged: (converged) => set({ converged }),
  reset: () => set({ isRunning: false, impacts: [], animationStep: 0, converged: false }),
}))

export { useSimulationStore }
export type { ShockImpact }
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/
git commit --no-gpg-sign -m "feat: add Zustand stores for graph, selection, scenarios, and simulation"
```

---

### Task 4: Shared UI Components

**Files:**
- Create: `packages/client/src/components/shared/Card.tsx`
- Create: `packages/client/src/components/shared/MetricCard.tsx`
- Create: `packages/client/src/components/shared/Modal.tsx`
- Create: `packages/client/src/components/shared/SearchBar.tsx`

- [ ] **Step 1: Create glassmorphism Card**

Create `packages/client/src/components/shared/Card.tsx`:
```typescript
import type { ReactNode } from "react"

type CardProps = {
  readonly children: ReactNode
  readonly className?: string
  readonly glowColor?: string
}

function Card({ children, className = "", glowColor = "var(--color-neon-cyan)" }: CardProps) {
  return (
    <div
      className={`rounded-lg p-4 backdrop-blur-md ${className}`}
      style={{
        background: "rgba(22, 27, 34, 0.8)",
        border: `1px solid ${glowColor}25`,
        boxShadow: `0 0 15px ${glowColor}10, inset 0 0 15px ${glowColor}05`,
      }}
    >
      {children}
    </div>
  )
}

export { Card }
```

- [ ] **Step 2: Create MetricCard**

Create `packages/client/src/components/shared/MetricCard.tsx`:
```typescript
type MetricCardProps = {
  readonly label: string
  readonly value: string | number
  readonly delta?: number
  readonly glowColor?: string
}

function MetricCard({ label, value, delta, glowColor = "var(--color-neon-cyan)" }: MetricCardProps) {
  const deltaColor = delta === undefined ? "" : delta >= 0 ? "var(--color-neon-green)" : "var(--color-neon-red)"

  return (
    <div
      className="rounded-lg px-4 py-3 min-w-[140px]"
      style={{
        background: "rgba(22, 27, 34, 0.9)",
        border: `1px solid ${glowColor}30`,
        boxShadow: `0 0 10px ${glowColor}15`,
      }}
    >
      <div className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-body)" }}>
        {label}
      </div>
      <div className="text-lg font-semibold" style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-primary)" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {delta !== undefined && (
        <div className="text-xs mt-1" style={{ color: deltaColor, fontFamily: "var(--font-mono)" }}>
          {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(2)}%
        </div>
      )}
    </div>
  )
}

export { MetricCard }
```

- [ ] **Step 3: Create Modal**

Create `packages/client/src/components/shared/Modal.tsx`:
```typescript
import type { ReactNode } from "react"

type ModalProps = {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: string
  readonly children: ReactNode
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(4px)" }} />
      <div
        className="relative rounded-xl p-6 min-w-[400px] max-w-[600px]"
        style={{
          background: "rgba(13, 17, 23, 0.95)",
          border: "1px solid rgba(0, 240, 255, 0.2)",
          boxShadow: "0 0 30px rgba(0, 240, 255, 0.1), 0 0 60px rgba(0, 240, 255, 0.05)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-neon-cyan)" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none hover:opacity-70 transition-opacity"
            style={{ color: "var(--color-text-muted)" }}
          >
            x
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export { Modal }
```

- [ ] **Step 4: Create SearchBar**

Create `packages/client/src/components/shared/SearchBar.tsx`:
```typescript
import { useState } from "react"

type SearchBarProps = {
  readonly onSearch: (query: string) => void
  readonly placeholder?: string
}

function SearchBar({ onSearch, placeholder = "Search company ticker..." }: SearchBarProps) {
  const [query, setQuery] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query.trim().toUpperCase())
      setQuery("")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg px-3 py-2 text-sm flex-1 outline-none transition-all focus:ring-1"
        style={{
          background: "rgba(22, 27, 34, 0.9)",
          border: "1px solid rgba(0, 240, 255, 0.15)",
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-mono)",
        }}
      />
      <button
        type="submit"
        className="rounded-lg px-4 py-2 text-sm font-medium transition-all hover:brightness-110"
        style={{
          background: "rgba(0, 240, 255, 0.15)",
          border: "1px solid rgba(0, 240, 255, 0.3)",
          color: "var(--color-neon-cyan)",
          fontFamily: "var(--font-body)",
        }}
      >
        Add
      </button>
    </form>
  )
}

export { SearchBar }
```

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/shared/
git commit --no-gpg-sign -m "feat: add shared UI components with glassmorphism cyberpunk styling"
```

---

### Task 5: Dashboard Layout

**Files:**
- Create: `packages/client/src/components/layout/Header.tsx`
- Create: `packages/client/src/components/layout/PortfolioSummary.tsx`
- Create: `packages/client/src/components/layout/Dashboard.tsx`

- [ ] **Step 1: Create Header**

Create `packages/client/src/components/layout/Header.tsx`:
```typescript
import { useScenarioStore } from "../../stores/scenario-store.js"
import { useSimulationStore } from "../../stores/simulation-store.js"
import { useRunSimulation } from "../../api/queries.js"

function Header() {
  const { scenarios, activeScenarioId, setActiveScenario } = useScenarioStore()
  const { isRunning } = useSimulationStore()
  const runSim = useRunSimulation()

  return (
    <header
      className="flex items-center justify-between px-6 py-3"
      style={{
        background: "rgba(13, 17, 23, 0.95)",
        borderBottom: "1px solid rgba(0, 240, 255, 0.1)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div className="flex items-center gap-3">
        <h1
          className="text-xl font-bold tracking-widest"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-neon-cyan)" }}
        >
          TORI
        </h1>
        <span className="text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-body)" }}>
          Supply Chain DCF
        </span>
      </div>

      <div className="flex items-center gap-4">
        <select
          value={activeScenarioId ?? ""}
          onChange={(e) => setActiveScenario(e.target.value || null)}
          className="rounded-lg px-3 py-1.5 text-sm"
          style={{
            background: "rgba(22, 27, 34, 0.9)",
            border: "1px solid rgba(0, 240, 255, 0.2)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <option value="">Baseline (no shock)</option>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <button
          onClick={() => activeScenarioId && runSim.mutate(activeScenarioId)}
          disabled={!activeScenarioId || isRunning}
          className="rounded-lg px-4 py-1.5 text-sm font-medium transition-all disabled:opacity-30"
          style={{
            background: isRunning ? "rgba(255, 0, 229, 0.2)" : "rgba(0, 240, 255, 0.15)",
            border: `1px solid ${isRunning ? "rgba(255, 0, 229, 0.4)" : "rgba(0, 240, 255, 0.3)"}`,
            color: isRunning ? "var(--color-neon-magenta)" : "var(--color-neon-cyan)",
            fontFamily: "var(--font-display)",
          }}
        >
          {isRunning ? "SIMULATING..." : "RUN SHOCK"}
        </button>
      </div>
    </header>
  )
}

export { Header }
```

- [ ] **Step 2: Create PortfolioSummary**

Create `packages/client/src/components/layout/PortfolioSummary.tsx`:
```typescript
import { MetricCard } from "../shared/MetricCard.js"
import { useGraphStore } from "../../stores/graph-store.js"
import { useSimulationStore } from "../../stores/simulation-store.js"

function PortfolioSummary() {
  const { nodes, edges } = useGraphStore()
  const { impacts, isRunning } = useSimulationStore()

  const totalExposure = impacts.reduce((sum, i) => sum + Math.abs(i.delta), 0)
  const mostAtRisk = impacts.length > 0
    ? [...impacts].sort((a, b) => a.percentChange - b.percentChange)[0]
    : null

  return (
    <div
      className="flex items-center gap-3 px-6 py-3 overflow-x-auto"
      style={{
        background: "rgba(10, 10, 15, 0.8)",
        borderBottom: "1px solid rgba(0, 240, 255, 0.05)",
      }}
    >
      <MetricCard label="Nodes" value={nodes.length} glowColor="var(--color-neon-cyan)" />
      <MetricCard label="Edges" value={edges.length} glowColor="var(--color-neon-cyan)" />
      <MetricCard
        label="Total Exposure"
        value={totalExposure > 0 ? `$${(totalExposure / 1000).toFixed(0)}K` : "--"}
        glowColor="var(--color-neon-amber)"
      />
      <MetricCard
        label="Most At-Risk"
        value={mostAtRisk?.ticker ?? "--"}
        delta={mostAtRisk?.percentChange}
        glowColor="var(--color-neon-red)"
      />
      <MetricCard
        label="Sim Status"
        value={isRunning ? "Running" : impacts.length > 0 ? "Complete" : "Idle"}
        glowColor={isRunning ? "var(--color-neon-magenta)" : "var(--color-neon-green)"}
      />
    </div>
  )
}

export { PortfolioSummary }
```

- [ ] **Step 3: Create Dashboard layout**

Create `packages/client/src/components/layout/Dashboard.tsx`:
```typescript
import type { ReactNode } from "react"
import { Header } from "./Header.js"
import { PortfolioSummary } from "./PortfolioSummary.js"

type DashboardProps = {
  readonly graphPanel: ReactNode
  readonly detailPanel: ReactNode
  readonly scenarioPanel: ReactNode
}

function Dashboard({ graphPanel, detailPanel, scenarioPanel }: DashboardProps) {
  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--color-void)" }}>
      <Header />
      <PortfolioSummary />

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 relative">
          {graphPanel}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(rgba(0, 240, 255, 0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 240, 255, 0.02) 1px, transparent 1px)
              `,
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div
          className="flex h-[280px] min-h-[280px]"
          style={{ borderTop: "1px solid rgba(0, 240, 255, 0.1)" }}
        >
          <div className="flex-1 overflow-auto" style={{ borderRight: "1px solid rgba(0, 240, 255, 0.1)" }}>
            {detailPanel}
          </div>
          <div className="flex-1 overflow-auto">
            {scenarioPanel}
          </div>
        </div>
      </div>
    </div>
  )
}

export { Dashboard }
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/components/layout/
git commit --no-gpg-sign -m "feat: add dashboard layout with header, portfolio summary, and grid background"
```

---

### Task 6: D3 Force-Directed Graph

**Files:**
- Create: `packages/client/src/components/graph/SupplyChainGraph.tsx`

- [ ] **Step 1: Create D3 graph component**

Create `packages/client/src/components/graph/SupplyChainGraph.tsx`:
```typescript
import { useRef, useEffect } from "react"
import * as d3 from "d3"
import { useGraphStore } from "../../stores/graph-store.js"
import { useSelectionStore } from "../../stores/selection-store.js"
import { useSimulationStore } from "../../stores/simulation-store.js"
import type { GraphNode, GraphEdge } from "../../stores/graph-store.js"

type SimNode = d3.SimulationNodeDatum & GraphNode
type SimLink = d3.SimulationLinkDatum<SimNode> & { readonly edge: GraphEdge }

function SupplyChainGraph() {
  const svgRef = useRef<SVGSVGElement>(null)
  const { nodes, edges } = useGraphStore()
  const { selectedTicker, selectNode } = useSelectionStore()
  const { impacts } = useSimulationStore()

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    if (!svgRef.current) return

    const width = svgRef.current.clientWidth
    const height = svgRef.current.clientHeight

    svg.selectAll("*").remove()

    const defs = svg.append("defs")

    defs.append("filter")
      .attr("id", "glow")
      .append("feGaussianBlur")
      .attr("stdDeviation", "3")
      .attr("result", "coloredBlur")

    const container = svg.append("g")

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event) => container.attr("transform", event.transform))

    svg.call(zoom)

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }))
    const simLinks: SimLink[] = edges.map((e) => ({
      source: e.fromTicker,
      target: e.toTicker,
      edge: e,
    }))

    const simulation = d3.forceSimulation(simNodes)
      .force("link", d3.forceLink<SimNode, SimLink>(simLinks).id((d) => d.ticker).distance(120))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40))

    const linkGroup = container.append("g")
    const nodeGroup = container.append("g")
    const labelGroup = container.append("g")

    const links = linkGroup.selectAll("line")
      .data(simLinks)
      .join("line")
      .attr("stroke", "#00f0ff")
      .attr("stroke-opacity", (d) => 0.2 + d.edge.revenueWeight * 0.6)
      .attr("stroke-width", (d) => 1 + d.edge.revenueWeight * 3)
      .attr("filter", "url(#glow)")

    const nodeCircles = nodeGroup.selectAll("circle")
      .data(simNodes)
      .join("circle")
      .attr("r", 20)
      .attr("fill", "rgba(13, 17, 23, 0.9)")
      .attr("stroke", (d) => d.ticker === selectedTicker ? "#ff00e5" : "#00f0ff")
      .attr("stroke-width", (d) => d.ticker === selectedTicker ? 3 : 1.5)
      .attr("filter", "url(#glow)")
      .attr("cursor", "pointer")
      .on("click", (_event, d) => selectNode(d.ticker))
      .call(d3.drag<SVGCircleElement, SimNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on("drag", (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
      )

    const labels = labelGroup.selectAll("text")
      .data(simNodes)
      .join("text")
      .text((d) => d.ticker)
      .attr("text-anchor", "middle")
      .attr("dy", 35)
      .attr("fill", "#e6edf3")
      .attr("font-size", "10px")
      .attr("font-family", "var(--font-mono)")
      .attr("pointer-events", "none")

    const impactLabels = labelGroup.selectAll(".impact")
      .data(simNodes)
      .join("text")
      .attr("class", "impact")
      .attr("text-anchor", "middle")
      .attr("dy", -30)
      .attr("font-size", "9px")
      .attr("font-family", "var(--font-mono)")
      .attr("pointer-events", "none")

    simulation.on("tick", () => {
      links
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!)

      nodeCircles.attr("cx", (d) => d.x!).attr("cy", (d) => d.y!)
      labels.attr("x", (d) => d.x!).attr("y", (d) => d.y!)
      impactLabels.attr("x", (d) => d.x!).attr("y", (d) => d.y!)
    })

    if (impacts.length > 0) {
      const impactMap = new Map(impacts.map((i) => [i.ticker, i]))

      nodeCircles
        .attr("stroke", (d) => {
          if (d.ticker === selectedTicker) return "#ff00e5"
          const impact = impactMap.get(d.ticker)
          if (!impact || impact.percentChange === 0) return "#00f0ff"
          return impact.percentChange < -0.05 ? "#ff3131" : impact.percentChange < 0 ? "#ffb800" : "#39ff14"
        })
        .attr("stroke-width", (d) => {
          const impact = impactMap.get(d.ticker)
          if (!impact || impact.percentChange === 0) return 1.5
          return 2 + Math.min(Math.abs(impact.percentChange) * 20, 4)
        })

      impactLabels
        .text((d) => {
          const impact = impactMap.get(d.ticker)
          if (!impact || impact.percentChange === 0) return ""
          return `${impact.percentChange >= 0 ? "+" : ""}${(impact.percentChange * 100).toFixed(1)}%`
        })
        .attr("fill", (d) => {
          const impact = impactMap.get(d.ticker)
          if (!impact || impact.percentChange >= 0) return "#39ff14"
          return impact.percentChange < -0.05 ? "#ff3131" : "#ffb800"
        })
    }

    return () => { simulation.stop() }
  }, [nodes, edges, selectedTicker, impacts, selectNode])

  return (
    <svg
      ref={svgRef}
      className="w-full h-full"
      style={{ background: "transparent" }}
    />
  )
}

export { SupplyChainGraph }
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/components/graph/
git commit --no-gpg-sign -m "feat: add D3 force-directed supply chain graph with neon styling and shock visualization"
```

---

### Task 7: Node Detail Panel

**Files:**
- Create: `packages/client/src/components/financials/NodeDetail.tsx`

- [ ] **Step 1: Create NodeDetail panel**

Create `packages/client/src/components/financials/NodeDetail.tsx`:
```typescript
import { Card } from "../shared/Card.js"
import { useSelectionStore } from "../../stores/selection-store.js"
import { useCompanyFinancials, useRunDCF } from "../../api/queries.js"
import { useSimulationStore } from "../../stores/simulation-store.js"

function formatCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function StatRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between py-1" style={{ borderBottom: "1px solid rgba(0, 240, 255, 0.05)" }}>
      <span className="text-xs" style={{ color: "var(--color-text-secondary)", fontFamily: "var(--font-body)" }}>{label}</span>
      <span className="text-xs" style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{value}</span>
    </div>
  )
}

function NodeDetail() {
  const { selectedTicker } = useSelectionStore()
  const { data: financials } = useCompanyFinancials(selectedTicker)
  const runDCF = useRunDCF()
  const { impacts } = useSimulationStore()

  if (!selectedTicker) {
    return (
      <div className="p-4 flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-body)" }}>
          Select a node to view details
        </p>
      </div>
    )
  }

  const impact = impacts.find((i) => i.ticker === selectedTicker)
  const fin = financials as Record<string, unknown> | undefined

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-neon-cyan)" }}>
          {selectedTicker}
        </h3>
        <button
          onClick={() => runDCF.mutate(selectedTicker)}
          className="text-xs px-3 py-1 rounded transition-all hover:brightness-110"
          style={{
            background: "rgba(57, 255, 20, 0.1)",
            border: "1px solid rgba(57, 255, 20, 0.3)",
            color: "var(--color-neon-green)",
            fontFamily: "var(--font-mono)",
          }}
        >
          Run DCF
        </button>
      </div>

      {impact && (
        <Card glowColor={impact.percentChange < 0 ? "var(--color-neon-red)" : "var(--color-neon-green)"}>
          <div className="text-xs mb-1" style={{ color: "var(--color-text-muted)" }}>Shock Impact</div>
          <StatRow label="Baseline" value={formatCurrency(impact.baselineValuation)} />
          <StatRow label="Shocked" value={formatCurrency(impact.shockedValuation)} />
          <StatRow label="Delta" value={formatCurrency(impact.delta)} />
          <StatRow label="Change" value={`${(impact.percentChange * 100).toFixed(2)}%`} />
        </Card>
      )}

      {fin && (
        <Card>
          <div className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>Financial Summary</div>
          <StatRow label="Revenue" value={formatCurrency(Number(fin["revenue"] ?? 0))} />
          <StatRow label="WACC" value={`${(Number(fin["wacc"] ?? 0) * 100).toFixed(1)}%`} />
          <StatRow label="Growth" value={`${(Number(fin["revenueGrowthRate"] ?? 0) * 100).toFixed(1)}%`} />
        </Card>
      )}
    </div>
  )
}

export { NodeDetail }
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/components/financials/
git commit --no-gpg-sign -m "feat: add node detail panel with financial summary and shock impact display"
```

---

### Task 8: Scenario Panel

**Files:**
- Create: `packages/client/src/components/scenarios/ScenarioPanel.tsx`

- [ ] **Step 1: Create ScenarioPanel**

Create `packages/client/src/components/scenarios/ScenarioPanel.tsx`:
```typescript
import { useState } from "react"
import { Card } from "../shared/Card.js"
import { useScenarioStore } from "../../stores/scenario-store.js"
import { useSimulationStore } from "../../stores/simulation-store.js"
import { useCreateScenario, useAddPolicy } from "../../api/queries.js"

function ScenarioPanel() {
  const { scenarios, activeScenarioId } = useScenarioStore()
  const { impacts } = useSimulationStore()
  const createScenario = useCreateScenario()
  const addPolicy = useAddPolicy()

  const [newName, setNewName] = useState("")
  const [policyName, setPolicyName] = useState("")
  const [tariffPercent, setTariffPercent] = useState("0.25")
  const [targetCountry, setTargetCountry] = useState("")

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId)

  function handleCreateScenario() {
    if (newName.trim()) {
      createScenario.mutate({ name: newName.trim(), description: "" })
      setNewName("")
    }
  }

  function handleAddPolicy() {
    if (activeScenarioId && policyName.trim() && targetCountry.trim()) {
      addPolicy.mutate({
        scenarioId: activeScenarioId,
        policy: {
          name: policyName.trim(),
          tariffPercent: parseFloat(tariffPercent),
          targetCountry: targetCountry.trim(),
          targetSector: null,
          targetProduct: null,
        },
      })
      setPolicyName("")
      setTargetCountry("")
    }
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-neon-magenta)" }}>
        Scenarios
      </h3>

      <Card glowColor="var(--color-neon-magenta)">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New scenario name"
            className="flex-1 rounded px-2 py-1 text-xs outline-none"
            style={{
              background: "rgba(10, 10, 15, 0.8)",
              border: "1px solid rgba(255, 0, 229, 0.15)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          />
          <button
            onClick={handleCreateScenario}
            className="text-xs px-3 py-1 rounded hover:brightness-110"
            style={{
              background: "rgba(255, 0, 229, 0.1)",
              border: "1px solid rgba(255, 0, 229, 0.3)",
              color: "var(--color-neon-magenta)",
            }}
          >
            Create
          </button>
        </div>
      </Card>

      {activeScenario && (
        <Card glowColor="var(--color-neon-amber)">
          <div className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
            Add Tariff Policy to: {activeScenario.name}
          </div>
          <div className="space-y-2">
            <input
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              placeholder="Policy name"
              className="w-full rounded px-2 py-1 text-xs outline-none"
              style={{ background: "rgba(10, 10, 15, 0.8)", border: "1px solid rgba(255, 184, 0, 0.15)", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
            />
            <div className="flex gap-2">
              <input
                value={targetCountry}
                onChange={(e) => setTargetCountry(e.target.value)}
                placeholder="Target country"
                className="flex-1 rounded px-2 py-1 text-xs outline-none"
                style={{ background: "rgba(10, 10, 15, 0.8)", border: "1px solid rgba(255, 184, 0, 0.15)", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
              />
              <input
                type="number"
                value={tariffPercent}
                onChange={(e) => setTariffPercent(e.target.value)}
                step="0.05"
                min="0"
                max="1"
                className="w-20 rounded px-2 py-1 text-xs outline-none"
                style={{ background: "rgba(10, 10, 15, 0.8)", border: "1px solid rgba(255, 184, 0, 0.15)", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <button
              onClick={handleAddPolicy}
              className="text-xs px-3 py-1 rounded hover:brightness-110 w-full"
              style={{ background: "rgba(255, 184, 0, 0.1)", border: "1px solid rgba(255, 184, 0, 0.3)", color: "var(--color-neon-amber)" }}
            >
              Add Policy
            </button>
          </div>

          {activeScenario.policies.length > 0 && (
            <div className="mt-2 space-y-1">
              {activeScenario.policies.map((p) => (
                <div key={p.id} className="flex justify-between text-xs py-1" style={{ borderTop: "1px solid rgba(255, 184, 0, 0.1)" }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>{p.name}</span>
                  <span style={{ color: "var(--color-neon-amber)", fontFamily: "var(--font-mono)" }}>
                    {(p.tariffPercent * 100).toFixed(0)}% on {p.targetCountry}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {impacts.length > 0 && (
        <Card glowColor="var(--color-neon-red)">
          <div className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>Impact Rankings</div>
          {[...impacts]
            .sort((a, b) => a.percentChange - b.percentChange)
            .slice(0, 8)
            .map((i) => (
              <div key={i.ticker} className="flex justify-between text-xs py-1" style={{ borderBottom: "1px solid rgba(255, 49, 49, 0.1)" }}>
                <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{i.ticker}</span>
                <span style={{ color: i.percentChange < 0 ? "var(--color-neon-red)" : "var(--color-neon-green)", fontFamily: "var(--font-mono)" }}>
                  {i.percentChange >= 0 ? "+" : ""}{(i.percentChange * 100).toFixed(2)}%
                </span>
              </div>
            ))}
        </Card>
      )}
    </div>
  )
}

export { ScenarioPanel }
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/components/scenarios/
git commit --no-gpg-sign -m "feat: add scenario panel with policy builder and impact rankings"
```

---

### Task 9: Wire Up App.tsx

**Files:**
- Modify: `packages/client/src/App.tsx`

- [ ] **Step 1: Update App.tsx with full dashboard**

Replace `packages/client/src/App.tsx`:
```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Dashboard } from "./components/layout/Dashboard.js"
import { SupplyChainGraph } from "./components/graph/SupplyChainGraph.js"
import { NodeDetail } from "./components/financials/NodeDetail.js"
import { ScenarioPanel } from "./components/scenarios/ScenarioPanel.js"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard
        graphPanel={<SupplyChainGraph />}
        detailPanel={<NodeDetail />}
        scenarioPanel={<ScenarioPanel />}
      />
    </QueryClientProvider>
  )
}

export { App }
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm --filter @tori/client lint
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/App.tsx
git commit --no-gpg-sign -m "feat: wire up full dashboard with graph, detail panel, and scenario panel"
```

---

That completes Phase 7. The frontend now has:
- Cyberpunk/neon aesthetic with Orbitron, JetBrains Mono, Exo 2 fonts
- Glassmorphism cards with neon glow borders
- D3 force-directed graph with neon edge trails, node halos, and drag interaction
- Portfolio summary bar with aggregate metrics
- Node detail panel showing financials and shock impact
- Scenario panel with policy builder and impact rankings
- Zustand stores for graph, selection, scenario, and simulation state
- TanStack Query hooks for all API endpoints
- Socket.io client for real-time updates
- Grid overlay background for depth
