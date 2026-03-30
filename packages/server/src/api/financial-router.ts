import { Router, type IRouter } from "express"
import type { FinancialModel, DCFResult } from "@dcf-modeling/shared"
import { UpdateFinancialModelSchema } from "@dcf-modeling/shared"
import { validateBody } from "./validation.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

type FinancialRepository = {
  readonly getFinancials: (ticker: string) => Promise<FinancialModel | null>
  readonly updateFinancials: (ticker: string, data: unknown) => Promise<FinancialModel>
  readonly recalculateDCF: (ticker: string) => Promise<DCFResult>
}

function createFinancialRouter(repo: FinancialRepository, ws: SocketHandler): IRouter {
  const router = Router()

  router.get("/:ticker/financials", async (req, res) => {
    const ticker = String(req.params["ticker"])
    const model = await repo.getFinancials(ticker)
    if (model === null) {
      res.status(404).json({ error: `Financial model for ${ticker} not found` })
      return
    }
    res.json(model)
  })

  router.put(
    "/:ticker/financials",
    validateBody(UpdateFinancialModelSchema),
    async (req, res) => {
      const ticker = String(req.params["ticker"])
      const model = await repo.updateFinancials(ticker, req.body)
      ws.emitNodeUpdated(ticker, { ticker, data: model })
      res.json(model)
    },
  )

  router.post("/:ticker/dcf", async (req, res) => {
    const ticker = String(req.params["ticker"])
    const result = await repo.recalculateDCF(ticker)
    ws.emitDCFRecalculated({
      ticker,
      equityValue: result.equityValue,
      perShareValue: result.perShareValue,
    })
    res.json(result)
  })

  return router
}

export { createFinancialRouter }
export type { FinancialRepository }
