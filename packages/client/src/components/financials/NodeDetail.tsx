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
