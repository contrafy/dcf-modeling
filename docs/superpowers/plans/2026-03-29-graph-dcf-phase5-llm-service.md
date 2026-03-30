# Graph-Based DCF Supply Chain -- Phase 5: LLM Service

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the LLM service that extracts supply chain relationships from SEC EDGAR filing text using Groq. A user provides a company ticker, the pipeline fetches the 10-K filing text via the SEC EDGAR adapter (Phase 4), sends it to the LLM with a structured extraction prompt, parses the JSON response into typed candidates, and returns those candidates for user approval before graph insertion.

**Architecture:** `packages/server/src/llm-service/` module. Four focused files: a Groq SDK wrapper, an extraction prompt template, a response parser, and an orchestration pipeline. All I/O is explicit -- the pipeline takes a fetcher function as a dependency so it can be tested without hitting real APIs.

**Tech Stack:** TypeScript strict mode, Vitest, `groq-sdk`, types from `@tori/shared`, Zod for response validation

**Spec reference:** `docs/superpowers/specs/2026-03-29-graph-dcf-supply-chain-design.md` -- Section 4.3

**Prerequisite:** Phase 4 complete (SEC EDGAR adapter exposes `fetchFilingText(ticker: string): Promise<string>`)

---

### Task 1: Add groq-sdk Dependency

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1: Add groq-sdk to server dependencies**

```bash
cd /home/contrafy/git/toriProject && pnpm --filter @tori/server add groq-sdk
```

Verify `packages/server/package.json` now contains `"groq-sdk"` in `dependencies`.

- [ ] **Step 2: Commit**

```bash
git add packages/server/package.json pnpm-lock.yaml
git commit --no-gpg-sign -m "chore: add groq-sdk dependency to server package"
```

---

### Task 2: Groq Client Wrapper

**Files:**
- Create: `packages/server/src/llm-service/groq-client.ts`
- Create: `packages/server/src/llm-service/groq-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/llm-service/groq-client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { createGroqClient, type GroqClient } from "./groq-client.js"

vi.mock("groq-sdk", () => {
  const MockGroq = vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  }))
  return { default: MockGroq }
})

import Groq from "groq-sdk"

function getGroqConstructorMock() {
  return vi.mocked(Groq)
}

function getCreateMock(client: GroqClient) {
  return vi.mocked(
    (client as unknown as { _groq: { chat: { completions: { create: ReturnType<typeof vi.fn> } } } })
      ._groq.chat.completions.create
  )
}

describe("createGroqClient", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env["GROQ_API_KEY"]
    delete process.env["GROQ_MODEL"]
  })

  it("throws when GROQ_API_KEY is not set", () => {
    expect(() => createGroqClient()).toThrow(
      "GROQ_API_KEY environment variable is required"
    )
  })

  it("creates client with API key from environment", () => {
    process.env["GROQ_API_KEY"] = "test-key"

    createGroqClient()

    expect(getGroqConstructorMock()).toHaveBeenCalledWith({ apiKey: "test-key" })
  })

  it("uses llama-3.3-70b-versatile as default model", () => {
    process.env["GROQ_API_KEY"] = "test-key"
    const client = createGroqClient()

    expect(client.model).toBe("llama-3.3-70b-versatile")
  })

  it("uses GROQ_MODEL env var when provided", () => {
    process.env["GROQ_API_KEY"] = "test-key"
    process.env["GROQ_MODEL"] = "llama-3.1-8b-instant"
    const client = createGroqClient()

    expect(client.model).toBe("llama-3.1-8b-instant")
  })

  it("allows model override via options", () => {
    process.env["GROQ_API_KEY"] = "test-key"
    const client = createGroqClient({ model: "mixtral-8x7b-32768" })

    expect(client.model).toBe("mixtral-8x7b-32768")
  })

  it("sends a chat completion request with the configured model", async () => {
    process.env["GROQ_API_KEY"] = "test-key"
    const client = createGroqClient()

    const mockCreate = getCreateMock(client)
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"result": "ok"}' } }],
    })

    await client.complete("system prompt", "user message")

    expect(mockCreate).toHaveBeenCalledWith({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user message" },
      ],
      temperature: 0,
    })
  })

  it("returns the content string from the first choice", async () => {
    process.env["GROQ_API_KEY"] = "test-key"
    const client = createGroqClient()

    const mockCreate = getCreateMock(client)
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{"hello": "world"}' } }],
    })

    const result = await client.complete("sys", "user")

    expect(result).toBe('{"hello": "world"}')
  })

  it("throws when the response has no choices", async () => {
    process.env["GROQ_API_KEY"] = "test-key"
    const client = createGroqClient()

    const mockCreate = getCreateMock(client)
    mockCreate.mockResolvedValue({ choices: [] })

    await expect(client.complete("sys", "user")).rejects.toThrow(
      "Groq returned no choices"
    )
  })

  it("throws when message content is null", async () => {
    process.env["GROQ_API_KEY"] = "test-key"
    const client = createGroqClient()

    const mockCreate = getCreateMock(client)
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: null } }],
    })

    await expect(client.complete("sys", "user")).rejects.toThrow(
      "Groq message content is null"
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/llm-service/groq-client.test.ts
```

