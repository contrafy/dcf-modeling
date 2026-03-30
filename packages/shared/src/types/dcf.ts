import type { ThreeStatementOutput } from "./financial-model.js"

type DCFResult = {
  readonly projectedFCFs: readonly number[]
  readonly terminalValue: number
  readonly discountedFCFs: readonly number[]
  readonly discountedTerminalValue: number
  readonly enterpriseValue: number
  readonly netDebt: number
  readonly equityValue: number
  readonly perShareValue: number
  readonly threeStatements: readonly ThreeStatementOutput[]
}

type ShockImpact = {
  readonly ticker: string
  readonly baselineValuation: number
  readonly shockedValuation: number
  readonly delta: number
  readonly percentChange: number
}

type SimulationResult = {
  readonly scenarioId: string
  readonly impacts: ReadonlyMap<string, ShockImpact>
  readonly iterationCount: number
  readonly converged: boolean
}

type PropagationStep = {
  readonly iteration: number
  readonly affectedTicker: string
  readonly previousValuation: number
  readonly newValuation: number
  readonly delta: number
}

export type { DCFResult, ShockImpact, SimulationResult, PropagationStep }
