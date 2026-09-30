'use server'

import { and, eq } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { after } from 'next/server'

import { getAdapter } from '@/features/providers/registry'
import { deleteRepository } from '@/features/sync/purge'
import { enqueueSync } from '@/features/sync/queue'
import { executeRuns } from '@/features/sync/run'
import { viewerToken } from '@/features/sync/tokens'
import { appError, toPublicError, type ActionResult } from '@/shared/errors/result'
import { logError } from '@/server/errors/log'
import { withRetry } from '@/server/errors/retry'
import { repositories } from '@/server/db/board-schema'
import { db } from '@/server/db/client'
import { currentActor, denied, managerActor } from '@/server/guard'

function runLater(ids: string[], correlationId: string) {
    after(async () => {
        try {
            await executeRuns(ids)
        } catch (error) {
            logError(appError('unknown', String(error), { correlationId }), 'sync.after')
        }
    })
}

async function ownRepository(organizationId: string, id: string) {
    const [row] = await db
        .select()
        .from(repositories)
        .where(and(eq(repositories.id, id), eq(repositories.organizationId, organizationId)))
    return row ?? null
}

export async function syncNowAction(repositoryId: string): Promise<ActionResult<null>> {
    const actor = await currentActor()
    if (!actor) return denied('forbidden')
    const repository = await ownRepository(actor.workspace.id, repositoryId)
    if (!repository || repository.status === 'disconnected') return denied('forbidden', actor.correlationId)
    runLater(await enqueueSync(actor.workspace.id, [repository.id], 'manual', actor.correlationId), actor.correlationId)
    refresh()
    return { ok: true, value: null }
}

export async function reconnectRepositoryAction(repositoryId: string): Promise<ActionResult<null>> {
    const actor = await managerActor()
    if (!actor) return denied('forbidden')
    const repository = await ownRepository(actor.workspace.id, repositoryId)
    const adapter = repository ? getAdapter(repository.provider) : null
    if (!repository || !adapter) return denied('not_found', actor.correlationId)
    const token = await viewerToken(actor.viewer.id, repository.provider)
    const context = { correlationId: actor.correlationId, provider: repository.provider, repositoryId }
    if (!token.ok) return { ok: false, error: toPublicError({ ...token.error, context }) }
    const check = await withRetry(() =>
        adapter.listPullRequests({
            correlationId: actor.correlationId,
            token: token.value.token,
            repository: { slug: repository.slug, externalId: repository.externalId },
            signal: AbortSignal.timeout(30_000),
        }),
    )
    if (!check.ok) {
        const error = { ...check.error, context: { ...check.error.context, ...context } }
        logError(error, 'repository.reconnect')
        return { ok: false, error: toPublicError(error) }
    }
    await db
        .update(repositories)
        .set({
            status: 'active',
            connectedBy: actor.viewer.id,
            disconnectedAt: null,
            purgeAfter: null,
            lastErrorCode: null,
        })
        .where(eq(repositories.id, repository.id))
    runLater(await enqueueSync(actor.workspace.id, [repository.id], 'manual', actor.correlationId), actor.correlationId)
    refresh()
    return { ok: true, value: null }
}

export async function deleteRepositoryAction(repositoryId: string, confirmation: string): Promise<ActionResult<null>> {
    const actor = await managerActor()
    if (!actor) return denied('forbidden')
    const repository = await ownRepository(actor.workspace.id, repositoryId)
    if (!repository) return denied('not_found', actor.correlationId)
    if (confirmation.trim() !== repository.slug)
        return {
            ok: false,
            error: {
                code: 'invalid_input',
                message: `Typ ${repository.slug} om te bevestigen.`,
                recovery: 'none',
                reference: null,
            },
        }
    await deleteRepository(actor.workspace.id, repository.id)
    refresh()
    return { ok: true, value: null }
}