Expected: FAIL -- cannot find module `./groq-client.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/llm-service/groq-client.ts`:
```typescript
import Groq from "groq-sdk"

type GroqClientOptions = {
  readonly model?: string
}

type GroqClient = {
  readonly model: string
  readonly complete: (systemPrompt: string, userMessage: string) => Promise<string>
  readonly _groq: Groq
}

function createGroqClient(options: GroqClientOptions = {}): GroqClient {
  const apiKey = process.env["GROQ_API_KEY"]
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is required")
  }

  const model =
    options.model ??
    process.env["GROQ_MODEL"] ??
    "llama-3.3-70b-versatile"

  const groq = new Groq({ apiKey })

  async function complete(systemPrompt: string, userMessage: string): Promise<string> {
    const response = await groq.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
    })

    const first = response.choices[0]
    if (first === undefined) {
      throw new Error("Groq returned no choices")
    }

    const content = first.message.content
    if (content === null) {
      throw new Error("Groq message content is null")
    }

    return content
  }

  return { model, complete, _groq: groq }
}

export { createGroqClient }
export type { GroqClient, GroqClientOptions }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/llm-service/groq-client.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/llm-service/groq-client.ts packages/server/src/llm-service/groq-client.test.ts
git commit --no-gpg-sign -m "feat: add Groq client wrapper with configurable model and env-based API key"
```

---

### Task 3: Supply Chain Extraction Prompt

**Files:**
- Create: `packages/server/src/llm-service/extraction-prompt.ts`
- Create: `packages/server/src/llm-service/extraction-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/llm-service/extraction-prompt.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { buildExtractionPrompt, EXTRACTION_SYSTEM_PROMPT } from "./extraction-prompt.js"

describe("EXTRACTION_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(typeof EXTRACTION_SYSTEM_PROMPT).toBe("string")
    expect(EXTRACTION_SYSTEM_PROMPT.length).toBeGreaterThan(0)
  })

  it("instructs the model to return valid JSON", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("JSON")
  })

  it("references the required output fields", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("suppliers")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("customers")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("ticker")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("estimatedRevenueWeight")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("confidence")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("productCategory")
    expect(EXTRACTION_SYSTEM_PROMPT).toContain("source")
  })

  it("specifies that estimatedRevenueWeight must be between 0 and 1", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/0(\.\d+)? to 1|0 and 1|0\.0.*1\.0/)
  })

  it("specifies that confidence must be between 0 and 1", () => {
    expect(EXTRACTION_SYSTEM_PROMPT).toMatch(/confidence.*0.*1|0.*1.*confidence/s)
  })
})

describe("buildExtractionPrompt", () => {
  it("includes the company name in the prompt", () => {
    const prompt = buildExtractionPrompt("Apple Inc.", "Some filing text")

    expect(prompt).toContain("Apple Inc.")
  })

  it("includes the filing text in the prompt", () => {
    const filingText = "TSMC is our primary foundry for A-series chips."
    const prompt = buildExtractionPrompt("Apple Inc.", filingText)

    expect(prompt).toContain(filingText)
  })

  it("instructs the model to focus on the specified company", () => {
    const prompt = buildExtractionPrompt("NVIDIA Corporation", "some text")

    expect(prompt).toContain("NVIDIA Corporation")
  })

  it("truncates excessively long filing text to prevent token overflow", () => {
    const longText = "x".repeat(200_000)
    const prompt = buildExtractionPrompt("AAPL", longText)

    expect(prompt.length).toBeLessThan(longText.length + 500)
  })

  it("returns a string", () => {
    const prompt = buildExtractionPrompt("Apple Inc.", "filing text here")

    expect(typeof prompt).toBe("string")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/llm-service/extraction-prompt.test.ts
```

