export type {
  RawIncomeStatement,
  RawBalanceSheet,
  RawCashFlow,
  RawFinancials,
  MarketData,
  FinancialDataAdapter,
} from "./adapter-interface.js"

export { createFmpAdapter } from "./fmp-adapter.js"
export type { FmpConfig } from "./fmp-adapter.js"

export { createYahooAdapter } from "./yahoo-adapter.js"

export { createEdgarAdapter } from "./edgar-adapter.js"
export type { EdgarAdapter, FilingRecord } from "./edgar-adapter.js"

export { createAdapterOrchestrator } from "./orchestrator.js"
export type { OrchestratorConfig, OrchestratorAdapter } from "./orchestrator.js"
