import { and, eq, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm'

import type { SyncTrigger } from '@/features/sync/types'
import { db } from '@/server/db/client'
import { repositories, syncRuns } from '@/server/db/board-schema'
import type { ID, Nullable } from '@/store/semantic'

export const LEASE_MS = 90_000

export type SyncRun = typeof syncRuns.$inferSelect

function isoIn(ms: number) {
    return new Date(Date.now() + ms).toISOString()
}

/**
 * @name enqueueSync
 * @description Queues one sync run per repository under a shared correlation ID. A repository that already has a
 * queued or live running run keeps that run instead of getting a second one, so double clicks and repeated
 * webhooks do not stack work. Returns the ids of the runs to execute.
 *
 * @example
 * const runs = await enqueueSync(workspace.id, ids, 'onboarding', crypto.randomUUID())
 */
export async function enqueueSync(
    organizationId: ID,
    repositoryIds: ID[],
    trigger: SyncTrigger,
    correlationId: ID,
    pullRequestExternalId: Nullable<string> = null,
) {
    if (repositoryIds.length === 0) return []
    const now = new Date().toISOString()
    const active = await db
        .select({ id: syncRuns.id, repositoryId: syncRuns.repositoryId })
        .from(syncRuns)
        .where(
            and(
                inArray(syncRuns.repositoryId, repositoryIds),
                or(
                    eq(syncRuns.status, 'queued'),
                    and(eq(syncRuns.status, 'running'), sql`${syncRuns.leaseExpiresAt} > ${now}`),
                ),
                pullRequestExternalId
                    ? eq(syncRuns.pullRequestExternalId, pullRequestExternalId)
                    : isNull(syncRuns.pullRequestExternalId),
            ),
        )
    const busy = new Set(active.map((run) => run.repositoryId))
    const fresh = repositoryIds.filter((id) => !busy.has(id))
    const created =
        fresh.length === 0
            ? []
            : await db
                  .insert(syncRuns)
                  .values(
                      fresh.map((repositoryId) => ({
                          organizationId,
                          repositoryId,
                          correlationId,
                          trigger,
                          pullRequestExternalId,
                      })),
                  )
                  .returning({ id: syncRuns.id })
    return [...active.map((run) => run.id), ...created.map((run) => run.id)]
}

/**
 * @name claimRun
 * @description Takes the lease on a run so only one worker executes it: a queued run, a running run whose lease
 * expired, or a partial run whose retry time has come. Returns null when someone else holds it.
 *
 * @example
 * const run = await claimRun(id)
 * if (!run) return
 */
export async function claimRun(id: ID): Promise<SyncRun | null> {
    const now = new Date().toISOString()
    const [run] = await db
        .update(syncRuns)
        .set({
            status: 'running',
            leaseExpiresAt: isoIn(LEASE_MS),
            attempt: sql`${syncRuns.attempt} + 1`,
            startedAt: sql`coalesce(${syncRuns.startedAt}, ${now})`,
            nextAttemptAt: null,
        })
        .where(
            and(
                eq(syncRuns.id, id),
                or(
                    eq(syncRuns.status, 'queued'),
                    and(eq(syncRuns.status, 'running'), lt(syncRuns.leaseExpiresAt, now)),
                    and(eq(syncRuns.status, 'partial'), lte(syncRuns.nextAttemptAt, now)),
                ),
            ),
        )
        .returning()
    return run ?? null
}

/**
 * @name touchRun
 * @description Extends the lease and records the phase a running run is in.
 *
 * @example
 * await touchRun(run.id, 'threads')
 */
export async function touchRun(id: ID, phase: SyncRun['phase']) {
    await db
        .update(syncRuns)
        .set({ phase, leaseExpiresAt: isoIn(LEASE_MS) })
        .where(eq(syncRuns.id, id))
}

/**
 * @name dueRuns
 * @description Lists runs the cron should pick up: queued runs, running runs with an expired lease, and partial
 * runs whose retry time has passed.
 *
 * @example
 * for (const id of await dueRuns()) await executeRun(id, deadline)
 */
export async function dueRuns() {
    const now = new Date().toISOString()
    const rows = await db
        .select({ id: syncRuns.id })
        .from(syncRuns)
        .where(
            or(
                eq(syncRuns.status, 'queued'),
                and(eq(syncRuns.status, 'running'), lt(syncRuns.leaseExpiresAt, now)),
                and(eq(syncRuns.status, 'partial'), lte(syncRuns.nextAttemptAt, now)),
            ),
        )
        .limit(20)
    return rows.map((row) => row.id)
}

/**
 * @name staleRepositories
 * @description Lists active repositories whose last successful sync is older than the polling interval, grouped
 * per workspace, so the cron can queue a poll for them.
 *
 * @example
 * const stale = await staleRepositories(10 * 60_000)
 */
export async function staleRepositories(intervalMs: number) {
    const cutoff = new Date(Date.now() - intervalMs).toISOString()
    return db
        .select({ id: repositories.id, organizationId: repositories.organizationId })
        .from(repositories)
        .where(
            and(
                inArray(repositories.status, ['active', 'error']),
                or(isNull(repositories.lastSyncedAt), lt(repositories.lastSyncedAt, cutoff)),
            ),
        )
}
