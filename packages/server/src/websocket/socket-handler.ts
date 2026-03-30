import type { Server, Socket } from "socket.io"
import type { PropagationStep, ShockImpact } from "@dcf-modeling/shared"
import { EVENTS, ROOMS } from "./events.js"

type GraphUpdatedPayload = {
  readonly nodes: readonly unknown[]
  readonly edges: readonly unknown[]
}

type NodeUpdatedPayload = {
  readonly ticker: string
  readonly data: unknown
}

type EdgeUpdatedPayload = {
  readonly edgeId: string
  readonly data: unknown
}

type SimulationStartedPayload = {
  readonly scenarioId: string
  readonly jobId: string
}

type SimulationCompletedPayload = {
  readonly scenarioId: string
  readonly impacts: readonly ShockImpact[]
  readonly iterationCount: number
  readonly converged: boolean
}

type DCFRecalculatedPayload = {
  readonly ticker: string
  readonly equityValue: number
  readonly perShareValue: number
}

type ExtractionProgressPayload = {
  readonly ticker: string
  readonly status: "started" | "fetching" | "extracting" | "done" | "error"
  readonly message: string
}

type SocketHandler = {
  readonly onConnection: (socket: Socket) => void
  readonly emitGraphUpdated: (payload: GraphUpdatedPayload) => void
  readonly emitNodeUpdated: (ticker: string, payload: NodeUpdatedPayload) => void
  readonly emitEdgeUpdated: (edgeId: string, payload: EdgeUpdatedPayload) => void
  readonly emitSimulationStarted: (payload: SimulationStartedPayload) => void
  readonly emitSimulationStep: (step: PropagationStep) => void
  readonly emitSimulationCompleted: (payload: SimulationCompletedPayload) => void
  readonly emitDCFRecalculated: (payload: DCFRecalculatedPayload) => void
  readonly emitExtractionProgress: (payload: ExtractionProgressPayload) => void
}

function createSocketHandler(io: Server): SocketHandler {
  function onConnection(socket: Socket): void {
    socket.on("subscribe:graph", () => {
      socket.join(ROOMS.GRAPH)
    })

    socket.on("subscribe:simulation", () => {
      socket.join(ROOMS.SIMULATION)
    })

    socket.on("subscribe:node", (ticker: string) => {
      socket.join(ROOMS.node(ticker))
    })
  }

  function emitGraphUpdated(payload: GraphUpdatedPayload): void {
    io.to(ROOMS.GRAPH).emit(EVENTS.GRAPH_UPDATED, payload)
  }

  function emitNodeUpdated(ticker: string, payload: NodeUpdatedPayload): void {
    io.to(ROOMS.GRAPH).emit(EVENTS.NODE_UPDATED, payload)
    io.to(ROOMS.node(ticker)).emit(EVENTS.NODE_UPDATED, payload)
  }

  function emitEdgeUpdated(edgeId: string, payload: EdgeUpdatedPayload): void {
    io.to(ROOMS.GRAPH).emit(EVENTS.EDGE_UPDATED, payload)
  }

  function emitSimulationStarted(payload: SimulationStartedPayload): void {
    io.to(ROOMS.SIMULATION).emit(EVENTS.SIMULATION_STARTED, payload)
  }

  function emitSimulationStep(step: PropagationStep): void {
    io.to(ROOMS.SIMULATION).emit(EVENTS.SIMULATION_STEP, step)
  }

  function emitSimulationCompleted(payload: SimulationCompletedPayload): void {
    io.to(ROOMS.SIMULATION).emit(EVENTS.SIMULATION_COMPLETED, payload)
  }

  function emitDCFRecalculated(payload: DCFRecalculatedPayload): void {
    io.to(ROOMS.GRAPH).emit(EVENTS.DCF_RECALCULATED, payload)
    io.to(ROOMS.node(payload.ticker)).emit(EVENTS.DCF_RECALCULATED, payload)
  }

  function emitExtractionProgress(payload: ExtractionProgressPayload): void {
    io.to(ROOMS.GRAPH).emit(EVENTS.EXTRACTION_PROGRESS, payload)
  }

  return {
    onConnection,
    emitGraphUpdated,
    emitNodeUpdated,
    emitEdgeUpdated,
    emitSimulationStarted,
    emitSimulationStep,
    emitSimulationCompleted,
    emitDCFRecalculated,
    emitExtractionProgress,
  }
}

export { createSocketHandler }
export type {
  SocketHandler,
  GraphUpdatedPayload,
  NodeUpdatedPayload,
  EdgeUpdatedPayload,
  SimulationStartedPayload,
  SimulationCompletedPayload,
  DCFRecalculatedPayload,
  ExtractionProgressPayload,
}
