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
