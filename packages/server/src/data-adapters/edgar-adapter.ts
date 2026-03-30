const EDGAR_SEARCH_BASE = "https://efts.sec.gov/LATEST/search-index"
const EDGAR_BROWSE_BASE = "https://www.sec.gov/cgi-bin/browse-edgar"
const EDGAR_SUBMISSIONS_BASE = "https://data.sec.gov/submissions"
const EDGAR_ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data"

type FilingRecord = {
  readonly ticker: string
  readonly form: string
  readonly accessionNumber: string
  readonly filingDate: string
  readonly reportDate: string
  readonly primaryDocument: string
}

type EdgarAdapter = {
  readonly name: string
  readonly searchFilings: (
    ticker: string,
    form: string,
    limit: number,
  ) => Promise<readonly FilingRecord[]>
  readonly resolveCik: (ticker: string) => Promise<string>
  readonly fetchFilingText: (ticker: string, accessionNumber: string) => Promise<string>
  readonly listRecentFilings: (
    cik: string,
    form: string,
    limit: number,
  ) => Promise<readonly FilingRecord[]>
  readonly isAvailable: () => Promise<boolean>
}

type EdgarSearchHit = {
  readonly _source: {
    readonly period_of_report: string
    readonly entity_name: string
    readonly file_date: string
    readonly accession_no: string
    readonly form_type: string
  }
}

type EdgarSearchResponse = {
  readonly hits: {
    readonly hits: readonly EdgarSearchHit[]
    readonly total: { readonly value: number }
  }
}

type EdgarSubmissions = {
  readonly cik: string
  readonly name: string
  readonly filings: {
    readonly recent: {
      readonly accessionNumber: readonly string[]
      readonly form: readonly string[]
      readonly filingDate: readonly string[]
      readonly primaryDocument: readonly string[]
      readonly reportDate: readonly string[]
    }
  }
}

type EdgarFilingIndexItem = {
  readonly name: string
  readonly type: string
  readonly description: string
}

type EdgarFilingIndex = {
  readonly directory: {
    readonly item: readonly EdgarFilingIndexItem[]
  }
}

function formatAccession(raw: string): string {
  const clean = raw.replace(/-/g, "")
  return `${clean.slice(0, 10)}-${clean.slice(10, 12)}-${clean.slice(12)}`
}

function cleanCik(cik: string): string {
  return cik.replace(/^0+/, "")
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "dcf-modeling research@example.com" },
  })
  if (!response.ok) {
    throw new Error(`EDGAR request failed: ${response.status} ${url}`)
  }
  return response.text()
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": "dcf-modeling research@example.com" },
  })
  if (!response.ok) {
    throw new Error(`EDGAR request failed: ${response.status} ${url}`)
  }
  return response.json() as Promise<T>
}

function createEdgarAdapter(): EdgarAdapter {
  async function searchFilings(
    ticker: string,
    form: string,
    limit: number,
  ): Promise<readonly FilingRecord[]> {
    const url =
      `${EDGAR_SEARCH_BASE}?q=%22${ticker}%22&dateRange=custom` +
      `&startdt=2020-01-01&forms=${form}&hits.hits._source.form_type=${form}` +
      `&hits.hits.total.relation=eq&hits.hits._source.period_of_report=*`

    const data = await fetchJson<EdgarSearchResponse>(url)
    const hits = data.hits.hits.slice(0, limit)

    return hits.map((hit) => ({
      ticker,
      form: hit._source.form_type,
      accessionNumber: hit._source.accession_no,
      filingDate: hit._source.file_date,
      reportDate: hit._source.period_of_report,
      primaryDocument: "",
    }))
  }

  async function resolveCik(ticker: string): Promise<string> {
    const url = `${EDGAR_BROWSE_BASE}?company=${ticker}&CIK=${ticker}&type=10-K&dateb=&owner=include&count=1&search_text=&action=getcompany`
    const html = await fetchText(url)

    const match = html.match(/name="CIK"\s+value="(\d+)"/i)
    if (!match || !match[1]) {
      throw new Error(`EDGAR: could not resolve CIK for ticker ${ticker}`)
    }
    return match[1].padStart(10, "0")
  }

  async function listRecentFilings(
    cik: string,
    form: string,
    limit: number,
  ): Promise<readonly FilingRecord[]> {
    const paddedCik = cik.padStart(10, "0")
    const data = await fetchJson<EdgarSubmissions>(
      `${EDGAR_SUBMISSIONS_BASE}/${paddedCik}.json`,
    )

    const recent = data.filings.recent
    const results: FilingRecord[] = []

    for (let i = 0; i < recent.form.length && results.length < limit; i++) {
      if (recent.form[i] !== form) continue

      const rawAccession = recent.accessionNumber[i] ?? ""
      const formatted = formatAccession(rawAccession)

      results.push({
        ticker: "",
        form: recent.form[i] ?? form,
        accessionNumber: formatted,
        filingDate: recent.filingDate[i] ?? "",
        reportDate: recent.reportDate[i] ?? "",
        primaryDocument: recent.primaryDocument[i] ?? "",
      })
    }

    return results
  }

  async function fetchFilingText(
    ticker: string,
    accessionNumber: string,
  ): Promise<string> {
    const cik = await resolveCik(ticker)
    const cikClean = cleanCik(cik)
    const accessionClean = accessionNumber.replace(/-/g, "")

    const indexUrl =
      `${EDGAR_ARCHIVES_BASE}/${cikClean}/${accessionClean}/index.json`
    const index = await fetchJson<EdgarFilingIndex>(indexUrl)

    const items = Array.isArray(index.directory.item)
      ? index.directory.item
      : [index.directory.item]

    const primaryDoc = items.find(
      (item) =>
        item.type === "10-K" ||
        item.type === "10-Q" ||
        item.name.endsWith(".htm") ||
        item.name.endsWith(".html"),
    )

    if (!primaryDoc) {
      throw new Error(
        `EDGAR: no primary document found for accession ${accessionNumber}`,
      )
    }

    const docUrl =
      `${EDGAR_ARCHIVES_BASE}/${cikClean}/${accessionClean}/${primaryDoc.name}`
    return fetchText(docUrl)
  }

  async function isAvailable(): Promise<boolean> {
    return true
  }

  return {
    name: "edgar",
    searchFilings,
    resolveCik,
    fetchFilingText,
    listRecentFilings,
    isAvailable,
  }
}

export { createEdgarAdapter }
export type { EdgarAdapter, FilingRecord }
