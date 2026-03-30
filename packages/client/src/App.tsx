import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Dashboard } from "./components/layout/Dashboard.js"
import { SupplyChainGraph } from "./components/graph/SupplyChainGraph.js"
import { NodeDetail } from "./components/financials/NodeDetail.js"
import { ScenarioPanel } from "./components/scenarios/ScenarioPanel.js"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard
        graphPanel={<SupplyChainGraph />}
        detailPanel={<NodeDetail />}
        scenarioPanel={<ScenarioPanel />}
      />
    </QueryClientProvider>
  )
}

export { App }