Expected: FAIL -- cannot find module `./extraction-prompt.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/llm-service/extraction-prompt.ts`:
```typescript
const MAX_FILING_CHARS = 120_000

const EXTRACTION_SYSTEM_PROMPT = `You are a supply chain analyst. Your task is to extract supply chain relationships from SEC 10-K filing text.

Return ONLY valid JSON with no additional commentary. Use this exact schema:

{
  "company": "<company name>",
  "suppliers": [
    {
      "name": "<supplier company name>",
      "ticker": "<stock ticker or empty string if unknown>",
      "relationship": "<description of what they supply>",
      "productCategory": "<product or service category>",
      "estimatedRevenueWeight": <fraction 0.0 to 1.0 of supplier revenue from this relationship>,
      "confidence": <confidence score 0.0 to 1.0>,
      "source": "<filing section or page reference>"
    }
  ],
  "customers": [
    {
      "name": "<customer company name>",
      "ticker": "<stock ticker or empty string if unknown>",
      "relationship": "<description of what they buy>",
      "productCategory": "<product or service category>",
      "estimatedRevenueWeight": <fraction 0.0 to 1.0 of subject company revenue from this customer>,
      "confidence": <confidence score 0.0 to 1.0>,
      "source": "<filing section or page reference>"
    }
  ]
}

Rules:
- estimatedRevenueWeight: your best estimate of what fraction of the supplier's total revenue comes from this relationship. Use 0.0 to 1.0.
- confidence: how certain you are this relationship exists and the details are accurate. Use 0.0 to 1.0.
- Only include relationships explicitly mentioned or strongly implied in the text.
- If a ticker is not identifiable, use an empty string.
- Return an empty array for suppliers or customers if none are found.
- Do not include parent/subsidiary relationships unless they represent genuine supply flows.`

function buildExtractionPrompt(companyName: string, filingText: string): string {
  const truncated = filingText.length > MAX_FILING_CHARS
    ? filingText.slice(0, MAX_FILING_CHARS)
    : filingText

  return `Extract supply chain relationships for ${companyName} from the following 10-K filing text.

Focus on identifying:
1. Suppliers: companies that sell goods or services TO ${companyName}
2. Customers: companies that buy goods or services FROM ${companyName}

Filing text:
---
${truncated}
---`
}

export { buildExtractionPrompt, EXTRACTION_SYSTEM_PROMPT }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/llm-service/extraction-prompt.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/llm-service/extraction-prompt.ts packages/server/src/llm-service/extraction-prompt.test.ts
git commit --no-gpg-sign -m "feat: add supply chain extraction prompt template with truncation guard"
```

---

### Task 4: Structured Output Parser

