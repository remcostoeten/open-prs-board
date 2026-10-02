import { z } from 'zod'

import type { Effort, NotePatch, Priority } from '@/features/board/types'

export const effortSchema = z.enum(['quick', 'short', 'normal', 'deep']) satisfies z.ZodType<Effort>
export const prioritySchema = z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
]) satisfies z.ZodType<Priority>

export const notePatchSchema = z
    .object({
        text: z.string().max(10_000).nullable(),
        priority: prioritySchema.nullable(),
        effort: effortSchema.nullable(),
    })
    .partial()
    .strict() satisfies z.ZodType<NotePatch>

export const commentBodySchema = z.string().trim().min(1).max(10_000)
