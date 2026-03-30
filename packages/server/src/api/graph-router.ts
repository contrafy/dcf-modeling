import { Router, type IRouter } from "express"
import {
  CreateCompanySchema,
  CreateSupplyEdgeSchema,
  UpdateSupplyEdgeSchema,
} from "@tori/shared"
import { validateBody } from "./validation.js"
import type { SocketHandler } from "../websocket/socket-handler.js"

type GraphRepository = {
  readonly getGraph: () => Promise<{ nodes: unknown[]; edges: unknown[] }>
  readonly addCompany: (data: unknown) => Promise<unknown>
  readonly removeCompany: (ticker: string) => Promise<void>
  readonly addEdge: (data: unknown) => Promise<unknown>
  readonly removeEdge: (id: string) => Promise<void>
  readonly updateEdge: (id: string, data: unknown) => Promise<unknown>
}

function createGraphRouter(repo: GraphRepository, ws: SocketHandler): IRouter {
  const router = Router()

  router.get("/", async (_req, res) => {
    const graph = await repo.getGraph()
    res.json(graph)
  })

  router.post(
    "/companies",
    validateBody(CreateCompanySchema),
    async (req, res) => {
      const company = await repo.addCompany(req.body)
      const graph = await repo.getGraph()
      ws.emitGraphUpdated({ nodes: graph.nodes, edges: graph.edges })
      res.status(201).json(company)
    },
  )

  router.delete("/companies/:ticker", async (req, res) => {
    await repo.removeCompany(String(req.params["ticker"]))
    const graph = await repo.getGraph()
    ws.emitGraphUpdated({ nodes: graph.nodes, edges: graph.edges })
    res.status(204).send()
  })

  router.post(
    "/edges",
    validateBody(CreateSupplyEdgeSchema),
    async (req, res) => {
      const edge = await repo.addEdge(req.body)
      const graph = await repo.getGraph()
      ws.emitGraphUpdated({ nodes: graph.nodes, edges: graph.edges })
      res.status(201).json(edge)
    },
  )

  router.delete("/edges/:id", async (req, res) => {
    await repo.removeEdge(String(req.params["id"]))
    const graph = await repo.getGraph()
    ws.emitGraphUpdated({ nodes: graph.nodes, edges: graph.edges })
    res.status(204).send()
  })

  router.patch(
    "/edges/:id",
    validateBody(UpdateSupplyEdgeSchema),
    async (req, res) => {
      const id = String(req.params["id"])
      const edge = await repo.updateEdge(id, req.body)
      ws.emitEdgeUpdated(id, { edgeId: id, data: edge })
      res.json(edge)
    },
  )

  return router
}

export { createGraphRouter }
export type { GraphRepository }
