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
