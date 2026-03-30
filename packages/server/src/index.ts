import express, { type Express } from "express"
import { createServer } from "node:http"
import { Server } from "socket.io"

const app: Express = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: "*" },
})

app.use(express.json())

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" })
})

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`)
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`)
  })
})

const PORT = process.env["PORT"] ?? 3000

httpServer.listen(PORT, () => {
  console.log(`Tori server running on port ${PORT}`)
})

export { app, httpServer, io }
