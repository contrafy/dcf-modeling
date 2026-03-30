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
