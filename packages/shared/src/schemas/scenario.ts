import { z } from "zod"

const TariffPolicySchema = z.object({
  id: z.string().min(1),
  scenarioId: z.string().min(1),
  name: z.string().min(1),
  tariffPercent: z.number().min(0).max(1),
  targetCountry: z.string().min(1),
  targetSector: z.string().nullable().default(null),
  targetProduct: z.string().nullable().default(null),
  affectedEdgeIds: z.array(z.string()),
})

const CreateTariffPolicySchema = TariffPolicySchema.omit({
  id: true,
  scenarioId: true,
  affectedEdgeIds: true,
})

const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  policies: z.array(TariffPolicySchema),
  createdAt: z.string().datetime(),
})

const CreateScenarioSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
})

export {
  TariffPolicySchema,
  CreateTariffPolicySchema,
  ScenarioSchema,
  CreateScenarioSchema,
}
