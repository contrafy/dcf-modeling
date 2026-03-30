import type {
  FinancialDataAdapter,
  RawFinancials,
  MarketData,
} from "./adapter-interface.js"

type OrchestratorConfig = {
  readonly primary: FinancialDataAdapter
  readonly fallback: FinancialDataAdapter
}

type OrchestratorAdapter = {
  readonly fetchFinancials: (ticker: string, years: number) => Promise<RawFinancials>
  readonly fetchMarketData: (ticker: string) => Promise<MarketData>
  readonly isAvailable: () => Promise<boolean>
}

async function tryWithFallback<T>(
  primary: FinancialDataAdapter,
  fallback: FinancialDataAdapter,
  operation: (adapter: FinancialDataAdapter) => Promise<T>,
): Promise<T> {
  const primaryAvailable = await primary.isAvailable()

  if (primaryAvailable) {
    try {
      return await operation(primary)
    } catch {
      // primary failed at fetch time -- try fallback
    }
  }

  const fallbackAvailable = await fallback.isAvailable()
  if (!fallbackAvailable) {
    throw new Error("No financial data adapter available")
  }

  try {
    return await operation(fallback)
  } catch {
    throw new Error("No financial data adapter available")
  }
}

function createAdapterOrchestrator(config: OrchestratorConfig): OrchestratorAdapter {
  const { primary, fallback } = config

  async function fetchFinancials(ticker: string, years: number): Promise<RawFinancials> {
    return tryWithFallback(primary, fallback, (adapter) =>
      adapter.fetchFinancials(ticker, years),
    )
  }

  async function fetchMarketData(ticker: string): Promise<MarketData> {
    return tryWithFallback(primary, fallback, (adapter) =>
      adapter.fetchMarketData(ticker),
    )
  }

  async function isAvailable(): Promise<boolean> {
    const [primaryOk, fallbackOk] = await Promise.all([
      primary.isAvailable(),
      fallback.isAvailable(),
    ])
    return primaryOk || fallbackOk
  }

  return {
    fetchFinancials,
    fetchMarketData,
    isAvailable,
  }
}

export { createAdapterOrchestrator }
export type { OrchestratorConfig, OrchestratorAdapter }
