import { useScenarioStore } from "../../stores/scenario-store.js"
import { useSimulationStore } from "../../stores/simulation-store.js"
import { useRunSimulation, useAddCompany } from "../../api/queries.js"
import { SearchBar } from "../shared/SearchBar.js"
import type { ShockImpact } from "../../stores/simulation-store.js"

function Header() {
  const { scenarios, activeScenarioId, setActiveScenario } = useScenarioStore()
  const { isRunning, setImpacts, setRunning, setConverged } = useSimulationStore()
  const runSim = useRunSimulation()
  const addCompany = useAddCompany()

  function handleRunShock() {
    if (!activeScenarioId) return
    setRunning(true)
    runSim.mutate(activeScenarioId, {
      onSuccess: (data: unknown) => {
        const result = data as { impacts?: ShockImpact[] }
        if (result?.impacts) {
          setImpacts(result.impacts)
          setConverged(true)
        }
        setRunning(false)
      },
      onError: () => {
        setRunning(false)
      },
    })
  }

  function handleSearch(ticker: string) {
    addCompany.mutate({
      ticker,
      name: ticker,
      sector: "Unknown",
      country: "Unknown",
      marketCap: 0,
    })
  }

  return (
    <header
      className="flex items-center justify-between px-6 py-3"
      style={{
        background: "rgba(13, 17, 23, 0.95)",
        borderBottom: "1px solid rgba(0, 240, 255, 0.1)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div className="flex items-center gap-3">
        <h1
          className="text-xl font-bold tracking-widest"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-neon-cyan)" }}
        >
          DCF
        </h1>
        <span className="text-xs" style={{ color: "var(--color-text-muted)", fontFamily: "var(--font-body)" }}>
          Supply Chain DCF
        </span>
      </div>

      <div className="flex items-center gap-4 flex-1 max-w-sm mx-6">
        <SearchBar onSearch={handleSearch} placeholder="Add company by ticker..." />
      </div>

      <div className="flex items-center gap-4">
        <select
          value={activeScenarioId ?? ""}
          onChange={(e) => setActiveScenario(e.target.value || null)}
          className="rounded-lg px-3 py-1.5 text-sm"
          style={{
            background: "rgba(22, 27, 34, 0.9)",
            border: "1px solid rgba(0, 240, 255, 0.2)",
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <option value="">Baseline (no shock)</option>
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <button
          onClick={handleRunShock}
          disabled={!activeScenarioId || isRunning}
          className="rounded-lg px-4 py-1.5 text-sm font-medium transition-all disabled:opacity-30"
          style={{
            background: isRunning ? "rgba(255, 0, 229, 0.2)" : "rgba(0, 240, 255, 0.15)",
            border: `1px solid ${isRunning ? "rgba(255, 0, 229, 0.4)" : "rgba(0, 240, 255, 0.3)"}`,
            color: isRunning ? "var(--color-neon-magenta)" : "var(--color-neon-cyan)",
            fontFamily: "var(--font-display)",
          }}
        >
          {isRunning ? "SIMULATING..." : "RUN SHOCK"}
        </button>
      </div>
    </header>
  )
}

export { Header }
