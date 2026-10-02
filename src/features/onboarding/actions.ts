'use server'

import { and, eq, inArray } from 'drizzle-orm'
import { after } from 'next/server'
import { z } from 'zod'

import { getAdapter } from '@/features/providers/registry'
import type { ProviderId, SyncedRepository } from '@/features/providers/types'
import { enqueueSync } from '@/features/sync/queue'
import { executeRuns } from '@/features/sync/run'
import { viewerToken } from '@/features/sync/tokens'
import { appError, toPublicError, type ActionResult } from '@/shared/errors/result'
import { logError } from '@/server/errors/log'
import { withRetry } from '@/server/errors/retry'
import { repositories } from '@/server/db/board-schema'
import { db } from '@/server/db/client'
import { denied, managerActor, type Actor } from '@/server/guard'

export type RepositoryOption = SyncedRepository & { connected: boolean }

const providerSchema = z.enum(['bitbucket', 'github', 'snapshot'])

async function accessible(actor: Actor, provider: ProviderId): Promise<ActionResult<SyncedRepository[]>> {
    const adapter = getAdapter(provider)
    if (!adapter) return denied('not_found', actor.correlationId)
    const token = await viewerToken(actor.viewer.id, provider)
    if (!token.ok) {
        logError(
            { ...token.error, context: { ...token.error.context, correlationId: actor.correlationId } },
            'onboarding.token',
        )
        return {
            ok: false,
            error: toPublicError({
                ...token.error,
                context: { ...token.error.context, correlationId: actor.correlationId },
            }),
        }
    }
    const ctx = {
        correlationId: actor.correlationId,
        token: token.value.token,
        scheme: token.value.scheme,
        repository: { slug: '', externalId: '' },
        signal: AbortSignal.timeout(60_000),
    }
    const result = await withRetry(() => adapter.listRepositories(ctx), { maxWaitMs: 10_000 })
    if (result.ok) return result
    const error = {
        ...result.error,
        context: { ...result.error.context, correlationId: actor.correlationId, provider },
    }
    logError(error, 'onboarding.repositories')
    return { ok: false, error: toPublicError(error) }
}

export async function listRepositoriesAction(provider: string): Promise<ActionResult<RepositoryOption[]>> {
    const actor = await managerActor()
    if (!actor) return denied('forbidden')
    const parsed = providerSchema.safeParse(provider)
    if (!parsed.success) return denied('invalid_input', actor.correlationId)
    const list = await accessible(actor, parsed.data)
    if (!list.ok) return list
    const connected = await db
        .select({ externalId: repositories.externalId })
        .from(repositories)
        .where(and(eq(repositories.organizationId, actor.workspace.id), eq(repositories.provider, parsed.data)))
    const known = new Set(connected.map((row) => row.externalId))
    return { ok: true, value: list.value.map((repo) => ({ ...repo, connected: known.has(repo.externalId) })) }
}

export async function connectRepositoriesAction(provider: string, externalIds: string[]): Promise<ActionResult<null>> {
    const actor = await managerActor()
    if (!actor) return denied('forbidden')
    const parsed = z
        .object({ provider: providerSchema, ids: z.array(z.string().min(1)).min(1).max(100) })
        .safeParse({ provider, ids: externalIds })
    if (!parsed.success) return denied('invalid_input', actor.correlationId)
    const list = await accessible(actor, parsed.data.provider)
    if (!list.ok) return list
    const wanted = new Set(parsed.data.ids)
    const chosen = list.value.filter((repo) => wanted.has(repo.externalId))
    if (chosen.length === 0) return denied('invalid_input', actor.correlationId)
    await db
        .insert(repositories)
        .values(
            chosen.map((repo) => ({
                organizationId: actor.workspace.id,
                provider: parsed.data.provider,
                externalId: repo.externalId,
                slug: repo.slug,
                name: repo.name,
                url: repo.url,
                connectedBy: actor.viewer.id,
            })),
        )
        .onConflictDoNothing()
    const rows = await db
        .select({ id: repositories.id, status: repositories.status })
        .from(repositories)
        .where(
            and(
                eq(repositories.organizationId, actor.workspace.id),
                eq(repositories.provider, parsed.data.provider),
                inArray(
                    repositories.externalId,
                    chosen.map((repo) => repo.externalId),
                ),
            ),
        )
    const runs = await enqueueSync(
        actor.workspace.id,
        rows.filter((row) => row.status !== 'disconnected').map((row) => row.id),
        'onboarding',
        actor.correlationId,
    )
    after(async () => {
        try {
            await executeRuns(runs)
        } catch (error) {
            logError(appError('unknown', String(error), { correlationId: actor.correlationId }), 'onboarding.after')
        }
    })
    return { ok: true, value: null }
}
