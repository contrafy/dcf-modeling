import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { getSocket, subscribeToGraph, subscribeToSimulation } from "../api/socket.js"
import { useSimulationStore } from "../stores/simulation-store.js"
import type { ShockImpact } from "../stores/simulation-store.js"

function useSocketEvents(): void {
  const queryClient = useQueryClient()
  const setRunning = useSimulationStore((s) => s.setRunning)
  const setAnimationStep = useSimulationStore((s) => s.setAnimationStep)
  const setImpacts = useSimulationStore((s) => s.setImpacts)
  const setConverged = useSimulationStore((s) => s.setConverged)

  useEffect(() => {
    const socket = getSocket()

    subscribeToGraph()
    subscribeToSimulation()

    socket.on("graph:updated", () => {
      queryClient.invalidateQueries({ queryKey: ["graph"] })
    })

    socket.on("node:updated", () => {
      queryClient.invalidateQueries({ queryKey: ["graph"] })
    })

    socket.on("simulation:started", () => {
      setRunning(true)
    })

    socket.on("simulation:step", (step: number) => {
      setAnimationStep(step)
    })

    socket.on("simulation:completed", (data: { impacts: ShockImpact[] }) => {
      setImpacts(data.impacts)
      setRunning(false)
      setConverged(true)
    })

    socket.on("dcf:recalculated", (data: { ticker?: string }) => {
      if (data?.ticker) {
        queryClient.invalidateQueries({ queryKey: ["financials", data.ticker] })
      } else {
        queryClient.invalidateQueries({ queryKey: ["financials"] })
      }
    })

    return () => {
      socket.off("graph:updated")
      socket.off("node:updated")
      socket.off("simulation:started")
      socket.off("simulation:step")
      socket.off("simulation:completed")
      socket.off("dcf:recalculated")
    }
  }, [queryClient, setAnimationStep, setConverged, setImpacts, setRunning])
}

export { useSocketEvents }
