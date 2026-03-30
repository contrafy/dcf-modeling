import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./client.js"

function useGraph() {
  return useQuery({
    queryKey: ["graph"],
    queryFn: () => apiGet<{ nodes: unknown[]; edges: unknown[] }>("/graph"),
  })
}

function useCompanyFinancials(ticker: string | null) {
  return useQuery({
    queryKey: ["financials", ticker],
    queryFn: () => apiGet(`/companies/${ticker}/financials`),
    enabled: ticker !== null,
  })
}

function useScenarios() {
  return useQuery({
    queryKey: ["scenarios"],
    queryFn: () => apiGet<unknown[]>("/scenarios"),
  })
}

function useAddCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (company: { ticker: string; name: string; sector: string; country: string; marketCap: number }) =>
      apiPost("/graph/companies", company),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["graph"] }),
  })
}

function useRemoveCompany() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ticker: string) => apiDelete(`/graph/companies/${ticker}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["graph"] }),
  })
}

function useAddEdge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (edge: { fromTicker: string; toTicker: string; revenueWeight: number; productCategory: string; confidence: number; source: string; passthrough: number }) =>
      apiPost("/graph/edges", edge),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["graph"] }),
  })
}

function useUpdateEdge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      apiPatch(`/graph/edges/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["graph"] }),
  })
}

function useUpdateFinancials() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ticker, data }: { ticker: string; data: unknown }) =>
      apiPut(`/companies/${ticker}/financials`, data),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["financials", v.ticker] }),
  })
}

function useRunDCF() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ticker: string) => apiPost(`/companies/${ticker}/dcf`),
    onSuccess: (_d, ticker) => qc.invalidateQueries({ queryKey: ["financials", ticker] }),
  })
}

function useCreateScenario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description: string }) => apiPost("/scenarios", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios"] }),
  })
}

function useAddPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ scenarioId, policy }: { scenarioId: string; policy: unknown }) =>
      apiPost(`/scenarios/${scenarioId}/policies`, policy),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scenarios"] }),
  })
}

function useRunSimulation() {
  return useMutation({
    mutationFn: (scenarioId: string) => apiPost(`/simulate/${scenarioId}`),
  })
}

function useFetchFinancialData() {
  return useMutation({
    mutationFn: (ticker: string) => apiPost(`/data/fetch/${ticker}`),
  })
}

function useExtractSupplyChain() {
  return useMutation({
    mutationFn: (data: { ticker: string }) => apiPost("/extract/supply-chain", data),
  })
}

export {
  useGraph, useCompanyFinancials, useScenarios,
  useAddCompany, useRemoveCompany, useAddEdge, useUpdateEdge,
  useUpdateFinancials, useRunDCF,
  useCreateScenario, useAddPolicy, useRunSimulation,
  useFetchFinancialData, useExtractSupplyChain,
}
