import { beforeAll, describe, expect, test } from 'bun:test'

import type { ProviderAdapter, SyncedPullRequest, SyncedThread } from '@/features/providers/types'
import { fail, ok } from '@/shared/errors/result'

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://board:board@localhost:5435/board_test'

const { migrate } = await import('drizzle-orm/postgres-js/migrator')
const { eq, sql } = await import('drizzle-orm')
const { db } = await import('@/server/db/client')
const { organization } = await import('@/server/db/auth-schema')
const { links, pullRequests, repositories, syncRuns, threads, comments } = await import('@/server/db/board-schema')
const { registerAdapter } = await import('@/features/providers/registry')
const { enqueueSync, claimRun } = await import('@/features/sync/queue')
const { executeRun } = await import('@/features/sync/run')

type Behaviour = {
    open: SyncedPullRequest[]
    listError: 'access_lost' | 'rate_limited' | null
    threadsFail: Set<string>
}

const behaviour: Behaviour = { open: [], listError: null, threadsFail: new Set() }

function pr(number: number, source: string, target: string, updatedAt = '2026-09-01T10:00:00Z'): SyncedPullRequest {
    return {
        externalId: String(number),
        number,
        title: `PR ${number}`,
        url: `https://example.test/${number}`,
        state: 'open',
        draft: false,
        author: 'Remco',
        sourceBranch: source,
        targetBranch: target,
        headCommit: `c${number}`,
        additions: 1,
        deletions: 1,
        files: 1,
        pipeline: 'passed',
        reviewers: [{ name: 'Daan', state: null }],
        environment: null,
        ticket: null,
        createdAt: updatedAt,
        updatedAt,
        closedAt: null,
    }
}

const thread: SyncedThread = {
    externalId: 't1',
    path: 'a.ts',
    line: 3,
    lineFrom: null,
    commit: null,
    changedCommit: null,
    changedAt: null,
    status: 'open',
    url: null,
    fix: null,
    comments: [{ externalId: 'c1', author: 'Daan', body: 'Please rename', createdAt: '2026-09-01T11:00:00Z' }],
}

const fake: ProviderAdapter = {
    id: 'snapshot',
    listRepositories: async () => ok([]),
    listPullRequests: async () => {
        if (behaviour.listError === 'access_lost') return fail('access_lost', '403')
        if (behaviour.listError === 'rate_limited') return fail('rate_limited', '429', {}, 3_600_000)
        return ok(behaviour.open)
    },
    listClosedPullRequests: async () => ok([]),
    getPullRequest: async (_ctx, id) =>
        ok({ ...pr(Number(id), `b${id}`, 'main'), state: 'merged', closedAt: '2026-09-03T10:00:00Z' }),
    enrichPullRequest: async (_ctx, value) => ok(value),
    listThreads: async (_ctx, id) =>
        behaviour.threadsFail.has(id) ? fail('invalid_response', 'bad threads') : ok([thread]),
    getDiff: async () => ok([]),
    classifyError: () => null,
    parseWebhook: async () => fail('webhook_invalid', 'none'),
}

let organizationId = ''
let repositoryId = ''

async function sync() {
    const [run] = await enqueueSync(organizationId, [repositoryId], 'manual', crypto.randomUUID())
    if (!run) throw new Error('no run')
    await executeRun(run, 20_000)
    const [row] = await db.select().from(syncRuns).where(eq(syncRuns.id, run))
    const [repo] = await db.select().from(repositories).where(eq(repositories.id, repositoryId))
    return { run: row, repo }
}

beforeAll(async () => {
    await db.execute(sql`drop schema if exists drizzle cascade`)
    await db.execute(sql`drop schema public cascade`)
    await db.execute(sql`create schema public`)
    await migrate(db, { migrationsFolder: 'drizzle' })
    registerAdapter(fake)
    organizationId = crypto.randomUUID()
    await db
        .insert(organization)
        .values({ id: organizationId, name: 'Test', slug: `t-${organizationId}`, createdAt: new Date() })
    const [repo] = await db
        .insert(repositories)
        .values({
            organizationId,
            provider: 'snapshot',
            externalId: 'r1',
            slug: 'acme/web',
            name: 'web',
            url: 'https://example.test',
        })
        .returning()
    repositoryId = repo?.id ?? ''
})

