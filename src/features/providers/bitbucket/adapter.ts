import { createHmac, timingSafeEqual } from 'node:crypto'
import type { z } from 'zod'

import { groupThreads, mapPullRequest, mapRepository, pipelineFromStatuses } from '@/features/providers/bitbucket/map'
import {
    commentSchema,
    commitStatusSchema,
    diffstatSchema,
    pageSchema,
    pullRequestSchema,
    repositorySchema,
    webhookSchema,
} from '@/features/providers/bitbucket/schema'
import { authorization } from '@/features/providers/authorization'
import { splitUnifiedDiff } from '@/features/providers/diff'
import type { ProviderAdapter, SyncContext, SyncedDiffFile, WebhookEvent } from '@/features/providers/types'
import type { ErrorCode } from '@/shared/errors/codes'
import { fail, ok, type ErrorContext, type Result } from '@/shared/errors/result'
import { parseBody, providerFetch } from '@/server/errors/normalize'

const API = 'https://api.bitbucket.org/2.0'
const MAX_PAGES = 20
const MAX_DIFF_BYTES = 5_000_000

function classifyError(response: Response): ErrorCode | null {
    if (response.status === 429) return 'rate_limited'
    return null
}

function context(ctx: SyncContext): ErrorContext {
    return { correlationId: ctx.correlationId, provider: 'bitbucket' }
}

function request(ctx: SyncContext, url: string, notFound: ErrorCode, accept = 'application/json') {
    return providerFetch(url, {
        signal: ctx.signal,
        context: context(ctx),
        classify: classifyError,
        notFound,
        init: { headers: { Authorization: authorization(ctx), Accept: accept } },
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
): Promise<Result<z.output<Item>[]>> {
    const schema = pageSchema(item)
    const values: z.output<Item>[] = []
    let next: string | undefined = url
    for (let page = 0; next && page < MAX_PAGES; page++) {
        const result: Result<z.output<typeof schema>> = await getJson(ctx, next, schema, notFound)
        if (!result.ok) return result
        values.push(...result.value.values)
        next = result.value.next
    }
    return ok(values)
}

function repoUrl(ctx: SyncContext) {
    return `${API}/repositories/${ctx.repository.slug}`
}

async function listRepositories(ctx: SyncContext) {
    const result = await getAll(
        ctx,
        `${API}/repositories?role=member&pagelen=100&sort=-updated_on`,
        repositorySchema,
        'not_found',
    )
    return result.ok ? ok(result.value.map(mapRepository)) : result
}

async function listPullRequests(ctx: SyncContext) {
    const fields = encodeURIComponent('+values.participants,+values.draft')
    const result = await getAll(
        ctx,
        `${repoUrl(ctx)}/pullrequests?state=OPEN&pagelen=50&fields=${fields}`,
        pullRequestSchema,
        'access_lost',
    )
    return result.ok ? ok(result.value.map(mapPullRequest)) : result
}

async function listClosedPullRequests(ctx: SyncContext, since: string) {
    const query = encodeURIComponent(`updated_on > ${since}`)
    const result = await getAll(
        ctx,
        `${repoUrl(ctx)}/pullrequests?state=MERGED&state=DECLINED&pagelen=50&sort=-updated_on&q=${query}`,
        pullRequestSchema,
        'access_lost',
    )
    return result.ok ? ok(result.value.map(mapPullRequest)) : result
}

async function getPullRequest(ctx: SyncContext, pr: string) {
    const result = await getJson(ctx, `${repoUrl(ctx)}/pullrequests/${pr}`, pullRequestSchema, 'not_found')
    return result.ok ? ok(mapPullRequest(result.value)) : result
}

async function enrichPullRequest(ctx: SyncContext, pr: ReturnType<typeof mapPullRequest>) {
    const stats = await getAll(
        ctx,
        `${repoUrl(ctx)}/pullrequests/${pr.externalId}/diffstat?pagelen=500`,
        diffstatSchema,
        'not_found',
    )
    if (!stats.ok) return stats
    let pipeline = pr.pipeline
    if (pr.headCommit) {
        const statuses = await getAll(
            ctx,
            `${repoUrl(ctx)}/commit/${pr.headCommit}/statuses?pagelen=100`,
            commitStatusSchema,
            'not_found',
        )
        if (!statuses.ok) return statuses
        pipeline = pipelineFromStatuses(statuses.value.map((status) => status.state))
    }
    return ok({
        ...pr,
        additions: stats.value.reduce((sum, file) => sum + file.lines_added, 0),
        deletions: stats.value.reduce((sum, file) => sum + file.lines_removed, 0),
        files: stats.value.length,
        pipeline,
    })
}

async function listThreads(ctx: SyncContext, pr: string) {
    const result = await getAll(
        ctx,
        `${repoUrl(ctx)}/pullrequests/${pr}/comments?pagelen=100`,
        commentSchema,
        'not_found',
    )
    return result.ok
        ? ok(groupThreads(result.value, `https://bitbucket.org/${ctx.repository.slug}/pull-requests/${pr}`))
        : result
}

async function getDiff(ctx: SyncContext, pr: string): Promise<Result<SyncedDiffFile[]>> {
    const response = await request(ctx, `${repoUrl(ctx)}/pullrequests/${pr}/diff`, 'not_found', 'text/plain')
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
    if (!signatureMatches(body, secret, request.headers.get('x-hub-signature')))
        return fail('webhook_invalid', 'signature mismatch', { provider: 'bitbucket' })
    const parsed = webhookSchema.safeParse(parseJson(body))
    if (!parsed.success) return fail('webhook_invalid', 'payload did not parse', { provider: 'bitbucket' })
    return ok({
        repositoryExternalId: parsed.data.repository.uuid,
        pullRequestExternalId: parsed.data.pullrequest ? String(parsed.data.pullrequest.id) : null,
        deliveryId: request.headers.get('x-request-uuid'),
    })
}

export const bitbucket: ProviderAdapter = {
    id: 'bitbucket',
    listRepositories,
    listPullRequests,
    listClosedPullRequests,
    getPullRequest,
    enrichPullRequest,
    listThreads,
    getDiff: (ctx, pr) => getDiff(ctx, pr),
    classifyError,
    parseWebhook,
}
