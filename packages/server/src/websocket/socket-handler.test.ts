import { describe, it, expect, vi, beforeEach } from "vitest"
import { createSocketHandler } from "./socket-handler.js"
import type { Server, Socket } from "socket.io"
import { EVENTS } from "./events.js"

function makeSocket(rooms: Set<string> = new Set()): Socket {
  return {
    id: "test-socket-id",
    join: vi.fn((room: string) => { rooms.add(room) }),
    leave: vi.fn((room: string) => { rooms.delete(room) }),
    on: vi.fn(),
    emit: vi.fn(),
    rooms,
  } as unknown as Socket
}

function makeIo(): Server {
  return {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  } as unknown as Server
}

describe("createSocketHandler", () => {
  it("registers connection-scoped event listeners on each socket", () => {
    const io = makeIo()
    const socket = makeSocket()
    const handler = createSocketHandler(io)

    handler.onConnection(socket)

    const onCalls = vi.mocked(socket.on).mock.calls.map(([event]) => event)
    expect(onCalls).toContain("subscribe:graph")
    expect(onCalls).toContain("subscribe:simulation")
    expect(onCalls).toContain("subscribe:node")
  })

  it("joins the graph room when subscribe:graph is received", () => {
    const io = makeIo()
    const rooms = new Set<string>()
    const socket = makeSocket(rooms)
    const handler = createSocketHandler(io)

    handler.onConnection(socket)

    const onCalls = vi.mocked(socket.on).mock.calls
    const graphHandler = onCalls.find(([event]) => event === "subscribe:graph")?.[1] as (() => void) | undefined
    graphHandler?.()

    expect(vi.mocked(socket.join)).toHaveBeenCalledWith("room:graph")
  })

  it("joins the simulation room when subscribe:simulation is received", () => {
    const io = makeIo()
    const rooms = new Set<string>()
    const socket = makeSocket(rooms)
    const handler = createSocketHandler(io)

    handler.onConnection(socket)

    const onCalls = vi.mocked(socket.on).mock.calls
    const simHandler = onCalls.find(([event]) => event === "subscribe:simulation")?.[1] as (() => void) | undefined
    simHandler?.()

    expect(vi.mocked(socket.join)).toHaveBeenCalledWith("room:simulation")
  })

  it("joins a per-node room when subscribe:node is received with a ticker", () => {
    const io = makeIo()
    const rooms = new Set<string>()
    const socket = makeSocket(rooms)
    const handler = createSocketHandler(io)

    handler.onConnection(socket)

    const onCalls = vi.mocked(socket.on).mock.calls
    const nodeHandler = onCalls.find(([event]) => event === "subscribe:node")?.[1] as ((ticker: string) => void) | undefined
    nodeHandler?.("AAPL")

    expect(vi.mocked(socket.join)).toHaveBeenCalledWith("room:node:AAPL")
  })
})

describe("emitGraphUpdated", () => {
  it("broadcasts to the graph room with graph data", () => {
    const io = makeIo()
    const handler = createSocketHandler(io)
    const payload = { nodes: [], edges: [] }

    handler.emitGraphUpdated(payload)

    expect(vi.mocked(io.to)).toHaveBeenCalledWith("room:graph")
    expect(vi.mocked(io.to("room:graph").emit)).toHaveBeenCalledWith(
      EVENTS.GRAPH_UPDATED,
      payload,
    )
  })
})

describe("emitSimulationStep", () => {
  it("broadcasts a propagation step to the simulation room", () => {
    const io = makeIo()
    const handler = createSocketHandler(io)
    const step = { iteration: 1, affectedTicker: "AAPL", previousValuation: 1000, newValuation: 900, delta: -100 }

    handler.emitSimulationStep(step)

    expect(vi.mocked(io.to)).toHaveBeenCalledWith("room:simulation")
    expect(vi.mocked(io.to("room:simulation").emit)).toHaveBeenCalledWith(
      EVENTS.SIMULATION_STEP,
      step,
    )
  })
})

describe("emitNodeUpdated", () => {
  it("broadcasts to both graph room and per-node room", () => {
    const io = makeIo()
    const handler = createSocketHandler(io)
    const payload = { ticker: "NVDA", data: {} }

    handler.emitNodeUpdated("NVDA", payload)

    expect(vi.mocked(io.to)).toHaveBeenCalledWith("room:graph")
    expect(vi.mocked(io.to)).toHaveBeenCalledWith("room:node:NVDA")
  })
})
