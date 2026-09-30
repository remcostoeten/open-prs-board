import { z } from 'zod'

import { effortSchema, prioritySchema } from '@/features/board/schema'

const nullableString = z.string().nullable()
const nullableNumber = z.number().nullable()

export const snapshotBoardSchema = z.object({
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
})

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
})

export const fixSchema = z.object({
    fromCommit: z.string(),
    toCommit: z.string(),
    diff: z.string().optional(),
    binary: z.boolean().optional(),
    deleted: z.boolean().optional(),
    excerpt: z
        .object({ start: z.number(), lines: z.array(z.string()), from: nullableNumber, to: nullableNumber })
        .nullable()
        .optional(),
})

export const snapshotReviewSchema = z.object({
    threads: z.partialRecord(z.string(), z.array(threadSchema)),
    review: z.partialRecord(
        z.string(),
        z.object({ who: z.string(), state: z.enum(['approved', 'changes_requested']).nullable() }),
    ),
    fixes: z.partialRecord(z.string(), fixSchema),
})

export const snapshotDiffSchema = z.array(
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
)

export const snapshotNotesSchema = z.record(
    z.string(),
    z.object({
        text: z.string().optional(),
        priority: prioritySchema.optional(),
        effort: effortSchema.optional(),
        updatedAt: z.string(),
    }),
)

export type SnapshotBoard = z.output<typeof snapshotBoardSchema>
export type SnapshotPullRequest = SnapshotBoard['prs'][number]
export type SnapshotReview = z.output<typeof snapshotReviewSchema>
