import { Router, type IRouter } from "express"

type FetchedFinancials = {
  readonly ticker: string
  readonly source: string
  readonly revenue: number
  readonly fiscalYear: number
}

type DataAdapterOrchestrator = {
  readonly fetchAndStore: (ticker: string) => Promise<FetchedFinancials>
}

function createDataRouter(orchestrator: DataAdapterOrchestrator): IRouter {
  const router = Router()

  router.post("/fetch/:ticker", async (req, res) => {
    const ticker = String(req.params["ticker"])
    try {
      const result = await orchestrator.fetchAndStore(ticker)
      res.json(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[data-router] Failed to fetch data for ${ticker}:`, err)
      res.status(500).json({ error: `Failed to fetch data for ${ticker}: ${message}` })
    }
  })

  return router
}

export { createDataRouter }
export type { DataAdapterOrchestrator, FetchedFinancials }
