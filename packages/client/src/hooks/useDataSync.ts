import { useEffect } from "react"
import { useGraph, useScenarios } from "../api/queries.js"
import { useGraphStore } from "../stores/graph-store.js"
import { useScenarioStore } from "../stores/scenario-store.js"
import type { GraphNode, GraphEdge } from "../stores/graph-store.js"
import type { Scenario } from "../stores/scenario-store.js"

function useDataSync(): void {
  const setGraph = useGraphStore((s) => s.setGraph)
  const setScenarios = useScenarioStore((s) => s.setScenarios)

  const graphQuery = useGraph()
  const scenariosQuery = useScenarios()

  useEffect(() => {
    if (!graphQuery.data) return
    const nodes = (graphQuery.data.nodes as GraphNode[]) ?? []
    const edges = (graphQuery.data.edges as GraphEdge[]) ?? []
    setGraph(nodes, edges)
  }, [graphQuery.data, setGraph])

  useEffect(() => {
    if (!scenariosQuery.data) return
    setScenarios(scenariosQuery.data as Scenario[])
  }, [scenariosQuery.data, setScenarios])
}

export { useDataSync }
