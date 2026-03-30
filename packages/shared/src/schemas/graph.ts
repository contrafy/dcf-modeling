import { z } from "zod"

const SupplyEdgeSchema = z.object({
  id: z.string().min(1),
  fromTicker: z.string().min(1),
  toTicker: z.string().min(1),
  revenueWeight: z.number().min(0).max(1),
  productCategory: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source: z.enum(["manual", "llm", "sec_filing"]),
  passthrough: z.number().min(0).max(1).default(0.7),
  lastVerified: z.string().datetime(),
})

const CreateSupplyEdgeSchema = SupplyEdgeSchema.omit({
  id: true,
  lastVerified: true,
})

const UpdateSupplyEdgeSchema = z.object({
  revenueWeight: z.number().min(0).max(1).optional(),
  productCategory: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  passthrough: z.number().min(0).max(1).optional(),
})

export { SupplyEdgeSchema, CreateSupplyEdgeSchema, UpdateSupplyEdgeSchema }
