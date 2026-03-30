import { Card } from "../shared/Card.js"
import { useSelectionStore } from "../../stores/selection-store.js"
import { useCompanyFinancials, useRunDCF, useFetchFinancialData, useRemoveCompany } from "../../api/queries.js"
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
  const fetchData = useFetchFinancialData()
  const removeCompany = useRemoveCompany()
  const { clearSelection } = useSelectionStore()
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
  const raw = financials as { drivers?: Record<string, number>; fiscalYear?: number } | undefined
  const d = raw?.drivers

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-neon-cyan)" }}>
          {selectedTicker}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => fetchData.mutate(selectedTicker)}
            disabled={fetchData.isPending}
            className="text-xs px-3 py-1 rounded transition-all hover:brightness-110 disabled:opacity-40"
            style={{
              background: "rgba(0, 240, 255, 0.1)",
              border: "1px solid rgba(0, 240, 255, 0.3)",
              color: "var(--color-neon-cyan)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {fetchData.isPending ? "Fetching..." : "Fetch Data"}
          </button>
          <button
            onClick={() => runDCF.mutate(selectedTicker)}
            disabled={runDCF.isPending}
            className="text-xs px-3 py-1 rounded transition-all hover:brightness-110 disabled:opacity-40"
            style={{
              background: "rgba(57, 255, 20, 0.1)",
              border: "1px solid rgba(57, 255, 20, 0.3)",
              color: "var(--color-neon-green)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Run DCF
          </button>
          <button
            onClick={() => {
              removeCompany.mutate(selectedTicker)
              clearSelection()
            }}
            disabled={removeCompany.isPending}
            className="text-xs px-3 py-1 rounded transition-all hover:brightness-110 disabled:opacity-40"
            style={{
              background: "rgba(255, 49, 49, 0.1)",
              border: "1px solid rgba(255, 49, 49, 0.3)",
              color: "var(--color-neon-red)",
              fontFamily: "var(--font-mono)",
            }}
          >
            Remove
          </button>
        </div>
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

      {d && (
        <>
          <Card>
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Income Statement Drivers</span>
              {raw?.fiscalYear && (
                <span className="text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>FY{raw.fiscalYear}</span>
              )}
            </div>
            <StatRow label="Revenue" value={formatCurrency(d["revenue"] ?? 0)} />
            <StatRow label="COGS %" value={`${((d["cogsPercent"] ?? 0) * 100).toFixed(1)}%`} />
            <StatRow label="SGA %" value={`${((d["sgaPercent"] ?? 0) * 100).toFixed(1)}%`} />
            <StatRow label="R&D %" value={`${((d["rdPercent"] ?? 0) * 100).toFixed(1)}%`} />
            <StatRow label="D&A %" value={`${((d["daPercent"] ?? 0) * 100).toFixed(1)}%`} />
            <StatRow label="Interest Exp" value={formatCurrency(d["interestExpense"] ?? 0)} />
            <StatRow label="Tax Rate" value={`${((d["taxRate"] ?? 0) * 100).toFixed(1)}%`} />
          </Card>

          <Card>
            <div className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>Balance Sheet</div>
            <StatRow label="Cash" value={formatCurrency(d["cashAndEquivalents"] ?? 0)} />
            <StatRow label="Receivables" value={formatCurrency(d["accountsReceivable"] ?? 0)} />
            <StatRow label="Inventory" value={formatCurrency(d["inventory"] ?? 0)} />
            <StatRow label="PP&E" value={formatCurrency(d["ppe"] ?? 0)} />
            <StatRow label="Total Debt" value={formatCurrency(d["totalDebt"] ?? 0)} />
            <StatRow label="Payables" value={formatCurrency(d["accountsPayable"] ?? 0)} />
          </Card>

          <Card>
            <div className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>DCF Parameters</div>
            <StatRow label="Growth Rate" value={`${((d["revenueGrowthRate"] ?? 0) * 100).toFixed(1)}%`} />
            <StatRow label="WACC" value={`${((d["wacc"] ?? 0) * 100).toFixed(1)}%`} />
            <StatRow label="Terminal Growth" value={`${((d["terminalGrowthRate"] ?? 0) * 100).toFixed(1)}%`} />
            <StatRow label="CapEx %" value={`${((d["capexPercent"] ?? 0) * 100).toFixed(1)}%`} />
            <StatRow label="Projection Yrs" value={`${d["projectionYears"] ?? 5}`} />
            <StatRow label="Shares Out" value={(d["sharesOutstanding"] ?? 0).toLocaleString()} />
          </Card>
        </>
      )}
    </div>
  )
}

export { NodeDetail }
