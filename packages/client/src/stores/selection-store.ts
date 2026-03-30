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
