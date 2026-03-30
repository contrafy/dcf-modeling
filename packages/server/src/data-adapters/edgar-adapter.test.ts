import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"
import { createEdgarAdapter } from "./edgar-adapter.js"

const EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index"
const EDGAR_BROWSE = "https://www.sec.gov/cgi-bin/browse-edgar"
const EDGAR_FILINGS = "https://data.sec.gov/submissions"

const TEST_TICKER = "AAPL"
const TEST_CIK = "0000320193"
const TEST_ACCESSION = "0000320193-25-000123"
const TEST_ACCESSION_CLEAN = TEST_ACCESSION.replace(/-/g, "")

const mockSearchResponse = {
  hits: {
    hits: [
      {
        _source: {
          period_of_report: "2025-09-27",
          entity_name: "Apple Inc.",
          file_date: "2025-11-01",
          accession_no: TEST_ACCESSION,
          form_type: "10-K",
        },
      },
    ],
    total: { value: 1 },
  },
}

const mockBrowseResponse = `
<html>
  <body>
    <input name="CIK" value="${TEST_CIK}" />
  </body>
</html>
`

const mockSubmissions = {
  cik: TEST_CIK,
  name: "Apple Inc.",
  filings: {
    recent: {
      accessionNumber: [TEST_ACCESSION_CLEAN],
      form: ["10-K"],
      filingDate: ["2025-11-01"],
      primaryDocument: ["aapl-20250927.htm"],
      reportDate: ["2025-09-27"],
    },
  },
}

const mockFilingIndex = {
  directory: {
    item: [
      { name: "aapl-20250927.htm", type: "10-K", description: "Annual report" },
      { name: "aapl-20250927_htm.xml", type: "XML", description: "XBRL instance" },
    ],
  },
}

const mockFilingHtml = `
<html>
<body>
<p>Apple Inc. Annual Report on Form 10-K for fiscal year ended September 27, 2025.</p>
<p>Our primary supplier for advanced logic chips is Taiwan Semiconductor Manufacturing Company.</p>
<p>We also source components from Broadcom Inc. and Qualcomm Incorporated.</p>
</body>
</html>
`

const server = setupServer(
  http.get(EDGAR_SEARCH, () => HttpResponse.json(mockSearchResponse)),
  http.get(EDGAR_BROWSE, () => new HttpResponse(mockBrowseResponse, {
    headers: { "Content-Type": "text/html" },
  })),
  http.get(`${EDGAR_FILINGS}/${TEST_CIK}.json`, () =>
    HttpResponse.json(mockSubmissions),
  ),
  http.get(
    `https://www.sec.gov/Archives/edgar/data/${TEST_CIK.replace(/^0+/, "")}/${TEST_ACCESSION_CLEAN}/index.json`,
    () => HttpResponse.json(mockFilingIndex),
  ),
  http.get(
    `https://www.sec.gov/Archives/edgar/data/${TEST_CIK.replace(/^0+/, "")}/${TEST_ACCESSION_CLEAN}/aapl-20250927.htm`,
    () => new HttpResponse(mockFilingHtml, {
      headers: { "Content-Type": "text/html" },
    }),
  ),
)

describe("SEC EDGAR adapter", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
  afterAll(() => server.close())

  it("searches for recent 10-K filings by ticker", async () => {
    const adapter = createEdgarAdapter()
    const filings = await adapter.searchFilings(TEST_TICKER, "10-K", 1)

    expect(filings).toHaveLength(1)
    expect(filings[0]!.form).toBe("10-K")
    expect(filings[0]!.ticker).toBe(TEST_TICKER)
    expect(filings[0]!.accessionNumber).toBe(TEST_ACCESSION)
    expect(filings[0]!.filingDate).toBe("2025-11-01")
  })

  it("resolves CIK for a given ticker", async () => {
    const adapter = createEdgarAdapter()
    const cik = await adapter.resolveCik(TEST_TICKER)
    expect(cik).toBe(TEST_CIK)
  })

  it("fetches the raw text of the primary filing document", async () => {
    const adapter = createEdgarAdapter()
    const text = await adapter.fetchFilingText(TEST_TICKER, TEST_ACCESSION)

    expect(text).toContain("Apple Inc.")
    expect(text).toContain("Taiwan Semiconductor Manufacturing Company")
    expect(text).toContain("Broadcom Inc.")
  })

  it("lists recent filings from submissions endpoint", async () => {
    const adapter = createEdgarAdapter()
    const filings = await adapter.listRecentFilings(TEST_CIK, "10-K", 1)

    expect(filings).toHaveLength(1)
    expect(filings[0]!.form).toBe("10-K")
    expect(filings[0]!.accessionNumber).toBe(TEST_ACCESSION)
    expect(filings[0]!.primaryDocument).toBe("aapl-20250927.htm")
  })

  it("isAvailable always returns true (EDGAR requires no API key)", async () => {
    const adapter = createEdgarAdapter()
    const available = await adapter.isAvailable()
    expect(available).toBe(true)
  })
})
