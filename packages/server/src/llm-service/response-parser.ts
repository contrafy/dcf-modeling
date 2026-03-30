import { z } from "zod"

const ExtractionCandidateSchema = z.object({
  name: z.string().min(1),
  ticker: z.string(),
  relationship: z.string().min(1),
  productCategory: z.string().min(1),
  estimatedRevenueWeight: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  source: z.string().min(1),
})

const ExtractionResultSchema = z.object({
  company: z.string().min(1),
  suppliers: z.array(ExtractionCandidateSchema),
  customers: z.array(ExtractionCandidateSchema),
})

type ExtractionCandidate = {
  readonly name: string
  readonly ticker: string
  readonly relationship: string
  readonly productCategory: string
  readonly estimatedRevenueWeight: number
  readonly confidence: number
  readonly source: string
}

type ExtractionResult = {
  readonly company: string
  readonly suppliers: readonly ExtractionCandidate[]
  readonly customers: readonly ExtractionCandidate[]
}

function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim()
}

function parseExtractionResponse(raw: string): ExtractionResult {
  const cleaned = stripCodeFences(raw)

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(
      `Failed to parse LLM extraction response: invalid JSON -- ${cleaned.slice(0, 80)}`
    )
  }

  const result = ExtractionResultSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(
      `Failed to parse LLM extraction response: ${result.error.message}`
    )
  }

  return result.data
}

export { parseExtractionResponse }
export type { ExtractionCandidate, ExtractionResult }
