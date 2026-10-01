import { z } from 'zod'

export const repositorySchema = z.object({
    id: z.number(),
    full_name: z.string(),
    name: z.string(),
    private: z.boolean(),
    html_url: z.string(),
    updated_at: z.string().nullable().optional(),
    owner: z.object({ login: z.string() }),
})

const user = z.object({ login: z.string() }).nullable().optional()

export const pullRequestSchema = z.object({
    id: z.number(),
    number: z.number(),
    title: z.string(),
    html_url: z.string(),
    state: z.enum(['open', 'closed']),
    draft: z.boolean().optional().default(false),
    user,
    head: z.object({ ref: z.string(), sha: z.string() }),
    base: z.object({ ref: z.string() }),
    requested_reviewers: z
        .array(z.object({ login: z.string() }))
        .optional()
        .default([]),
    created_at: z.string(),
    updated_at: z.string(),
    closed_at: z.string().nullable().optional(),
    merged_at: z.string().nullable().optional(),
    additions: z.number().optional(),
    deletions: z.number().optional(),
    changed_files: z.number().optional(),
})

export const reviewSchema = z.object({ user, state: z.string(), submitted_at: z.string().nullable().optional() })

export const checkRunsSchema = z.object({
    check_runs: z.array(z.object({ status: z.string(), conclusion: z.string().nullable() })),
})

export const reviewCommentSchema = z.object({
    id: z.number(),
    body: z.string(),
    user,
    path: z.string(),
    line: z.number().nullable().optional(),
    original_line: z.number().nullable().optional(),
    start_line: z.number().nullable().optional(),
    commit_id: z.string().nullable().optional(),
    in_reply_to_id: z.number().nullable().optional(),
    created_at: z.string(),
    html_url: z.string(),
})

export const issueCommentSchema = z.object({
    id: z.number(),
    body: z.string().nullable(),
    user,
    created_at: z.string(),
    html_url: z.string(),
})

export const webhookSchema = z.object({
    repository: z.object({ id: z.number() }),
    pull_request: z.object({ number: z.number() }).optional(),
    issue: z.object({ number: z.number(), pull_request: z.object({}).passthrough().optional() }).optional(),
})

export type GithubPullRequest = z.output<typeof pullRequestSchema>
export type GithubReview = z.output<typeof reviewSchema>
export type GithubReviewComment = z.output<typeof reviewCommentSchema>
export type GithubIssueComment = z.output<typeof issueCommentSchema>
export type GithubRepository = z.output<typeof repositorySchema>
