import type { CompanyNode, SupplyEdge, SupplyChainGraph } from "@dcf-modeling/shared"

function buildAdjacency(edges: readonly SupplyEdge[]): ReadonlyMap<string, readonly SupplyEdge[]> {
  const adj = new Map<string, SupplyEdge[]>()
  for (const edge of edges) {
    const existing = adj.get(edge.fromTicker) ?? []
    adj.set(edge.fromTicker, [...existing, edge])
  }
  return adj
}

function createGraph(): SupplyChainGraph {
  return { nodes: new Map(), edges: [], adjacency: new Map() }
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
  const edges = graph.edges.filter((e) => e.fromTicker !== ticker && e.toTicker !== ticker)
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
