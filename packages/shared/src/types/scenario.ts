type TariffPolicy = {
  readonly id: string
  readonly scenarioId: string
  readonly name: string
  readonly tariffPercent: number
  readonly targetCountry: string
  readonly targetSector: string | null
  readonly targetProduct: string | null
  readonly affectedEdgeIds: readonly string[]
}

type Scenario = {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly policies: readonly TariffPolicy[]
  readonly createdAt: string
}

export type { TariffPolicy, Scenario }
