import { Router, type IRouter } from "express"

const healthRouter: IRouter = Router()

healthRouter.get("/health", (_req, res) => {
  res.json({ status: "ok" })
})

export { healthRouter }
