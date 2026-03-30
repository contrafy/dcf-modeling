import type {
  SupplyChainGraph, CompanyNode, TariffPolicy,
  SimulationResult, ShockImpact, FinancialModelDrivers,
} from "@dcf-modeling/shared"
import { calculateDCF } from "../dcf-engine/dcf-calculator.js"
import { mergeDrivers } from "../dcf-engine/merge-drivers.js"
import { matchAffectedEdges } from "./policy-matcher.js"

type PropagationConfig = {
  readonly convergenceThreshold: number
  readonly maxIterations: number
}

const DEFAULT_CONFIG: PropagationConfig = {
  convergenceThreshold: 0.001,
  maxIterations: 50,
}

function getEffectiveDrivers(node: CompanyNode): FinancialModelDrivers {
  return mergeDrivers(node.financialModel.drivers, node.financialModel.overrides)
}

function computeNodeValuation(drivers: FinancialModelDrivers): number {
  return calculateDCF(drivers).equityValue
}

function propagateShock(
  graph: SupplyChainGraph,
  policies: readonly TariffPolicy[],
  config: PropagationConfig = DEFAULT_CONFIG,
): SimulationResult {
  const baselineValuations = new Map<string, number>()
  const currentRevenues = new Map<string, number>()

  for (const [ticker, node] of graph.nodes) {
    const drivers = getEffectiveDrivers(node)
    baselineValuations.set(ticker, computeNodeValuation(drivers))
    currentRevenues.set(ticker, drivers.revenue)
  }

  // Calculate initial direct revenue reductions from tariff policies
  const revenueReductions = new Map<string, number>()
  for (const policy of policies) {
    const matched = matchAffectedEdges(graph, policy)
    for (const edge of matched) {
      const supplierRevenue = currentRevenues.get(edge.fromTicker)!
      const edgeRevenue = supplierRevenue * edge.revenueWeight
      const hit = edgeRevenue * policy.tariffPercent
      const supplierAbsorption = hit * (1 - edge.passthrough)
      const customerPassthrough = hit * edge.passthrough

      const currentSupplierReduction = revenueReductions.get(edge.fromTicker) ?? 0
      revenueReductions.set(edge.fromTicker, currentSupplierReduction + supplierAbsorption)

      const currentCustomerReduction = revenueReductions.get(edge.toTicker) ?? 0
      revenueReductions.set(edge.toTicker, currentCustomerReduction + customerPassthrough)
    }
  }

  // Initialize shocked revenues from direct policy impacts
  const shockedRevenues = new Map<string, number>()
  for (const [ticker, revenue] of currentRevenues) {
    const reduction = revenueReductions.get(ticker) ?? 0
    shockedRevenues.set(ticker, Math.max(0, revenue - reduction))
  }

  // Iterative propagation: downstream demand reduction flows upstream
  let iterationCount = 0
  let converged = false

  for (let i = 0; i < config.maxIterations; i++) {
    iterationCount = i + 1
    let maxDelta = 0

    const newShockedRevenues = new Map<string, number>()

    for (const [ticker] of graph.nodes) {
      const originalRevenue = currentRevenues.get(ticker)!
      let totalReduction = revenueReductions.get(ticker) ?? 0

      // Check demand reduction from customers whose revenue has fallen
      const outEdges = graph.adjacency.get(ticker) ?? []
      for (const edge of outEdges) {
        const customerOriginalRevenue = currentRevenues.get(edge.toTicker)!
        const customerShockedRevenue = shockedRevenues.get(edge.toTicker)!
        if (customerOriginalRevenue > 0) {
          const customerRevenueRatio = customerShockedRevenue / customerOriginalRevenue
          if (customerRevenueRatio < 1) {
            const demandReduction = originalRevenue * edge.revenueWeight * (1 - customerRevenueRatio)
            totalReduction += demandReduction
          }
        }
      }

      const newRevenue = Math.max(0, originalRevenue - totalReduction)
      const previousRevenue = shockedRevenues.get(ticker)!
      const delta = originalRevenue > 0 ? Math.abs(newRevenue - previousRevenue) / originalRevenue : 0
      maxDelta = Math.max(maxDelta, delta)
      newShockedRevenues.set(ticker, newRevenue)
    }

    for (const [ticker, revenue] of newShockedRevenues) {
      shockedRevenues.set(ticker, revenue)
    }

    if (maxDelta < config.convergenceThreshold) {
      converged = true
      break
    }
  }

  // Compute final impacts
  const impacts = new Map<string, ShockImpact>()
  for (const [ticker, node] of graph.nodes) {
    const baseline = baselineValuations.get(ticker)!
    const shockedRevenue = shockedRevenues.get(ticker)!
    const originalRevenue = currentRevenues.get(ticker)!

    if (Math.abs(shockedRevenue - originalRevenue) < 0.01) {
      impacts.set(ticker, {
        ticker, baselineValuation: baseline, shockedValuation: baseline,
        delta: 0, percentChange: 0,
      })
      continue
    }

    const drivers = getEffectiveDrivers(node)
    const shockedDrivers = mergeDrivers(drivers, { revenue: shockedRevenue })
    const shockedValuation = computeNodeValuation(shockedDrivers)
    const delta = shockedValuation - baseline
    const percentChange = baseline !== 0 ? delta / Math.abs(baseline) : 0

    impacts.set(ticker, {
      ticker, baselineValuation: baseline, shockedValuation,
      delta, percentChange,
    })
  }

  return {
    scenarioId: policies[0]?.scenarioId ?? "unknown",
    impacts, iterationCount, converged,
  }
}

export { propagateShock }
export type { PropagationConfig }
