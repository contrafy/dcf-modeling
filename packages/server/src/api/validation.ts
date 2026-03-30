import type { Request, Response, NextFunction } from "express"
import { z } from "zod"

type ValidationErrorBody = {
  readonly error: string
  readonly issues: readonly z.ZodIssue[]
}

function sendValidationError(res: Response, issues: readonly z.ZodIssue[]): void {
  const body: ValidationErrorBody = { error: "Validation failed", issues }
  res.status(400).json(body)
}

function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      sendValidationError(res, result.error.issues)
      return
    }
    req.body = result.data as Record<string, unknown>
    next()
  }
}

function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params)
    if (!result.success) {
      sendValidationError(res, result.error.issues)
      return
    }
    next()
  }
}

export { validateBody, validateParams }
export type { ValidationErrorBody }
