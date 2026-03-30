import type { SupplyEdge, TariffPolicy, SupplyChainGraph } from "@tori/shared"

function matchAffectedEdges(graph: SupplyChainGraph, policy: TariffPolicy): readonly SupplyEdge[] {
  if (policy.affectedEdgeIds.length > 0) {
    const edgeIdSet = new Set(policy.affectedEdgeIds)
    return graph.edges.filter((e) => edgeIdSet.has(e.id))
  }
  return graph.edges.filter((edge) => {
    const supplierNode = graph.nodes.get(edge.fromTicker)
    if (!supplierNode) return false
    const countryMatch = supplierNode.company.country === policy.targetCountry
    const sectorMatch = policy.targetSector === null || supplierNode.company.sector === policy.targetSector
    const productMatch = policy.targetProduct === null || edge.productCategory === policy.targetProduct
    return countryMatch && sectorMatch && productMatch
  })
}

export { matchAffectedEdges }