describe('sync runs', () => {
    test('a first sync stores PRs, threads and branch-derived arrows', async () => {
        behaviour.open = [pr(1, 'feature-a', 'main'), pr(2, 'feature-b', 'feature-a')]
        const { run, repo } = await sync()
        expect(run?.status).toBe('succeeded')
        expect(run?.stats).toEqual({ pullRequests: 2, closed: 0, threads: 2, failedThreads: 0 })
        expect(repo?.status).toBe('active')
        expect((await db.select().from(pullRequests)).length).toBe(2)
        const arrows = await db.select().from(links)
        expect(arrows.length).toBe(1)
        expect(arrows[0]?.origin).toBe('derived')
    })

    test('running the same sync again changes nothing', async () => {
        const before = {
            prs: (await db.select().from(pullRequests)).length,
            threads: (await db.select().from(threads)).length,
            comments: (await db.select().from(comments)).length,
        }
        const { run } = await sync()
        expect(run?.status).toBe('succeeded')
        expect({
            prs: (await db.select().from(pullRequests)).length,
            threads: (await db.select().from(threads)).length,
            comments: (await db.select().from(comments)).length,
        }).toEqual(before)
    })

    test('a second worker cannot claim a running run', async () => {
        const [id] = await enqueueSync(organizationId, [repositoryId], 'manual', crypto.randomUUID())
        expect(id).toBeDefined()
        const again = await enqueueSync(organizationId, [repositoryId], 'webhook', crypto.randomUUID())
        expect(again).toEqual([id ?? ''])
        expect(await claimRun(id ?? '')).not.toBeNull()
        expect(await claimRun(id ?? '')).toBeNull()
        await db
            .update(syncRuns)
            .set({ status: 'succeeded', leaseExpiresAt: null })
            .where(eq(syncRuns.id, id ?? ''))
    })

    test('failing threads on one PR end the run partial and keep the other PR', async () => {
        behaviour.open = [
            pr(1, 'feature-a', 'main', '2026-09-05T10:00:00Z'),
            pr(2, 'feature-b', 'feature-a', '2026-09-05T10:00:00Z'),
        ]
        behaviour.threadsFail = new Set(['2'])
        const { run } = await sync()
        expect(run?.status).toBe('partial')
        expect(run?.nextAttemptAt).not.toBeNull()
        const rows = await db.select().from(pullRequests)
        expect(rows.find((row) => row.number === 2)?.threadsErrorCode).toBe('invalid_response')
        expect(rows.find((row) => row.number === 1)?.threadsErrorCode).toBeNull()
        behaviour.threadsFail = new Set()
    })

    test('a PR that left the open list is archived with its real state', async () => {
        behaviour.open = [pr(1, 'feature-a', 'main', '2026-09-06T10:00:00Z')]
        await sync()
        const closed = (await db.select().from(pullRequests)).find((row) => row.number === 2)
        expect(closed?.state).toBe('merged')
        expect(closed?.closedAt).toBe('2026-09-03T10:00:00.000Z')
    })

    test('a long rate limit parks the run as partial instead of blocking', async () => {
        behaviour.listError = 'rate_limited'
        const { run, repo } = await sync()
        expect(run?.status).toBe('partial')
        expect(run?.errorCode).toBe('rate_limited')
        expect(repo?.status).toBe('active')
        behaviour.listError = null
    })

    test('lost access disconnects the repository with a 30 day purge date', async () => {
        behaviour.listError = 'access_lost'
        const { run, repo } = await sync()
        expect(run?.status).toBe('failed')
        expect(repo?.status).toBe('disconnected')
        const days = (Date.parse(repo?.purgeAfter ?? '') - Date.parse(repo?.disconnectedAt ?? '')) / 86_400_000
        expect(days).toBe(30)
        const next = await sync()
        expect(next.run?.status).toBe('failed')
        expect((await db.select().from(pullRequests)).length).toBeGreaterThan(0)
    })
})
