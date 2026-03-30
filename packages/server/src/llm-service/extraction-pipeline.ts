import { EXTRACTION_SYSTEM_PROMPT, buildExtractionPrompt } from "./extraction-prompt.js"
import { parseExtractionResponse } from "./response-parser.js"
import type { ExtractionResult } from "./response-parser.js"
import type { GroqClient } from "./groq-client.js"

type FilingFetcher = (ticker: string) => Promise<string>

type ExtractionPipelineOptions = {
  readonly fetchFilingText: FilingFetcher
  readonly llmClient: GroqClient
}

type ExtractionPipeline = {
  readonly extract: (ticker: string) => Promise<ExtractionResult>
}

function createExtractionPipeline(options: ExtractionPipelineOptions): ExtractionPipeline {
  const { fetchFilingText, llmClient } = options

  async function extract(ticker: string): Promise<ExtractionResult> {
    const filingText = await fetchFilingText(ticker)
    const userMessage = buildExtractionPrompt(ticker, filingText)
    const rawResponse = await llmClient.complete(EXTRACTION_SYSTEM_PROMPT, userMessage)
    return parseExtractionResponse(rawResponse)
  }

  return { extract }
}

export { createExtractionPipeline }
export type { ExtractionPipeline, ExtractionPipelineOptions, FilingFetcher }
