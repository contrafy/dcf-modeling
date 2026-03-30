import { io, Socket } from "socket.io-client"

let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    socket = io({ transports: ["websocket"] })
  }
  return socket
}

function subscribeToGraph(): void {
  getSocket().emit("subscribe:graph")
}

function subscribeToSimulation(): void {
  getSocket().emit("subscribe:simulation")
}

function subscribeToNode(ticker: string): void {
  getSocket().emit("subscribe:node", ticker)
}

export { getSocket, subscribeToGraph, subscribeToSimulation, subscribeToNode }
