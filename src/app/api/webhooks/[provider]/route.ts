import { eq } from 'drizzle-orm'
import { after } from 'next/server'

import { getAdapter } from '@/features/providers/registry'
import { enqueueSync } from '@/features/sync/queue'
import { executeRuns } from '@/features/sync/run'
import { logError } from '@/server/errors/log'
import { db } from '@/server/db/client'
import { repositories } from '@/server/db/board-schema'
import { appError } from '@/shared/errors/result'

export async function POST(request: Request, context: RouteContext<'/api/webhooks/[provider]'>) {
    const { provider } = await context.params
    const correlationId = crypto.randomUUID()
    const repositoryId = new URL(request.url).searchParams.get('repository')
    const adapter = provider === 'bitbucket' || provider === 'github' ? getAdapter(provider) : null
    if (!adapter || !repositoryId) return Response.json({ error: 'not_found' }, { status: 404 })
    const [repository] = await db.select().from(repositories).where(eq(repositories.id, repositoryId))
    if (!repository || repository.provider !== provider) return Response.json({ error: 'not_found' }, { status: 404 })
    const event = await adapter.parseWebhook(request, repository.webhookSecret)
    if (!event.ok) {
        logError({ ...event.error, context: { ...event.error.context, correlationId, repositoryId } }, 'webhook')
        return Response.json({ error: event.error.code }, { status: 401 })
    }
    if (event.value.repositoryExternalId !== repository.externalId || repository.status === 'disconnected')
        return Response.json({ ignored: true }, { status: 202 })
    const runs = await enqueueSync(
        repository.organizationId,
        [repository.id],
        'webhook',
        correlationId,
        event.value.pullRequestExternalId,
    )
    after(async () => {
        try {
            await executeRuns(runs)
        } catch (error) {
            logError(appError('unknown', String(error), { correlationId, repositoryId }), 'webhook.after')
        }
    })
    return Response.json({ accepted: true, correlationId }, { status: 202 })
}
