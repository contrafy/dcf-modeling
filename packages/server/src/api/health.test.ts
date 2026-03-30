import { describe, it, expect } from "vitest"
import request from "supertest"
import express from "express"
import { healthRouter } from "./health.js"

function createTestApp() {
  const app = express()
  app.use("/api", healthRouter)
  return app
}

describe("GET /api/health", () => {
  it("returns status ok", async () => {
    const app = createTestApp()
    const response = await request(app).get("/api/health")

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: "ok" })
  })
})
