import type { ReactNode } from "react"
import { Header } from "./Header.js"
import { PortfolioSummary } from "./PortfolioSummary.js"

type DashboardProps = {
  readonly graphPanel: ReactNode
  readonly detailPanel: ReactNode
  readonly scenarioPanel: ReactNode
}

function Dashboard({ graphPanel, detailPanel, scenarioPanel }: DashboardProps) {
  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--color-void)" }}>
      <Header />
      <PortfolioSummary />

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 relative">
          {graphPanel}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(rgba(0, 240, 255, 0.02) 1px, transparent 1px),
                linear-gradient(90deg, rgba(0, 240, 255, 0.02) 1px, transparent 1px)
              `,
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div
          className="flex h-[280px] min-h-[280px]"
          style={{ borderTop: "1px solid rgba(0, 240, 255, 0.1)" }}
        >
          <div className="flex-1 overflow-auto" style={{ borderRight: "1px solid rgba(0, 240, 255, 0.1)" }}>
            {detailPanel}
          </div>
          <div className="flex-1 overflow-auto">
            {scenarioPanel}
          </div>
        </div>
      </div>
    </div>
  )
}

export { Dashboard }
