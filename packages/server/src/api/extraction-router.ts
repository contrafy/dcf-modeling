import { Router, type IRouter } from "express"
import { z } from "zod"
import { validateBody } from "./validation.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

type ExtractedRelationship = {
  readonly name: string
  readonly ticker: string
  readonly relationship: string
  readonly productCategory: string
  readonly estimatedRevenueWeight: number
  readonly confidence: number
  readonly source: string
}

type ExtractionResult = {
  readonly company: string
  readonly ticker: string
  readonly extractionId: string
  readonly suppliers: readonly ExtractedRelationship[]
  readonly customers: readonly ExtractedRelationship[]
}

type ExtractionService = {
  readonly extractSupplyChain: (
    ticker: string,
    onProgress: (status: string, message: string) => void,
  ) => Promise<ExtractionResult>
  readonly approveExtraction: (extractionId: string, approvedIds: readonly string[]) => Promise<void>
}

const ExtractSupplyChainSchema = z.object({
  ticker: z.string().min(1),
})

const ApproveExtractionSchema = z.object({
  extractionId: z.string().min(1),
  approvedIds: z.array(z.string()),
})

function createExtractionRouter(service: ExtractionService, ws: SocketHandler): IRouter {
  const router = Router()

  router.post(
    "/supply-chain",
    validateBody(ExtractSupplyChainSchema),
    async (req, res) => {
      const { ticker } = req.body as { ticker: string }

      const result = await service.extractSupplyChain(ticker, (status, message) => {
        ws.emitExtractionProgress({
          ticker,
          status: status as "started" | "fetching" | "extracting" | "done" | "error",
          message,
        })
      })

      res.json(result)
    },
  )

  router.post(
    "/approve",
    validateBody(ApproveExtractionSchema),
    async (req, res) => {
      const { extractionId, approvedIds } = req.body as { extractionId: string; approvedIds: string[] }
      await service.approveExtraction(extractionId, approvedIds)
      // Fetch updated graph and broadcast -- service handles persistence
      ws.emitGraphUpdated({ nodes: [], edges: [] })
      res.status(204).send()
    },
  )

  return router
}

export { createExtractionRouter }
export type { ExtractionService, ExtractionResult, ExtractedRelationship }
