import { z } from 'zod'

import type {
    Board,
    DiffFile,
    Effort,
    NotePatch,
    Priority,
    ReviewData,
    ReviewThread,
    ThreadFix,
} from '@/features/board/types'

const nullableString = z.string().nullable()
const nullableNumber = z.number().nullable()

export const effortSchema = z.enum(['quick', 'short', 'normal', 'deep']) satisfies z.ZodType<Effort>
export const prioritySchema = z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
]) satisfies z.ZodType<Priority>

export const boardSchema = z.object({
    repository: z.string(),
    author: z.string(),
    fetchedAt: z.string(),
    stack: z.object({ branch: z.string(), envUrl: z.string() }),
    groups: z.array(
        z.object({
            id: z.enum(['stack', 'other', 'drafts']),
            title: z.string(),
            description: nullableString,
            prs: z.array(z.number()),
            trailing: z.array(z.number()).optional(),
        }),
    ),
    prs: z.array(
        z.object({
            number: z.number(),
            url: z.string(),
            step: nullableNumber,
            ticket: z.object({ key: z.string(), old: nullableString }).nullable(),
            title: z.string(),
            base: nullableString,
            add: z.number(),
            rem: z.number(),
            files: z.number(),
            env: z.discriminatedUnion('kind', [
                z.object({ kind: z.literal('branch'), url: z.string(), host: z.string() }),
                z.object({ kind: z.literal('shared') }),
                z.object({ kind: z.literal('none') }),
            ]),
            pipeline: z.enum(['passed', 'failed', 'missing']),
            draft: z.boolean(),
            author: z.string(),
            reviewer: nullableString,
            review: z.enum(['approved', 'changes_requested', 'pending', 'none']),
            updatedAt: z.string(),
            linkedTo: nullableNumber,
        }),
    ),
}) satisfies z.ZodType<Board>

const threadSchema = z.object({
    id: z.number(),
    who: z.string(),
    path: nullableString,
    line: nullableNumber,
    lineFrom: nullableNumber.default(null),
    created: z.string(),
    status: z.enum(['open', 'recheck', 'resolved']),
    changed: nullableString,
    changedAt: nullableString,
    replied: z.boolean(),
    url: z.string(),
    messages: z.array(z.object({ who: z.string(), at: z.string(), text: z.string() })),
}) satisfies z.ZodType<ReviewThread>

const fixSchema = z.object({
    fromCommit: z.string(),
    toCommit: z.string(),
    diff: z.string().optional(),
    binary: z.boolean().optional(),
    deleted: z.boolean().optional(),
    excerpt: z
        .object({ start: z.number(), lines: z.array(z.string()), from: nullableNumber, to: nullableNumber })
        .nullable()
        .optional(),
}) satisfies z.ZodType<ThreadFix>

export const reviewSchema = z.object({
    threads: z.partialRecord(z.string(), z.array(threadSchema)),
    review: z.partialRecord(
        z.string(),
        z.object({ who: z.string(), state: z.enum(['approved', 'changes_requested']).nullable() }),
    ),
    fixes: z.partialRecord(z.string(), fixSchema),
}) satisfies z.ZodType<ReviewData>

export const diffFilesSchema = z.array(
    z.object({
        path: z.string(),
        old: nullableString,
        status: z.enum(['added', 'modified', 'removed']),
        add: z.number(),
        rem: z.number(),
        binary: z.boolean(),
        truncated: z.boolean(),
        diff: z.string(),
    }),
) satisfies z.ZodType<DiffFile[]>

export const notePatchSchema = z
    .object({
        text: z.string().max(10_000).nullable(),
        priority: prioritySchema.nullable(),
        effort: effortSchema.nullable(),
    })
    .partial()
    .strict() satisfies z.ZodType<NotePatch>

export const snapshotNotesSchema = z.record(
    z.string(),
    z.object({
        text: z.string().optional(),
        priority: prioritySchema.optional(),
        effort: effortSchema.optional(),
        updatedAt: z.string(),
    }),
)
