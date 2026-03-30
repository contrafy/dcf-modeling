import type { FinancialModelDrivers } from "@dcf-modeling/shared"

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
