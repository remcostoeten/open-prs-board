import { eq, inArray } from 'drizzle-orm'

import { getAdapter } from '@/features/providers/registry'
import type { ProviderAdapter, SyncContext, SyncedPullRequest } from '@/features/providers/types'
import { claimRun, touchRun, type SyncRun } from '@/features/sync/queue'
import { closePullRequest, deriveLinks, storeThreads, upsertPullRequest } from '@/features/sync/store'
import { candidateTokens } from '@/features/sync/tokens'
import type { SyncStats, SyncStatus } from '@/features/sync/types'
import { appError, fail, ok, type AppError, type Result } from '@/shared/errors/result'
import { logError, redact } from '@/server/errors/log'
import { withRetry } from '@/server/errors/retry'
import { db } from '@/server/db/client'
import { pullRequests, repositories, syncRuns } from '@/server/db/board-schema'
import type { ID } from '@/store/semantic'
import { isSameInstant } from '@/shared/helpers/time'

export const ARCHIVE_DAYS = 30
export const RETENTION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const MAX_INLINE_WAIT_MS = 30_000
const RUN_BUDGET_MS = 50_000

type Repository = typeof repositories.$inferSelect

type RunState = {
    run: SyncRun
    repository: Repository
    adapter: ProviderAdapter
    ctx: SyncContext
    deadline: number
    stats: SyncStats
}

function retry<Value>(state: RunState, task: () => Promise<Result<Value>>) {
    return withRetry(task, { deadline: state.deadline, maxWaitMs: MAX_INLINE_WAIT_MS })
}

function withContext(error: AppError, state: Pick<RunState, 'run' | 'repository'>): AppError {
    return {
        ...error,
        context: {
            ...error.context,
            correlationId: state.run.correlationId,
            provider: state.repository.provider,
            repositoryId: state.repository.id,
        },
    }
}

const MAX_ATTEMPTS = 5

async function finish(run: SyncRun, status: SyncStatus, stats: SyncStats | null, error: AppError | null) {
    const retryLater = status === 'partial' && run.attempt < MAX_ATTEMPTS
    const wait = error?.retryAfterMs ?? 60_000
    await db
        .update(syncRuns)
        .set({
            status,
            stats,
            leaseExpiresAt: null,
            errorCode: error?.code ?? null,
            errorDetail: error ? redact(error.detail).slice(0, 2000) : null,
            nextAttemptAt: retryLater ? new Date(Date.now() + wait).toISOString() : null,
            finishedAt: retryLater ? null : new Date().toISOString(),
        })
        .where(eq(syncRuns.id, run.id))
}

/**
 * @name disconnectRepository
 * @description Marks a repository disconnected after every member lost access: syncing stops, its data stays
 * read-only for owners and admins, and it is purged after the retention period.
 *
 * @example
 * await disconnectRepository(repository.id)
 */
export async function disconnectRepository(id: ID) {
    const now = Date.now()
    await db
        .update(repositories)
        .set({
            status: 'disconnected',
            lastErrorCode: 'access_lost',
            disconnectedAt: new Date(now).toISOString(),
            purgeAfter: new Date(now + RETENTION_DAYS * DAY_MS).toISOString(),
        })
        .where(eq(repositories.id, id))
}

async function openList(state: RunState): Promise<Result<SyncedPullRequest[]>> {
    let lastError: AppError | null = null
    for await (const candidate of candidateTokens(state.repository)) {
        state.ctx.token = candidate.token
        const result = await retry(state, () => state.adapter.listPullRequests(state.ctx))
        if (result.ok || (result.error.code !== 'access_lost' && result.error.code !== 'auth_expired')) return result
        lastError = result.error
    }
    if (lastError?.code === 'auth_expired') return fail('auth_revoked', lastError.detail, lastError.context)
    if (lastError) return { ok: false, error: lastError }
    return fail('auth_revoked', 'no member has a valid token for this provider', {
        provider: state.repository.provider,
    })
}

function nearDeadline(state: RunState) {
    return Date.now() > state.deadline - 5_000
}

