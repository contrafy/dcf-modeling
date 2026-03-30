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
