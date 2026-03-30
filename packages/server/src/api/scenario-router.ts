import { Router, type IRouter } from "express"
import type { Scenario, TariffPolicy } from "@dcf-modeling/shared"
import { CreateScenarioSchema, CreateTariffPolicySchema } from "@dcf-modeling/shared"
import { validateBody } from "./validation.js"

type ScenarioRepository = {
  readonly listScenarios: () => Promise<Scenario[]>
  readonly createScenario: (data: unknown) => Promise<Scenario>
  readonly getScenario: (id: string) => Promise<Scenario | null>
  readonly addPolicy: (scenarioId: string, data: unknown) => Promise<TariffPolicy>
  readonly removePolicy: (scenarioId: string, policyId: string) => Promise<void>
}

function createScenarioRouter(repo: ScenarioRepository): IRouter {
  const router = Router()

  router.get("/", async (_req, res) => {
    const scenarios = await repo.listScenarios()
    res.json(scenarios)
  })

  router.post(
    "/",
    validateBody(CreateScenarioSchema),
    async (req, res) => {
      const scenario = await repo.createScenario(req.body)
      res.status(201).json(scenario)
    },
  )

  router.get("/:id", async (req, res) => {
    const id = String(req.params["id"])
    const scenario = await repo.getScenario(id)
    if (scenario === null) {
      res.status(404).json({ error: `Scenario ${id} not found` })
      return
    }
    res.json(scenario)
  })

  router.post(
    "/:id/policies",
    validateBody(CreateTariffPolicySchema),
    async (req, res) => {
      const scenarioId = String(req.params["id"])
      const policy = await repo.addPolicy(scenarioId, req.body)
      res.status(201).json(policy)
    },
  )

  router.delete("/:id/policies/:pid", async (req, res) => {
    const scenarioId = String(req.params["id"])
    const policyId = String(req.params["pid"])
    await repo.removePolicy(scenarioId, policyId)
    res.status(204).send()
  })

  return router
}

export { createScenarioRouter }
export type { ScenarioRepository }