async function syncPullRequest(state: RunState, synced: SyncedPullRequest, existingUpdatedAt: string | undefined) {
    let pr = synced
    if (!isSameInstant(existingUpdatedAt, synced.updatedAt)) {
        const enriched = await retry(state, () => state.adapter.enrichPullRequest(state.ctx, synced))
        if (enriched.ok) pr = enriched.value
        else logError(withContext(enriched.error, state), 'sync.enrich')
    }
    return upsertPullRequest(state.repository.id, pr)
}

async function syncThreads(state: RunState, ids: ID[]) {
    if (ids.length === 0) return true
    const rows = await db.select().from(pullRequests).where(inArray(pullRequests.id, ids))
    for (const row of rows) {
        if (isSameInstant(row.threadsSyncedAt, row.providerUpdatedAt)) continue
        if (nearDeadline(state)) return false
        const result = await retry(state, () => state.adapter.listThreads(state.ctx, row.externalId))
        if (result.ok) {
            await storeThreads(row.id, result.value, row.providerUpdatedAt)
            state.stats.threads += result.value.length
        } else {
            state.stats.failedThreads++
            logError(withContext(result.error, state), 'sync.threads')
            await db
                .update(pullRequests)
                .set({ threadsErrorCode: result.error.code })
                .where(eq(pullRequests.id, row.id))
        }
    }
    return true
}

async function syncRepository(state: RunState): Promise<Result<'complete' | 'partial'>> {
    const { repository, adapter, ctx } = state
    await touchRun(state.run.id, 'pull_requests')
    const list = await openList(state)
    if (!list.ok) return list
    const existing = await db
        .select({
            id: pullRequests.id,
            externalId: pullRequests.externalId,
            updatedAt: pullRequests.providerUpdatedAt,
            state: pullRequests.state,
        })
        .from(pullRequests)
        .where(eq(pullRequests.repositoryId, repository.id))
    const byExternal = new Map(existing.map((row) => [row.externalId, row]))
    const touched: ID[] = []
    for (const synced of list.value) {
        const row = await syncPullRequest(state, synced, byExternal.get(synced.externalId)?.updatedAt)
        touched.push(row.id)
        state.stats.pullRequests++
    }

    const openIds = new Set(list.value.map((pr) => pr.externalId))
    for (const row of existing.filter((pr) => pr.state === 'open' && !openIds.has(pr.externalId))) {
        const current = await retry(state, () => adapter.getPullRequest(ctx, row.externalId))
        if (current.ok && current.value.state !== 'open') {
            await upsertPullRequest(repository.id, current.value)
            state.stats.closed++
        } else if (!current.ok && current.error.code === 'not_found')
            await closePullRequest(row.id, 'declined', new Date().toISOString())
    }

    await touchRun(state.run.id, 'closed_pull_requests')
    const since = repository.closedCursor ?? new Date(Date.now() - ARCHIVE_DAYS * DAY_MS).toISOString()
    const closed = await retry(state, () => adapter.listClosedPullRequests(ctx, since))
    if (closed.ok) {
        for (const synced of closed.value) {
            const row = await upsertPullRequest(repository.id, synced)
            touched.push(row.id)
            state.stats.closed++
        }
        await db
            .update(repositories)
            .set({ closedCursor: state.run.startedAt })
            .where(eq(repositories.id, repository.id))
    } else logError(withContext(closed.error, state), 'sync.closed')

    await touchRun(state.run.id, 'threads')
    const finished = await syncThreads(state, touched)

    await touchRun(state.run.id, 'links')
    await deriveLinks(repository.id)
    return ok(finished && closed.ok && state.stats.failedThreads === 0 ? 'complete' : 'partial')
}

