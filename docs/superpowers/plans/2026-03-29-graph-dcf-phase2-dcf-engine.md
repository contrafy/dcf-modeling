# Graph-Based DCF Supply Chain -- Phase 2: DCF Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 3-statement financial model engine and DCF valuation calculator as a pure TypeScript module with zero I/O dependencies. All functions are pure, all data is immutable.

**Architecture:** `packages/server/src/dcf-engine/` module. Pure functions that take `FinancialModelDrivers` and produce `ThreeStatementOutput` and `DCFResult`. Override merging follows the precedence: `templateDefaults <- apiData <- userOverrides`.

**Tech Stack:** TypeScript strict mode, Vitest, types from `@tori/shared`

**Spec reference:** `docs/superpowers/specs/2026-03-29-graph-dcf-supply-chain-design.md` -- Section 4.1

**Prerequisite:** Phase 1 complete (monorepo + shared types)

---

### Task 1: Income Statement Derivation

**Files:**
- Create: `packages/server/src/dcf-engine/income-statement.ts`
- Create: `packages/server/src/dcf-engine/income-statement.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/dcf-engine/income-statement.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { deriveIncomeStatement } from "./income-statement.js"
import type { FinancialModelDrivers } from "@tori/shared"

function makeDrivers(overrides: Partial<FinancialModelDrivers> = {}): FinancialModelDrivers {
  return {
    revenue: 100_000,
    revenueGrowthRate: 0.10,
    cogsPercent: 0.40,
    sgaPercent: 0.15,
    rdPercent: 0.10,
    daPercent: 0.05,
    interestExpense: 1_000,
    taxRate: 0.21,
    cashAndEquivalents: 50_000,
    accountsReceivable: 10_000,
    inventory: 8_000,
    ppe: 30_000,
    totalDebt: 20_000,
    accountsPayable: 7_000,
    capexPercent: 0.08,
    nwcChange: 2_000,
    wacc: 0.10,
    terminalGrowthRate: 0.03,
    projectionYears: 5,
    sharesOutstanding: 1_000,
    ...overrides,
  }
}

describe("deriveIncomeStatement", () => {
  it("computes all line items from revenue through net income", () => {
    const drivers = makeDrivers({ revenue: 100_000 })
    const result = deriveIncomeStatement(drivers)

    expect(result.revenue).toBe(100_000)
    expect(result.cogs).toBe(40_000)
    expect(result.grossProfit).toBe(60_000)
    expect(result.sga).toBe(15_000)
    expect(result.rd).toBe(10_000)
    expect(result.ebitda).toBe(35_000)
    expect(result.da).toBe(5_000)
    expect(result.ebit).toBe(30_000)
    expect(result.interestExpense).toBe(1_000)
    expect(result.ebt).toBe(29_000)
    expect(result.tax).toBeCloseTo(6_090, 2)
    expect(result.netIncome).toBeCloseTo(22_910, 2)
  })

  it("handles zero revenue", () => {
    const drivers = makeDrivers({ revenue: 0 })
    const result = deriveIncomeStatement(drivers)

    expect(result.revenue).toBe(0)
    expect(result.grossProfit).toBe(0)
    expect(result.netIncome).toBeCloseTo(-1_000 * (1 - 0.21), 2)
  })

  it("handles high-margin business", () => {
    const drivers = makeDrivers({
      revenue: 200_000,
      cogsPercent: 0.10,
      sgaPercent: 0.05,
      rdPercent: 0.20,
    })
    const result = deriveIncomeStatement(drivers)

    expect(result.grossProfit).toBe(180_000)
    expect(result.ebitda).toBe(130_000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/income-statement.test.ts
```

Expected: FAIL -- cannot find module `./income-statement.js`

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/dcf-engine/income-statement.ts`:
```typescript
import type { FinancialModelDrivers, IncomeStatement } from "@tori/shared"

function deriveIncomeStatement(drivers: FinancialModelDrivers): IncomeStatement {
  const revenue = drivers.revenue
  const cogs = revenue * drivers.cogsPercent
  const grossProfit = revenue - cogs
  const sga = revenue * drivers.sgaPercent
  const rd = revenue * drivers.rdPercent
  const ebitda = grossProfit - sga - rd
  const da = revenue * drivers.daPercent
  const ebit = ebitda - da
  const interestExpense = drivers.interestExpense
  const ebt = ebit - interestExpense
  const tax = ebt * drivers.taxRate
  const netIncome = ebt - tax

  return {
    revenue,
    cogs,
    grossProfit,
    sga,
    rd,
    ebitda,
    da,
    ebit,
    interestExpense,
    ebt,
    tax,
    netIncome,
  }
}

