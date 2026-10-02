import { purgeExpiredRepositories } from '@/features/sync/purge'
import { dueRuns, enqueueSync, staleRepositories } from '@/features/sync/queue'
import { executeRuns } from '@/features/sync/run'

export const maxDuration = 300

const POLL_INTERVAL_MS = 10 * 60_000
const CRON_BUDGET_MS = 240_000

function authorized(request: Request) {
    const secret = process.env.CRON_SECRET
    return !!secret && request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: Request) {
    if (!authorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
    const correlationId = crypto.randomUUID()
    const purged = await purgeExpiredRepositories()
    const stale = await staleRepositories(POLL_INTERVAL_MS)
    const byWorkspace = Map.groupBy(stale, (repository) => repository.organizationId)
    for (const [organizationId, list] of byWorkspace)
        await enqueueSync(
            organizationId,
            list.map((repository) => repository.id),
            'cron',
            correlationId,
        )
    const runs = await dueRuns()
    await executeRuns(runs, CRON_BUDGET_MS / Math.max(1, Math.ceil(runs.length / 2)))
    return Response.json({ correlationId, purged, runs: runs.length })
}