async function syncOne(state: RunState, externalId: string): Promise<Result<'complete' | 'partial'>> {
    for await (const candidate of candidateTokens(state.repository)) {
        state.ctx.token = candidate.token
        const current = await retry(state, () => state.adapter.getPullRequest(state.ctx, externalId))
        if (!current.ok) {
            if (current.error.code === 'access_lost') continue
            return current
        }
        const row = await syncPullRequest(state, current.value, undefined)
        state.stats.pullRequests++
        await db.update(pullRequests).set({ threadsSyncedAt: null }).where(eq(pullRequests.id, row.id))
        const finished = await syncThreads(state, [row.id])
        await deriveLinks(state.repository.id)
        return ok(finished && state.stats.failedThreads === 0 ? 'complete' : 'partial')
    }
    return fail('access_lost', 'no member token can read this pull request')
}

async function settle(state: RunState, result: Result<'complete' | 'partial'>) {
    const { run, repository, stats } = state
    const now = new Date().toISOString()
    if (result.ok) {
        await db
            .update(repositories)
            .set({ status: 'active', lastErrorCode: null, lastSyncedAt: now })
            .where(eq(repositories.id, repository.id))
        await finish(run, result.value === 'complete' ? 'succeeded' : 'partial', stats, null)
        return
    }
    const error = withContext(result.error, state)
    logError(error, 'sync.run')
    if (error.code === 'access_lost') {
        await disconnectRepository(repository.id)
        await finish(run, 'failed', stats, error)
    } else if (error.code === 'auth_revoked') {
        await db
            .update(repositories)
            .set({ status: 'needs_auth', lastErrorCode: error.code })
            .where(eq(repositories.id, repository.id))
        await finish(run, 'failed', stats, error)
    } else {
        await db
            .update(repositories)
            .set({ status: repository.lastSyncedAt ? repository.status : 'error', lastErrorCode: error.code })
            .where(eq(repositories.id, repository.id))
        await finish(run, error.retryable && run.attempt < MAX_ATTEMPTS ? 'partial' : 'failed', stats, error)
    }
}

/**
 * @name executeRun
 * @description Runs one queued sync to completion or to its time budget. Takes the lease, picks a working member
 * token, syncs open PRs, closed PRs of the last 30 days, threads and derived links, and records the outcome on the
 * run and the repository. Never throws: unexpected exceptions become an `unknown` failure on the run.
 *
 * @example
 * after(() => executeRun(runId))
 */
export async function executeRun(id: ID, budgetMs = RUN_BUDGET_MS) {
    const run = await claimRun(id)
    if (!run) return
    const [repository] = await db.select().from(repositories).where(eq(repositories.id, run.repositoryId))
    const stats: SyncStats = { pullRequests: 0, closed: 0, threads: 0, failedThreads: 0 }
    if (!repository || repository.status === 'disconnected') {
        await finish(run, 'failed', stats, appError('access_lost', 'repository is disconnected or gone'))
        return
    }
    const adapter = getAdapter(repository.provider)
    if (!adapter) {
        await finish(run, 'failed', stats, appError('unknown', `no adapter for ${repository.provider}`))
        return
    }
    const controller = new AbortController()
    const state: RunState = {
        run,
        repository,
        adapter,
        stats,
        deadline: Date.now() + budgetMs,
        ctx: {
            correlationId: run.correlationId,
            token: '',
            repository: { slug: repository.slug, externalId: repository.externalId },
            signal: controller.signal,
        },
    }
    try {
        const result = run.pullRequestExternalId
            ? await syncOne(state, run.pullRequestExternalId)
            : await syncRepository(state)
        await settle(state, result)
    } catch (error) {
        await settle(
            state,
            fail('unknown', error instanceof Error ? `${error.message}\n${error.stack}` : String(error)),
        )
    }
}

/**
 * @name executeRuns
 * @description Executes several runs with at most two at a time, as onboarding and the cron do.
 *
 * @example
 * after(() => executeRuns(runIds))
 */
export async function executeRuns(ids: ID[], budgetMs = RUN_BUDGET_MS) {
    const queue = [...ids]
    async function worker() {
        for (let id = queue.shift(); id; id = queue.shift()) await executeRun(id, budgetMs)
    }
    await Promise.all([worker(), worker()])
}
