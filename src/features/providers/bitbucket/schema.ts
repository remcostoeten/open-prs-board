import { z } from 'zod'

const link = z.object({ href: z.string() })

export function pageSchema<Item extends z.ZodType>(item: Item) {
    return z.object({ values: z.array(item), next: z.string().optional() })
}

export const repositorySchema = z.object({
    uuid: z.string(),
    full_name: z.string(),
    name: z.string(),
    is_private: z.boolean().optional().default(true),
    updated_on: z.string().nullable().optional(),
    workspace: z.object({ slug: z.string() }).optional(),
    links: z.object({ html: link }),
})

const participantSchema = z.object({
    role: z.string(),
    approved: z.boolean().optional().default(false),
    state: z.string().nullable().optional(),
    user: z.object({ display_name: z.string() }).nullable().optional(),
})

export const pullRequestSchema = z.object({
    id: z.number(),
    title: z.string(),
    state: z.enum(['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED']),
    draft: z.boolean().optional().default(false),
    author: z.object({ display_name: z.string() }).nullable().optional(),
    source: z.object({
        branch: z.object({ name: z.string() }),
        commit: z.object({ hash: z.string() }).nullable().optional(),
    }),
    destination: z.object({ branch: z.object({ name: z.string() }) }),
    participants: z.array(participantSchema).optional().default([]),
    created_on: z.string(),
    updated_on: z.string(),
    links: z.object({ html: link }),
})

export const diffstatSchema = z.object({
    lines_added: z.number().optional().default(0),
    lines_removed: z.number().optional().default(0),
})

export const commitStatusSchema = z.object({ state: z.string() })

export const commentSchema = z.object({
    id: z.number(),
    content: z.object({ raw: z.string() }),
    user: z.object({ display_name: z.string() }).nullable().optional(),
    created_on: z.string(),
    deleted: z.boolean().optional().default(false),
    parent: z.object({ id: z.number() }).nullable().optional(),
    inline: z
        .object({ path: z.string(), from: z.number().nullable().optional(), to: z.number().nullable().optional() })
        .nullable()
        .optional(),
    resolution: z.object({ type: z.string().optional() }).nullable().optional(),
    links: z.object({ html: link.optional() }).optional(),
})

export const webhookSchema = z.object({
    repository: z.object({ uuid: z.string() }),
    pullrequest: z.object({ id: z.number() }).optional(),
})

export type BitbucketRepository = z.output<typeof repositorySchema>
export type BitbucketPullRequest = z.output<typeof pullRequestSchema>
export type BitbucketComment = z.output<typeof commentSchema>