export { deriveIncomeStatement }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/income-statement.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/dcf-engine/
git commit -m "feat: add income statement derivation from financial drivers"
```

---

### Task 2: Balance Sheet Derivation

**Files:**
- Create: `packages/server/src/dcf-engine/balance-sheet.ts`
- Create: `packages/server/src/dcf-engine/balance-sheet.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/dcf-engine/balance-sheet.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { deriveBalanceSheet } from "./balance-sheet.js"
import type { FinancialModelDrivers, IncomeStatement } from "@tori/shared"

function makeDrivers(overrides: Partial<FinancialModelDrivers> = {}): FinancialModelDrivers {
  return {
    revenue: 100_000,
    revenueGrowthRate: 0.10,
    cogsPercent: 0.40,
    sgaPercent: 0.15,
    rdPercent: 0.10,
    daPercent: 0.05,
    interestExpense: 1_000,
    taxRate: 0.21,
    cashAndEquivalents: 50_000,
    accountsReceivable: 10_000,
    inventory: 8_000,
    ppe: 30_000,
    totalDebt: 20_000,
    accountsPayable: 7_000,
    capexPercent: 0.08,
    nwcChange: 2_000,
    wacc: 0.10,
    terminalGrowthRate: 0.03,
    projectionYears: 5,
    sharesOutstanding: 1_000,
    ...overrides,
  }
}

function makeIncomeStatement(overrides: Partial<IncomeStatement> = {}): IncomeStatement {
  return {
    revenue: 100_000,
    cogs: 40_000,
    grossProfit: 60_000,
    sga: 15_000,
    rd: 10_000,
    ebitda: 35_000,
    da: 5_000,
    ebit: 30_000,
    interestExpense: 1_000,
    ebt: 29_000,
    tax: 6_090,
    netIncome: 22_910,
    ...overrides,
  }
}

