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
