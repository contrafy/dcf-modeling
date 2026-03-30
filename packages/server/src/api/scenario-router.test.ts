import { describe, it, expect, vi } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { createScenarioRouter } from "./scenario-router.js"
import type { Scenario, TariffPolicy } from "@tori/shared"

type ScenarioRepository = {
  listScenarios: () => Promise<Scenario[]>
  createScenario: (data: unknown) => Promise<Scenario>
  getScenario: (id: string) => Promise<Scenario | null>
  addPolicy: (scenarioId: string, data: unknown) => Promise<TariffPolicy>
  removePolicy: (scenarioId: string, policyId: string) => Promise<void>
}

function makeScenario(id: string): Scenario {
  return {
    id,
    name: "Trade War Scenario",
    description: "25% tariffs on all Taiwan semis",
    policies: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  }
}

function makePolicy(id: string): TariffPolicy {
  return {
    id,
    scenarioId: "s1",
    name: "25% Taiwan semiconductor tariff",
    tariffPercent: 0.25,
    targetCountry: "Taiwan",
    targetSector: null,
    targetProduct: null,
    affectedEdgeIds: [],
  }
}

function makeRepo(overrides: Partial<ScenarioRepository> = {}): ScenarioRepository {
  return {
    listScenarios: vi.fn().mockResolvedValue([makeScenario("s1")]),
    createScenario: vi.fn().mockResolvedValue(makeScenario("s1")),
    getScenario: vi.fn().mockResolvedValue(makeScenario("s1")),
    addPolicy: vi.fn().mockResolvedValue(makePolicy("p1")),
    removePolicy: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeApp(repo: ScenarioRepository): Express {
  const app = express()
  app.use(express.json())
  app.use("/api/scenarios", createScenarioRouter(repo))
  return app
}

describe("GET /api/scenarios", () => {
  it("returns a list of scenarios", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app).get("/api/scenarios")

    expect(response.status).toBe(200)
    expect(response.body).toHaveLength(1)
    expect(response.body[0]).toMatchObject({ id: "s1" })
  })
})

describe("POST /api/scenarios", () => {
  it("creates a scenario and returns 201", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app)
      .post("/api/scenarios")
      .send({ name: "Trade War Scenario", description: "Severe tariffs on all trade partners" })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ id: "s1", name: "Trade War Scenario" })
    expect(repo.createScenario).toHaveBeenCalledOnce()
  })

  it("returns 400 when name is missing", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app)
      .post("/api/scenarios")
      .send({ description: "no name given" })

    expect(response.status).toBe(400)
    expect(repo.createScenario).not.toHaveBeenCalled()
  })
})

describe("GET /api/scenarios/:id", () => {
  it("returns the scenario with its policies", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app).get("/api/scenarios/s1")

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ id: "s1" })
    expect(repo.getScenario).toHaveBeenCalledWith("s1")
  })

  it("returns 404 when scenario does not exist", async () => {
    const repo = makeRepo({ getScenario: vi.fn().mockResolvedValue(null) })
    const app = makeApp(repo)

    const response = await request(app).get("/api/scenarios/does-not-exist")

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ error: expect.stringContaining("not found") })
  })
})

describe("POST /api/scenarios/:id/policies", () => {
  it("adds a tariff policy to the scenario and returns 201", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app)
      .post("/api/scenarios/s1/policies")
      .send({
        name: "25% Taiwan semiconductor tariff",
        tariffPercent: 0.25,
        targetCountry: "Taiwan",
      })

    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({ id: "p1" })
    expect(repo.addPolicy).toHaveBeenCalledWith("s1", expect.any(Object))
  })

  it("returns 400 when tariffPercent exceeds 1", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app)
      .post("/api/scenarios/s1/policies")
      .send({
        name: "Invalid tariff",
        tariffPercent: 2.0,
        targetCountry: "Taiwan",
      })

    expect(response.status).toBe(400)
    expect(repo.addPolicy).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/scenarios/:id/policies/:pid", () => {
  it("removes a policy and returns 204", async () => {
    const repo = makeRepo()
    const app = makeApp(repo)

    const response = await request(app).delete("/api/scenarios/s1/policies/p1")

    expect(response.status).toBe(204)
    expect(repo.removePolicy).toHaveBeenCalledWith("s1", "p1")
  })
})