**Files:**
- Create: `packages/server/src/llm-service/response-parser.ts`
- Create: `packages/server/src/llm-service/response-parser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/llm-service/response-parser.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { parseExtractionResponse } from "./response-parser.js"
import type { ExtractionResult } from "./response-parser.js"

function makeValidResponse(overrides: Record<string, unknown> = {}): string {
  const base = {
    company: "Apple Inc.",
    suppliers: [
      {
        name: "Taiwan Semiconductor Manufacturing",
        ticker: "TSM",
        relationship: "Primary foundry for A-series and M-series chips",
        productCategory: "Advanced Logic Chips",
        estimatedRevenueWeight: 0.25,
        confidence: 0.92,
        source: "10-K FY2025, page 12",
      },
    ],
    customers: [
      {
        name: "Best Buy Co.",
        ticker: "BBY",
        relationship: "Retail reseller of Apple hardware",
        productCategory: "Consumer Electronics Retail",
        estimatedRevenueWeight: 0.05,
        confidence: 0.75,
        source: "10-K FY2025, page 18",
      },
    ],
    ...overrides,
  }
  return JSON.stringify(base)
}

describe("parseExtractionResponse", () => {
  it("parses a valid JSON response into an ExtractionResult", () => {
    const result = parseExtractionResponse(makeValidResponse())

    expect(result.company).toBe("Apple Inc.")
    expect(result.suppliers).toHaveLength(1)
    expect(result.customers).toHaveLength(1)
  })

  it("returns the correct supplier fields", () => {
    const result = parseExtractionResponse(makeValidResponse())
    const supplier = result.suppliers[0]!

    expect(supplier.name).toBe("Taiwan Semiconductor Manufacturing")
    expect(supplier.ticker).toBe("TSM")
    expect(supplier.relationship).toBe("Primary foundry for A-series and M-series chips")
    expect(supplier.productCategory).toBe("Advanced Logic Chips")
    expect(supplier.estimatedRevenueWeight).toBe(0.25)
    expect(supplier.confidence).toBe(0.92)
    expect(supplier.source).toBe("10-K FY2025, page 12")
  })

  it("returns the correct customer fields", () => {
    const result = parseExtractionResponse(makeValidResponse())
    const customer = result.customers[0]!

    expect(customer.name).toBe("Best Buy Co.")
    expect(customer.ticker).toBe("BBY")
    expect(customer.estimatedRevenueWeight).toBe(0.05)
    expect(customer.confidence).toBe(0.75)
  })

  it("handles empty suppliers and customers arrays", () => {
    const response = makeValidResponse({ suppliers: [], customers: [] })
    const result = parseExtractionResponse(response)

    expect(result.suppliers).toHaveLength(0)
    expect(result.customers).toHaveLength(0)
  })

  it("throws a descriptive error for malformed JSON", () => {
    expect(() => parseExtractionResponse("not json at all")).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when the response is valid JSON but not an object", () => {
    expect(() => parseExtractionResponse('"just a string"')).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when the company field is missing", () => {
    const broken = JSON.stringify({ suppliers: [], customers: [] })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when suppliers field is missing", () => {
    const broken = JSON.stringify({ company: "AAPL", customers: [] })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when customers field is missing", () => {
    const broken = JSON.stringify({ company: "AAPL", suppliers: [] })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when a supplier is missing required fields", () => {
    const broken = makeValidResponse({
      suppliers: [{ name: "TSMC" }],
    })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when estimatedRevenueWeight is out of range", () => {
    const broken = makeValidResponse({
      suppliers: [
        {
          name: "TSMC",
          ticker: "TSM",
          relationship: "foundry",
          productCategory: "chips",
          estimatedRevenueWeight: 1.5,
          confidence: 0.9,
          source: "page 1",
        },
      ],
    })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("throws when confidence is out of range", () => {
    const broken = makeValidResponse({
      customers: [
        {
          name: "Best Buy",
          ticker: "BBY",
          relationship: "retail",
          productCategory: "electronics",
          estimatedRevenueWeight: 0.05,
          confidence: -0.1,
          source: "page 5",
        },
      ],
    })
    expect(() => parseExtractionResponse(broken)).toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("strips markdown code fences before parsing", () => {
    const json = makeValidResponse()
    const fenced = `\`\`\`json\n${json}\n\`\`\``
    const result = parseExtractionResponse(fenced)

    expect(result.company).toBe("Apple Inc.")
  })

  it("handles code fences without language tag", () => {
    const json = makeValidResponse()
    const fenced = `\`\`\`\n${json}\n\`\`\``
    const result = parseExtractionResponse(fenced)

    expect(result.company).toBe("Apple Inc.")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/llm-service/response-parser.test.ts
```

Expected: FAIL -- cannot find module `./response-parser.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/llm-service/response-parser.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/llm-service/response-parser.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/llm-service/response-parser.ts packages/server/src/llm-service/response-parser.test.ts
git commit --no-gpg-sign -m "feat: add structured output parser with Zod validation and code fence stripping"
```

---

### Task 5: Extraction Pipeline

**Files:**
- Create: `packages/server/src/llm-service/extraction-pipeline.ts`
- Create: `packages/server/src/llm-service/extraction-pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/llm-service/extraction-pipeline.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest"
import { createExtractionPipeline } from "./extraction-pipeline.js"
import type { ExtractionResult } from "./response-parser.js"

function makeFilingFetcher(text: string) {
  return vi.fn().mockResolvedValue(text)
}

function makeGroqClient(responseJson: string) {
  return {
    model: "llama-3.3-70b-versatile",
    complete: vi.fn().mockResolvedValue(responseJson),
    _groq: {} as never,
  }
}

function makeValidLlmResponse(company = "Apple Inc."): string {
  return JSON.stringify({
    company,
    suppliers: [
      {
        name: "Taiwan Semiconductor Manufacturing",
        ticker: "TSM",
        relationship: "Primary foundry for A-series chips",
        productCategory: "Advanced Logic Chips",
        estimatedRevenueWeight: 0.25,
        confidence: 0.92,
        source: "10-K FY2025, page 12",
      },
    ],
    customers: [
      {
        name: "Best Buy Co.",
        ticker: "BBY",
        relationship: "Retail reseller",
        productCategory: "Consumer Electronics Retail",
        estimatedRevenueWeight: 0.05,
        confidence: 0.75,
        source: "10-K FY2025, page 18",
      },
    ],
  })
}

describe("createExtractionPipeline", () => {
  it("returns an ExtractionResult for a valid company ticker", async () => {
    const fetcher = makeFilingFetcher("Apple 10-K filing text here.")
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    const result = await pipeline.extract("AAPL")

    expect(result.company).toBe("Apple Inc.")
    expect(result.suppliers).toHaveLength(1)
    expect(result.customers).toHaveLength(1)
  })

  it("calls the filing fetcher with the provided ticker", async () => {
    const fetcher = makeFilingFetcher("filing text")
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await pipeline.extract("NVDA")

    expect(fetcher).toHaveBeenCalledWith("NVDA")
  })

  it("passes the filing text to the LLM client", async () => {
    const filingText = "TSMC is our primary manufacturer."
    const fetcher = makeFilingFetcher(filingText)
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await pipeline.extract("AAPL")

    const [, userMessage] = llmClient.complete.mock.calls[0] as [string, string]
    expect(userMessage).toContain(filingText)
  })

  it("passes the extraction system prompt as the system message", async () => {
    const fetcher = makeFilingFetcher("some filing text")
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await pipeline.extract("AAPL")

    const [systemPrompt] = llmClient.complete.mock.calls[0] as [string, string]
    expect(systemPrompt).toContain("JSON")
    expect(systemPrompt).toContain("suppliers")
    expect(systemPrompt).toContain("customers")
  })

  it("includes the ticker in the user message sent to the LLM", async () => {
    const fetcher = makeFilingFetcher("some filing text")
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await pipeline.extract("TSMC")

    const [, userMessage] = llmClient.complete.mock.calls[0] as [string, string]
    expect(userMessage).toContain("TSMC")
  })

  it("propagates filing fetch errors", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("SEC EDGAR rate limit"))
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await expect(pipeline.extract("AAPL")).rejects.toThrow("SEC EDGAR rate limit")
  })

  it("propagates LLM client errors", async () => {
    const fetcher = makeFilingFetcher("filing text")
    const llmClient = {
      model: "llama-3.3-70b-versatile",
      complete: vi.fn().mockRejectedValue(new Error("Groq API error")),
      _groq: {} as never,
    }
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await expect(pipeline.extract("AAPL")).rejects.toThrow("Groq API error")
  })

  it("propagates response parsing errors", async () => {
    const fetcher = makeFilingFetcher("filing text")
    const llmClient = makeGroqClient("this is not json")
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    await expect(pipeline.extract("AAPL")).rejects.toThrow(
      "Failed to parse LLM extraction response"
    )
  })

  it("returns suppliers with all required fields intact", async () => {
    const fetcher = makeFilingFetcher("filing text")
    const llmClient = makeGroqClient(makeValidLlmResponse())
    const pipeline = createExtractionPipeline({ fetchFilingText: fetcher, llmClient })

    const result: ExtractionResult = await pipeline.extract("AAPL")
    const supplier = result.suppliers[0]!

    expect(supplier.name).toBe("Taiwan Semiconductor Manufacturing")
    expect(supplier.ticker).toBe("TSM")
    expect(supplier.estimatedRevenueWeight).toBe(0.25)
    expect(supplier.confidence).toBe(0.92)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/llm-service/extraction-pipeline.test.ts
```

Expected: FAIL -- cannot find module `./extraction-pipeline.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/llm-service/extraction-pipeline.ts`:
```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/llm-service/extraction-pipeline.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/llm-service/extraction-pipeline.ts packages/server/src/llm-service/extraction-pipeline.test.ts
git commit --no-gpg-sign -m "feat: add extraction pipeline orchestrating filing fetch, LLM call, and response parsing"
```

---

### Task 6: LLM Service Barrel Export

**Files:**
- Create: `packages/server/src/llm-service/index.ts`

- [ ] **Step 1: Create barrel export**

Create `packages/server/src/llm-service/index.ts`:
```typescript
export { createGroqClient } from "./groq-client.js"
export type { GroqClient, GroqClientOptions } from "./groq-client.js"

export { buildExtractionPrompt, EXTRACTION_SYSTEM_PROMPT } from "./extraction-prompt.js"

export { parseExtractionResponse } from "./response-parser.js"
export type { ExtractionCandidate, ExtractionResult } from "./response-parser.js"

export { createExtractionPipeline } from "./extraction-pipeline.js"
export type {
  ExtractionPipeline,
  ExtractionPipelineOptions,
  FilingFetcher,
} from "./extraction-pipeline.js"
```

- [ ] **Step 2: Run all LLM service tests**

```bash
pnpm --filter @tori/server test -- src/llm-service/
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/llm-service/index.ts
git commit --no-gpg-sign -m "feat: add llm-service barrel export"
```

---

That completes Phase 5. The LLM service now:
- Wraps the Groq SDK with a configurable model (default `llama-3.3-70b-versatile`) and reads credentials from `GROQ_API_KEY`
- Provides a structured prompt template that instructs the model to return typed JSON with supplier and customer arrays
- Validates and parses the LLM response through Zod, stripping markdown code fences and reporting clear errors on malformed output
- Orchestrates the full extraction pipeline: fetch filing text -> build prompt -> call LLM -> parse response -> return typed candidates
- Accepts a `fetchFilingText` dependency so the pipeline is fully testable without real network calls or API keys
- All four files are independently testable with zero real API calls
