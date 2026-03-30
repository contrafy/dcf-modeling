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
    if (!svgRef.current) return
    const svgEl = svgRef.current
    const svg = d3.select(svgEl) as d3.Selection<SVGSVGElement, unknown, null, undefined>

    const width = svgEl.clientWidth
    const height = svgEl.clientHeight

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

    const nodeCirclesBase = nodeGroup.selectAll<SVGCircleElement, SimNode>("circle")
      .data(simNodes)
      .join("circle")
      .attr("r", 20)
      .attr("fill", "rgba(13, 17, 23, 0.9)")
      .attr("stroke", (d) => d.ticker === selectedTicker ? "#ff00e5" : "#00f0ff")
      .attr("stroke-width", (d) => d.ticker === selectedTicker ? 3 : 1.5)
      .attr("filter", "url(#glow)")
      .attr("cursor", "pointer")
      .on("click", (_event, d) => selectNode(d.ticker))

    nodeCirclesBase.call(d3.drag<SVGCircleElement, SimNode>()
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

    const nodeCircles = nodeCirclesBase

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
