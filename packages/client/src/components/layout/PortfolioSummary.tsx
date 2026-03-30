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
        {...(mostAtRisk !== null && mostAtRisk !== undefined ? { delta: mostAtRisk.percentChange } : {})}
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
