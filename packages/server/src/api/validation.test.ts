import { describe, it, expect } from "vitest"
import request from "supertest"
import express, { type Express } from "express"
import { z } from "zod"
import { validateBody, validateParams } from "./validation.js"

function makeApp(): Express {
  const app = express()
  app.use(express.json())

  const BodySchema = z.object({
    name: z.string().min(1),
    value: z.number().positive(),
  })

  const ParamsSchema = z.object({
    id: z.string().uuid(),
  })

  app.post(
    "/test-body",
    validateBody(BodySchema),
    (_req, res) => { res.json({ ok: true }) },
  )

  app.get(
    "/test-params/:id",
    validateParams(ParamsSchema),
    (_req, res) => { res.json({ ok: true }) },
  )

  return app
}

describe("validateBody", () => {
  it("passes valid request body to handler", async () => {
    const app = makeApp()
    const response = await request(app)
      .post("/test-body")
      .send({ name: "apple", value: 42 })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
  })

  it("returns 400 with Zod error details when body is invalid", async () => {
    const app = makeApp()
    const response = await request(app)
      .post("/test-body")
      .send({ name: "", value: -1 })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      error: "Validation failed",
      issues: expect.arrayContaining([
        expect.objectContaining({ path: expect.any(Array) }),
      ]),
    })
  })

  it("returns 400 when body is missing required fields", async () => {
    const app = makeApp()
    const response = await request(app)
      .post("/test-body")
      .send({})

    expect(response.status).toBe(400)
    expect(response.body.error).toBe("Validation failed")
  })

  it("returns 400 when body is not JSON", async () => {
    const app = makeApp()
    const response = await request(app)
      .post("/test-body")
      .set("Content-Type", "application/json")
      .send("not-json-at-all{{{")

    expect(response.status).toBe(400)
  })
})

describe("validateParams", () => {
  it("passes valid params to handler", async () => {
    const app = makeApp()
    const response = await request(app)
      .get("/test-params/550e8400-e29b-41d4-a716-446655440000")

    expect(response.status).toBe(200)
  })

  it("returns 400 when param fails schema", async () => {
    const app = makeApp()
    const response = await request(app)
      .get("/test-params/not-a-uuid")

    expect(response.status).toBe(400)
    expect(response.body.error).toBe("Validation failed")
  })
})
