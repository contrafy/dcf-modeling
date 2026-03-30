import { create } from "zustand"

type ShockImpact = {
  readonly ticker: string
  readonly baselineValuation: number
  readonly shockedValuation: number
  readonly delta: number
  readonly percentChange: number
}

type SimulationStore = {
  readonly isRunning: boolean
  readonly impacts: readonly ShockImpact[]
  readonly animationStep: number
  readonly converged: boolean
  setRunning: (running: boolean) => void
  setImpacts: (impacts: readonly ShockImpact[]) => void
  setAnimationStep: (step: number) => void
  setConverged: (converged: boolean) => void
  reset: () => void
}

const useSimulationStore = create<SimulationStore>((set) => ({
  isRunning: false,
  impacts: [],
  animationStep: 0,
  converged: false,
  setRunning: (isRunning) => set({ isRunning }),
  setImpacts: (impacts) => set({ impacts }),
  setAnimationStep: (animationStep) => set({ animationStep }),
  setConverged: (converged) => set({ converged }),
  reset: () => set({ isRunning: false, impacts: [], animationStep: 0, converged: false }),
}))

export { useSimulationStore }
export type { ShockImpact }
