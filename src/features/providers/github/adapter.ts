import { createHmac, timingSafeEqual } from 'node:crypto'
import type { z } from 'zod'

import { splitUnifiedDiff } from '@/features/providers/diff'
import {
    groupThreads,
    mapPullRequest,
    mapRepository,
    pipelineFromChecks,
    reviewersFromReviews,
} from '@/features/providers/github/map'
import {
    checkRunsSchema,
    issueCommentSchema,
    pullRequestSchema,
    repositorySchema,
    reviewCommentSchema,
    reviewSchema,
    webhookSchema,
} from '@/features/providers/github/schema'
import type {
    ProviderAdapter,
    SyncContext,
    SyncedDiffFile,
    SyncedPullRequest,
    WebhookEvent,
} from '@/features/providers/types'
import type { ErrorCode } from '@/shared/errors/codes'
import { fail, ok, type ErrorContext, type Result } from '@/shared/errors/result'
import { parseBody, providerFetch } from '@/server/errors/normalize'

const API = 'https://api.github.com'
const MAX_PAGES = 20
const MAX_DIFF_BYTES = 5_000_000
const NEXT_LINK = /<([^>]+)>;\s*rel="next"/

function classifyError(response: Response): ErrorCode | null {
    if (response.status === 429) return 'rate_limited'
    if (
        response.status === 403 &&
        (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'))
    )
        return 'rate_limited'
    return null
}

function context(ctx: SyncContext): ErrorContext {
    return { correlationId: ctx.correlationId, provider: 'github' }
}

function request(ctx: SyncContext, url: string, notFound: ErrorCode, accept = 'application/vnd.github+json') {
    return providerFetch(url, {
        signal: ctx.signal,
        context: context(ctx),
        classify: classifyError,
        notFound,
        init: {
            headers: { Authorization: `Bearer ${ctx.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' },
        },
    })
}

async function getJson<Schema extends z.ZodType>(ctx: SyncContext, url: string, schema: Schema, notFound: ErrorCode) {
    const response = await request(ctx, url, notFound)
    if (!response.ok) return response
    return parseBody(response.value, schema, context(ctx))
}

async function getAll<Item extends z.ZodType>(
    ctx: SyncContext,
    url: string,
    item: Item,
    notFound: ErrorCode,
    keepGoing: (page: z.output<Item>[]) => boolean = () => true,
): Promise<Result<z.output<Item>[]>> {
    const schema = item.array()
    const values: z.output<Item>[] = []
    let next: string | undefined = url
    for (let page = 0; next && page < MAX_PAGES; page++) {
        const response = await request(ctx, next, notFound)
        if (!response.ok) return response
        const parsed: Result<z.output<Item>[]> = await parseBody(response.value, schema, context(ctx))
        if (!parsed.ok) return parsed
        values.push(...parsed.value)
        if (!keepGoing(parsed.value)) break
        next = NEXT_LINK.exec(response.value.headers.get('link') ?? '')?.[1]
    }
    return ok(values)
}

function repoUrl(ctx: SyncContext) {
    return `${API}/repos/${ctx.repository.slug}`
}

async function listRepositories(ctx: SyncContext) {
    const result = await getAll(
        ctx,
        `${API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
        repositorySchema,
        'not_found',
    )
    return result.ok ? ok(result.value.map(mapRepository)) : result
}

async function listPullRequests(ctx: SyncContext) {
    const result = await getAll(ctx, `${repoUrl(ctx)}/pulls?state=open&per_page=100`, pullRequestSchema, 'access_lost')
    return result.ok ? ok(result.value.map(mapPullRequest)) : result
}

async function listClosedPullRequests(ctx: SyncContext, since: string) {
    function recent(pr: z.output<typeof pullRequestSchema>) {
        return pr.updated_at > since
    }
    const result = await getAll(
        ctx,
        `${repoUrl(ctx)}/pulls?state=closed&sort=updated&direction=desc&per_page=100`,
        pullRequestSchema,
        'access_lost',
        (page) => page.every(recent),
    )
    return result.ok ? ok(result.value.filter(recent).map(mapPullRequest)) : result
}

async function getPullRequest(ctx: SyncContext, pr: string) {
    const result = await getJson(ctx, `${repoUrl(ctx)}/pulls/${pr}`, pullRequestSchema, 'not_found')
    return result.ok ? ok(mapPullRequest(result.value)) : result
}

async function enrichPullRequest(ctx: SyncContext, pr: SyncedPullRequest): Promise<Result<SyncedPullRequest>> {
    const detail = pr.additions === null ? await getPullRequest(ctx, pr.externalId) : ok(pr)
    if (!detail.ok) return detail
    const reviews = await getAll(
        ctx,
        `${repoUrl(ctx)}/pulls/${pr.externalId}/reviews?per_page=100`,
        reviewSchema,
        'not_found',
    )
    if (!reviews.ok) return reviews
    let pipeline = pr.pipeline
    if (pr.headCommit) {
        const checks = await getJson(
            ctx,
            `${repoUrl(ctx)}/commits/${pr.headCommit}/check-runs?per_page=100`,
            checkRunsSchema,
            'not_found',
        )
        if (!checks.ok) return checks
        pipeline = pipelineFromChecks(checks.value.check_runs)
    }
    return ok({ ...detail.value, reviewers: reviewersFromReviews(pr.reviewers, reviews.value), pipeline })
}

async function listThreads(ctx: SyncContext, pr: string) {
    const review = await getAll(
        ctx,
        `${repoUrl(ctx)}/pulls/${pr}/comments?per_page=100`,
        reviewCommentSchema,
        'not_found',
    )
    if (!review.ok) return review
    const issue = await getAll(
        ctx,
        `${repoUrl(ctx)}/issues/${pr}/comments?per_page=100`,
        issueCommentSchema,
        'not_found',
    )
    if (!issue.ok) return issue
    return ok(groupThreads(review.value, issue.value))
}

async function getDiff(ctx: SyncContext, pr: string): Promise<Result<SyncedDiffFile[]>> {
    const response = await request(ctx, `${repoUrl(ctx)}/pulls/${pr}`, 'not_found', 'application/vnd.github.diff')
    if (!response.ok) return response
    const text = await response.value.text()
    if (text.length > MAX_DIFF_BYTES)
        return fail('invalid_diff', `diff of ${text.length} bytes exceeds the limit`, context(ctx))
    const files = splitUnifiedDiff(text)
    if (text.trim() && files.length === 0)
        return fail('invalid_diff', 'diff did not contain any file headers', context(ctx))
    return ok(files)
}

function signatureMatches(body: string, secret: string, header: string | null) {
    if (!header?.startsWith('sha256=')) return false
    const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`)
    const actual = Buffer.from(header)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function parseJson(body: string) {
    try {
        return JSON.parse(body)
    } catch {
        return null
    }
}

async function parseWebhook(request: Request, secret: string): Promise<Result<WebhookEvent>> {
    const body = await request.text()
    if (!signatureMatches(body, secret, request.headers.get('x-hub-signature-256')))
        return fail('webhook_invalid', 'signature mismatch', { provider: 'github' })
    const parsed = webhookSchema.safeParse(parseJson(body))
    if (!parsed.success) return fail('webhook_invalid', 'payload did not parse', { provider: 'github' })
    const number =
        parsed.data.pull_request?.number ?? (parsed.data.issue?.pull_request ? parsed.data.issue.number : null)
    return ok({
        repositoryExternalId: String(parsed.data.repository.id),
        pullRequestExternalId: number === null ? null : String(number),
        deliveryId: request.headers.get('x-github-delivery'),
    })
}

/**
 * @name github
 * @description Provider adapter for GitHub: repositories the user can reach, open PRs, PRs closed since a date,
 * reviews, check runs, review and issue comments as threads, unified diffs and signed webhooks.
 *
 * @example
 * const prs = await github.listPullRequests(ctx)
 */
export const github: ProviderAdapter = {
    id: 'github',
    listRepositories,
    listPullRequests,
    listClosedPullRequests,
    getPullRequest,
    enrichPullRequest,
    listThreads,
    getDiff,
    classifyError,
    parseWebhook,
}
