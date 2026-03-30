import { useState } from "react"
import { Card } from "../shared/Card.js"
import { useScenarioStore } from "../../stores/scenario-store.js"
import { useSimulationStore } from "../../stores/simulation-store.js"
import { useCreateScenario, useAddPolicy } from "../../api/queries.js"

function ScenarioPanel() {
  const { scenarios, activeScenarioId } = useScenarioStore()
  const { impacts } = useSimulationStore()
  const createScenario = useCreateScenario()
  const addPolicy = useAddPolicy()

  const [newName, setNewName] = useState("")
  const [policyName, setPolicyName] = useState("")
  const [tariffPercent, setTariffPercent] = useState("0.25")
  const [targetCountry, setTargetCountry] = useState("")

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId)

  function handleCreateScenario() {
    if (newName.trim()) {
      createScenario.mutate({ name: newName.trim(), description: "" })
      setNewName("")
    }
  }

  function handleAddPolicy() {
    if (activeScenarioId && policyName.trim() && targetCountry.trim()) {
      addPolicy.mutate({
        scenarioId: activeScenarioId,
        policy: {
          name: policyName.trim(),
          tariffPercent: parseFloat(tariffPercent),
          targetCountry: targetCountry.trim(),
          targetSector: null,
          targetProduct: null,
        },
      })
      setPolicyName("")
      setTargetCountry("")
    }
  }

  return (
    <div className="p-4 space-y-3">
      <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-display)", color: "var(--color-neon-magenta)" }}>
        Scenarios
      </h3>

      <Card glowColor="var(--color-neon-magenta)">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New scenario name"
            className="flex-1 rounded px-2 py-1 text-xs outline-none"
            style={{
              background: "rgba(10, 10, 15, 0.8)",
              border: "1px solid rgba(255, 0, 229, 0.15)",
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          />
          <button
            onClick={handleCreateScenario}
            className="text-xs px-3 py-1 rounded hover:brightness-110"
            style={{
              background: "rgba(255, 0, 229, 0.1)",
              border: "1px solid rgba(255, 0, 229, 0.3)",
              color: "var(--color-neon-magenta)",
            }}
          >
            Create
          </button>
        </div>
      </Card>

      {activeScenario && (
        <Card glowColor="var(--color-neon-amber)">
          <div className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>
            Add Tariff Policy to: {activeScenario.name}
          </div>
          <div className="space-y-2">
            <input
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              placeholder="Policy name"
              className="w-full rounded px-2 py-1 text-xs outline-none"
              style={{ background: "rgba(10, 10, 15, 0.8)", border: "1px solid rgba(255, 184, 0, 0.15)", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
            />
            <div className="flex gap-2">
              <input
                value={targetCountry}
                onChange={(e) => setTargetCountry(e.target.value)}
                placeholder="Target country"
                className="flex-1 rounded px-2 py-1 text-xs outline-none"
                style={{ background: "rgba(10, 10, 15, 0.8)", border: "1px solid rgba(255, 184, 0, 0.15)", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
              />
              <input
                type="number"
                value={tariffPercent}
                onChange={(e) => setTariffPercent(e.target.value)}
                step="0.05"
                min="0"
                max="1"
                className="w-20 rounded px-2 py-1 text-xs outline-none"
                style={{ background: "rgba(10, 10, 15, 0.8)", border: "1px solid rgba(255, 184, 0, 0.15)", color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}
              />
            </div>
            <button
              onClick={handleAddPolicy}
              className="text-xs px-3 py-1 rounded hover:brightness-110 w-full"
              style={{ background: "rgba(255, 184, 0, 0.1)", border: "1px solid rgba(255, 184, 0, 0.3)", color: "var(--color-neon-amber)" }}
            >
              Add Policy
            </button>
          </div>

          {activeScenario.policies.length > 0 && (
            <div className="mt-2 space-y-1">
              {activeScenario.policies.map((p) => (
                <div key={p.id} className="flex justify-between text-xs py-1" style={{ borderTop: "1px solid rgba(255, 184, 0, 0.1)" }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>{p.name}</span>
                  <span style={{ color: "var(--color-neon-amber)", fontFamily: "var(--font-mono)" }}>
                    {(p.tariffPercent * 100).toFixed(0)}% on {p.targetCountry}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {impacts.length > 0 && (
        <Card glowColor="var(--color-neon-red)">
          <div className="text-xs mb-2" style={{ color: "var(--color-text-muted)" }}>Impact Rankings</div>
          {[...impacts]
            .sort((a, b) => a.percentChange - b.percentChange)
            .slice(0, 8)
            .map((i) => (
              <div key={i.ticker} className="flex justify-between text-xs py-1" style={{ borderBottom: "1px solid rgba(255, 49, 49, 0.1)" }}>
                <span style={{ color: "var(--color-text-primary)", fontFamily: "var(--font-mono)" }}>{i.ticker}</span>
                <span style={{ color: i.percentChange < 0 ? "var(--color-neon-red)" : "var(--color-neon-green)", fontFamily: "var(--font-mono)" }}>
                  {i.percentChange >= 0 ? "+" : ""}{(i.percentChange * 100).toFixed(2)}%
                </span>
              </div>
            ))}
        </Card>
      )}
    </div>
  )
}

export { ScenarioPanel }