describe("deriveBalanceSheet", () => {
  it("computes all balance sheet line items", () => {
    const drivers = makeDrivers()
    const income = makeIncomeStatement()
    const result = deriveBalanceSheet(drivers, income)

    expect(result.cashAndEquivalents).toBe(50_000)
    expect(result.accountsReceivable).toBe(10_000)
    expect(result.inventory).toBe(8_000)
    expect(result.totalCurrentAssets).toBe(68_000)
    expect(result.ppe).toBe(30_000)
    expect(result.totalAssets).toBe(98_000)
    expect(result.accountsPayable).toBe(7_000)
    expect(result.totalDebt).toBe(20_000)
    expect(result.totalLiabilities).toBe(27_000)
    expect(result.equity).toBe(71_000)
  })

  it("balance sheet always balances: assets = liabilities + equity", () => {
    const drivers = makeDrivers({ cashAndEquivalents: 100_000, totalDebt: 5_000 })
    const income = makeIncomeStatement()
    const result = deriveBalanceSheet(drivers, income)

    expect(result.totalAssets).toBe(result.totalLiabilities + result.equity)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/balance-sheet.test.ts
```

Expected: FAIL -- cannot find module

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/dcf-engine/balance-sheet.ts`:
```typescript
import type {
  FinancialModelDrivers,
  IncomeStatement,
  BalanceSheet,
} from "@tori/shared"

function deriveBalanceSheet(
  drivers: FinancialModelDrivers,
  _income: IncomeStatement,
): BalanceSheet {
  const cashAndEquivalents = drivers.cashAndEquivalents
  const accountsReceivable = drivers.accountsReceivable
  const inventory = drivers.inventory
  const totalCurrentAssets = cashAndEquivalents + accountsReceivable + inventory
  const ppe = drivers.ppe
  const totalAssets = totalCurrentAssets + ppe
  const accountsPayable = drivers.accountsPayable
  const totalDebt = drivers.totalDebt
  const totalLiabilities = accountsPayable + totalDebt
  const equity = totalAssets - totalLiabilities

  return {
    cashAndEquivalents,
    accountsReceivable,
    inventory,
    totalCurrentAssets,
    ppe,
    totalAssets,
    accountsPayable,
    totalDebt,
    totalLiabilities,
    equity,
  }
}

export { deriveBalanceSheet }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/balance-sheet.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/dcf-engine/balance-sheet.*
git commit -m "feat: add balance sheet derivation from drivers and income statement"
```

---

### Task 3: Cash Flow Statement Derivation

**Files:**
- Create: `packages/server/src/dcf-engine/cash-flow.ts`
- Create: `packages/server/src/dcf-engine/cash-flow.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/dcf-engine/cash-flow.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { deriveCashFlow } from "./cash-flow.js"
import type { FinancialModelDrivers, IncomeStatement } from "@tori/shared"

function makeDrivers(overrides: Partial<FinancialModelDrivers> = {}): FinancialModelDrivers {
  return {
    revenue: 100_000,
    revenueGrowthRate: 0.10,
    cogsPercent: 0.40,
    sgaPercent: 0.15,
    rdPercent: 0.10,
    daPercent: 0.05,
    interestExpense: 1_000,
    taxRate: 0.21,
    cashAndEquivalents: 50_000,
    accountsReceivable: 10_000,
    inventory: 8_000,
    ppe: 30_000,
    totalDebt: 20_000,
    accountsPayable: 7_000,
    capexPercent: 0.08,
    nwcChange: 2_000,
    wacc: 0.10,
    terminalGrowthRate: 0.03,
    projectionYears: 5,
    sharesOutstanding: 1_000,
    ...overrides,
  }
}

function makeIncomeStatement(overrides: Partial<IncomeStatement> = {}): IncomeStatement {
  return {
    revenue: 100_000,
    cogs: 40_000,
    grossProfit: 60_000,
    sga: 15_000,
    rd: 10_000,
    ebitda: 35_000,
    da: 5_000,
    ebit: 30_000,
    interestExpense: 1_000,
    ebt: 29_000,
    tax: 6_090,
    netIncome: 22_910,
    ...overrides,
  }
}

describe("deriveCashFlow", () => {
  it("computes free cash flow from net income, D&A, NWC change, and capex", () => {
    const drivers = makeDrivers()
    const income = makeIncomeStatement()
    const result = deriveCashFlow(drivers, income)

    expect(result.netIncome).toBe(22_910)
    expect(result.da).toBe(5_000)
    expect(result.nwcChange).toBe(2_000)
    expect(result.operatingCashFlow).toBe(22_910 + 5_000 - 2_000)
    expect(result.capex).toBe(8_000)
    expect(result.freeCashFlow).toBe(22_910 + 5_000 - 2_000 - 8_000)
  })

  it("negative NWC change increases operating cash flow", () => {
    const drivers = makeDrivers({ nwcChange: -3_000 })
    const income = makeIncomeStatement()
    const result = deriveCashFlow(drivers, income)

    expect(result.operatingCashFlow).toBe(22_910 + 5_000 + 3_000)
  })

  it("high capex reduces free cash flow", () => {
    const drivers = makeDrivers({ capexPercent: 0.30 })
    const income = makeIncomeStatement()
    const result = deriveCashFlow(drivers, income)

    expect(result.capex).toBe(30_000)
    expect(result.freeCashFlow).toBe(22_910 + 5_000 - 2_000 - 30_000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/cash-flow.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/dcf-engine/cash-flow.ts`:
```typescript
import type {
  FinancialModelDrivers,
  IncomeStatement,
  CashFlowStatement,
} from "@tori/shared"

function deriveCashFlow(
  drivers: FinancialModelDrivers,
  income: IncomeStatement,
): CashFlowStatement {
  const netIncome = income.netIncome
  const da = income.da
  const nwcChange = drivers.nwcChange
  const operatingCashFlow = netIncome + da - nwcChange
  const capex = drivers.revenue * drivers.capexPercent
  const freeCashFlow = operatingCashFlow - capex

  return {
    netIncome,
    da,
    nwcChange,
    operatingCashFlow,
    capex,
    freeCashFlow,
  }
}

export { deriveCashFlow }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/cash-flow.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/dcf-engine/cash-flow.*
git commit -m "feat: add cash flow statement derivation with FCF calculation"
```

---

### Task 4: Three-Statement Integration

**Files:**
- Create: `packages/server/src/dcf-engine/three-statements.ts`
- Create: `packages/server/src/dcf-engine/three-statements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/dcf-engine/three-statements.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { deriveThreeStatements } from "./three-statements.js"
import type { FinancialModelDrivers } from "@tori/shared"

function makeDrivers(overrides: Partial<FinancialModelDrivers> = {}): FinancialModelDrivers {
  return {
    revenue: 100_000,
    revenueGrowthRate: 0.10,
    cogsPercent: 0.40,
    sgaPercent: 0.15,
    rdPercent: 0.10,
    daPercent: 0.05,
    interestExpense: 1_000,
    taxRate: 0.21,
    cashAndEquivalents: 50_000,
    accountsReceivable: 10_000,
    inventory: 8_000,
    ppe: 30_000,
    totalDebt: 20_000,
    accountsPayable: 7_000,
    capexPercent: 0.08,
    nwcChange: 2_000,
    wacc: 0.10,
    terminalGrowthRate: 0.03,
    projectionYears: 5,
    sharesOutstanding: 1_000,
    ...overrides,
  }
}

describe("deriveThreeStatements", () => {
  it("links all three statements together from a single set of drivers", () => {
    const drivers = makeDrivers()
    const result = deriveThreeStatements(drivers)

    expect(result.incomeStatement.revenue).toBe(100_000)
    expect(result.incomeStatement.netIncome).toBeCloseTo(22_910, 0)
    expect(result.balanceSheet.totalAssets).toBe(
      result.balanceSheet.totalLiabilities + result.balanceSheet.equity,
    )
    expect(result.cashFlowStatement.netIncome).toBe(result.incomeStatement.netIncome)
    expect(result.cashFlowStatement.da).toBe(result.incomeStatement.da)
  })

  it("net income flows from income statement to cash flow statement", () => {
    const drivers = makeDrivers({ revenue: 500_000 })
    const result = deriveThreeStatements(drivers)

    expect(result.cashFlowStatement.netIncome).toBe(result.incomeStatement.netIncome)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/three-statements.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/dcf-engine/three-statements.ts`:
```typescript
import type { FinancialModelDrivers, ThreeStatementOutput } from "@tori/shared"
import { deriveIncomeStatement } from "./income-statement.js"
import { deriveBalanceSheet } from "./balance-sheet.js"
import { deriveCashFlow } from "./cash-flow.js"

function deriveThreeStatements(drivers: FinancialModelDrivers): ThreeStatementOutput {
  const incomeStatement = deriveIncomeStatement(drivers)
  const balanceSheet = deriveBalanceSheet(drivers, incomeStatement)
  const cashFlowStatement = deriveCashFlow(drivers, incomeStatement)

  return { incomeStatement, balanceSheet, cashFlowStatement }
}

export { deriveThreeStatements }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/three-statements.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/dcf-engine/three-statements.*
git commit -m "feat: integrate 3-statement model with linked financial outputs"
```

---

### Task 5: Override Merging

**Files:**
- Create: `packages/server/src/dcf-engine/merge-drivers.ts`
- Create: `packages/server/src/dcf-engine/merge-drivers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/dcf-engine/merge-drivers.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { mergeDrivers } from "./merge-drivers.js"
import type { FinancialModelDrivers } from "@tori/shared"

const baseDrivers: FinancialModelDrivers = {
  revenue: 100_000,
  revenueGrowthRate: 0.10,
  cogsPercent: 0.40,
  sgaPercent: 0.15,
  rdPercent: 0.10,
  daPercent: 0.05,
  interestExpense: 1_000,
  taxRate: 0.21,
  cashAndEquivalents: 50_000,
  accountsReceivable: 10_000,
  inventory: 8_000,
  ppe: 30_000,
  totalDebt: 20_000,
  accountsPayable: 7_000,
  capexPercent: 0.08,
  nwcChange: 2_000,
  wacc: 0.10,
  terminalGrowthRate: 0.03,
  projectionYears: 5,
  sharesOutstanding: 1_000,
}

describe("mergeDrivers", () => {
  it("returns base drivers when no overrides are provided", () => {
    const result = mergeDrivers(baseDrivers, {})
    expect(result).toEqual(baseDrivers)
  })

  it("overrides specific fields while preserving others", () => {
    const result = mergeDrivers(baseDrivers, { revenue: 200_000, taxRate: 0.25 })

    expect(result.revenue).toBe(200_000)
    expect(result.taxRate).toBe(0.25)
    expect(result.cogsPercent).toBe(0.40)
    expect(result.wacc).toBe(0.10)
  })

  it("does not mutate the original drivers", () => {
    const original = { ...baseDrivers }
    mergeDrivers(baseDrivers, { revenue: 999_999 })
    expect(baseDrivers).toEqual(original)
  })

  it("applies multiple override layers in order", () => {
    const apiData: Partial<FinancialModelDrivers> = { revenue: 150_000, cogsPercent: 0.35 }
    const userOverrides: Partial<FinancialModelDrivers> = { revenue: 175_000 }

    const result = mergeDrivers(baseDrivers, apiData, userOverrides)

    expect(result.revenue).toBe(175_000)
    expect(result.cogsPercent).toBe(0.35)
    expect(result.sgaPercent).toBe(0.15)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/merge-drivers.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/dcf-engine/merge-drivers.ts`:
```typescript
import type { FinancialModelDrivers } from "@tori/shared"

function mergeDrivers(
  base: FinancialModelDrivers,
  ...overrideLayers: ReadonlyArray<Partial<FinancialModelDrivers>>
): FinancialModelDrivers {
  return overrideLayers.reduce<FinancialModelDrivers>(
    (acc, layer) => ({ ...acc, ...layer }),
    { ...base },
  )
}

export { mergeDrivers }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/merge-drivers.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/dcf-engine/merge-drivers.*
git commit -m "feat: add driver override merging with multi-layer precedence"
```

---

### Task 6: DCF Valuation Calculator

**Files:**
- Create: `packages/server/src/dcf-engine/dcf-calculator.ts`
- Create: `packages/server/src/dcf-engine/dcf-calculator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/dcf-engine/dcf-calculator.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { calculateDCF } from "./dcf-calculator.js"
import type { FinancialModelDrivers } from "@tori/shared"

function makeDrivers(overrides: Partial<FinancialModelDrivers> = {}): FinancialModelDrivers {
  return {
    revenue: 100_000,
    revenueGrowthRate: 0.10,
    cogsPercent: 0.40,
    sgaPercent: 0.15,
    rdPercent: 0.10,
    daPercent: 0.05,
    interestExpense: 1_000,
    taxRate: 0.21,
    cashAndEquivalents: 50_000,
    accountsReceivable: 10_000,
    inventory: 8_000,
    ppe: 30_000,
    totalDebt: 20_000,
    accountsPayable: 7_000,
    capexPercent: 0.08,
    nwcChange: 2_000,
    wacc: 0.10,
    terminalGrowthRate: 0.03,
    projectionYears: 5,
    sharesOutstanding: 1_000,
    ...overrides,
  }
}

describe("calculateDCF", () => {
  it("projects FCF for the specified number of years", () => {
    const drivers = makeDrivers({ projectionYears: 5 })
    const result = calculateDCF(drivers)

    expect(result.projectedFCFs).toHaveLength(5)
    expect(result.discountedFCFs).toHaveLength(5)
    expect(result.threeStatements).toHaveLength(5)
  })

  it("grows revenue by revenueGrowthRate each year", () => {
    const drivers = makeDrivers({ revenue: 100_000, revenueGrowthRate: 0.10 })
    const result = calculateDCF(drivers)

    expect(result.threeStatements[0]!.incomeStatement.revenue).toBeCloseTo(110_000, 0)
    expect(result.threeStatements[1]!.incomeStatement.revenue).toBeCloseTo(121_000, 0)
    expect(result.threeStatements[2]!.incomeStatement.revenue).toBeCloseTo(133_100, 0)
  })

  it("discounts FCFs back at WACC", () => {
    const drivers = makeDrivers({ wacc: 0.10 })
    const result = calculateDCF(drivers)

    const firstFCF = result.projectedFCFs[0]!
    const firstDiscounted = result.discountedFCFs[0]!
    expect(firstDiscounted).toBeCloseTo(firstFCF / 1.10, 0)

    const secondFCF = result.projectedFCFs[1]!
    const secondDiscounted = result.discountedFCFs[1]!
    expect(secondDiscounted).toBeCloseTo(secondFCF / (1.10 ** 2), 0)
  })

  it("calculates terminal value using Gordon Growth Model", () => {
    const drivers = makeDrivers({
      wacc: 0.10,
      terminalGrowthRate: 0.03,
      projectionYears: 5,
    })
    const result = calculateDCF(drivers)

    const lastFCF = result.projectedFCFs[4]!
    const expectedTV = (lastFCF * (1 + 0.03)) / (0.10 - 0.03)
    expect(result.terminalValue).toBeCloseTo(expectedTV, 0)
  })

  it("computes enterprise value as sum of discounted FCFs + discounted TV", () => {
    const drivers = makeDrivers()
    const result = calculateDCF(drivers)

    const sumDiscountedFCFs = result.discountedFCFs.reduce((a, b) => a + b, 0)
    expect(result.enterpriseValue).toBeCloseTo(
      sumDiscountedFCFs + result.discountedTerminalValue,
      0,
    )
  })

  it("computes equity value as EV minus net debt", () => {
    const drivers = makeDrivers({ totalDebt: 20_000, cashAndEquivalents: 50_000 })
    const result = calculateDCF(drivers)

    expect(result.netDebt).toBe(-30_000)
    expect(result.equityValue).toBeCloseTo(result.enterpriseValue - result.netDebt, 0)
  })

  it("computes per-share value", () => {
    const drivers = makeDrivers({ sharesOutstanding: 1_000 })
    const result = calculateDCF(drivers)

    expect(result.perShareValue).toBeCloseTo(result.equityValue / 1_000, 2)
  })

  it("handles single projection year", () => {
    const drivers = makeDrivers({ projectionYears: 1 })
    const result = calculateDCF(drivers)

    expect(result.projectedFCFs).toHaveLength(1)
    expect(result.enterpriseValue).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/dcf-calculator.test.ts
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Create `packages/server/src/dcf-engine/dcf-calculator.ts`:
```typescript
import type { FinancialModelDrivers, DCFResult } from "@tori/shared"
import { deriveThreeStatements } from "./three-statements.js"

function calculateDCF(drivers: FinancialModelDrivers): DCFResult {
  const projectedFCFs: number[] = []
  const discountedFCFs: number[] = []
  const threeStatements = []
  let currentRevenue = drivers.revenue

  for (let year = 1; year <= drivers.projectionYears; year++) {
    const projectedRevenue = currentRevenue * (1 + drivers.revenueGrowthRate)
    const yearDrivers: FinancialModelDrivers = {
      ...drivers,
      revenue: projectedRevenue,
    }
    const statements = deriveThreeStatements(yearDrivers)
    const fcf = statements.cashFlowStatement.freeCashFlow
    const discountFactor = (1 + drivers.wacc) ** year
    const discountedFCF = fcf / discountFactor

    projectedFCFs.push(fcf)
    discountedFCFs.push(discountedFCF)
    threeStatements.push(statements)
    currentRevenue = projectedRevenue
  }

  const lastFCF = projectedFCFs[projectedFCFs.length - 1]!
  const terminalValue =
    (lastFCF * (1 + drivers.terminalGrowthRate)) /
    (drivers.wacc - drivers.terminalGrowthRate)

  const discountedTerminalValue =
    terminalValue / (1 + drivers.wacc) ** drivers.projectionYears

  const sumDiscountedFCFs = discountedFCFs.reduce((a, b) => a + b, 0)
  const enterpriseValue = sumDiscountedFCFs + discountedTerminalValue

  const netDebt = drivers.totalDebt - drivers.cashAndEquivalents
  const equityValue = enterpriseValue - netDebt
  const perShareValue = equityValue / drivers.sharesOutstanding

  return {
    projectedFCFs,
    terminalValue,
    discountedFCFs,
    discountedTerminalValue,
    enterpriseValue,
    netDebt,
    equityValue,
    perShareValue,
    threeStatements,
  }
}

export { calculateDCF }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/dcf-calculator.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/dcf-engine/dcf-calculator.*
git commit -m "feat: add DCF valuation calculator with projected FCF and terminal value"
```

---

### Task 7: DCF Engine Barrel Export

**Files:**
- Create: `packages/server/src/dcf-engine/index.ts`

- [ ] **Step 1: Create barrel export**

Create `packages/server/src/dcf-engine/index.ts`:
```typescript
export { deriveIncomeStatement } from "./income-statement.js"
export { deriveBalanceSheet } from "./balance-sheet.js"
export { deriveCashFlow } from "./cash-flow.js"
export { deriveThreeStatements } from "./three-statements.js"
export { mergeDrivers } from "./merge-drivers.js"
export { calculateDCF } from "./dcf-calculator.js"
```

- [ ] **Step 2: Run all DCF engine tests**

```bash
pnpm --filter @tori/server test -- src/dcf-engine/
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/dcf-engine/index.ts
git commit -m "feat: add DCF engine barrel export"
```

---

That completes Phase 2. The DCF engine is now a fully tested, pure-function module that:
- Derives income statement, balance sheet, and cash flow statement from a set of financial drivers
- Links all three statements (net income flows IS -> CF, D&A flows IS -> CF)
- Merges override layers with correct precedence
- Projects FCF over N years with revenue growth
- Calculates terminal value via Gordon Growth Model
- Discounts everything back at WACC to produce enterprise and equity values
