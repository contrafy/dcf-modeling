import { create } from "zustand"

type Policy = {
  readonly id: string
  readonly name: string
  readonly tariffPercent: number
  readonly targetCountry: string
  readonly targetSector: string | null
  readonly targetProduct: string | null
}

type Scenario = {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly policies: readonly Policy[]
}

type ScenarioStore = {
  readonly scenarios: readonly Scenario[]
  readonly activeScenarioId: string | null
  setScenarios: (scenarios: readonly Scenario[]) => void
  setActiveScenario: (id: string | null) => void
}

const useScenarioStore = create<ScenarioStore>((set) => ({
  scenarios: [],
  activeScenarioId: null,
  setScenarios: (scenarios) => set({ scenarios }),
  setActiveScenario: (id) => set({ activeScenarioId: id }),
}))

export { useScenarioStore }
export type { Scenario, Policy }
