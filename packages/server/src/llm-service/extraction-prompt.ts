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
