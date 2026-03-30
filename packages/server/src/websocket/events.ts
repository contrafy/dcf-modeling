const EVENTS = {
  // Server -> Client
  GRAPH_UPDATED: "graph:updated",
  NODE_UPDATED: "node:updated",
  EDGE_UPDATED: "edge:updated",
  SIMULATION_STARTED: "simulation:started",
  SIMULATION_STEP: "simulation:step",
  SIMULATION_COMPLETED: "simulation:completed",
  DCF_RECALCULATED: "dcf:recalculated",
  EXTRACTION_PROGRESS: "extraction:progress",
} as const

const ROOMS = {
  GRAPH: "room:graph",
  SIMULATION: "room:simulation",
  node: (ticker: string) => `room:node:${ticker}`,
} as const

export { EVENTS, ROOMS }
