import { and, eq, lt } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { repositories } from '@/server/db/board-schema'
import type { ID } from '@/store/semantic'

/**
 * @name deleteRepository
 * @description Permanently deletes a repository of a workspace with all its PRs, threads, comments, notes, links,
 * diffs and sync runs (through foreign-key cascades). Returns whether a row was deleted.
 *
 * @example
 * await deleteRepository(workspace.id, repositoryId)
 */
export async function deleteRepository(organizationId: ID, id: ID) {
    const deleted = await db
        .delete(repositories)
        .where(and(eq(repositories.id, id), eq(repositories.organizationId, organizationId)))
        .returning({ id: repositories.id })
    return deleted.length > 0
}

/**
 * @name purgeExpiredRepositories
 * @description Deletes every disconnected repository whose retention deadline has passed. Runs from the cron.
 *
 * @example
 * const purged = await purgeExpiredRepositories()
 */
export async function purgeExpiredRepositories() {
    const deleted = await db
        .delete(repositories)
        .where(and(eq(repositories.status, 'disconnected'), lt(repositories.purgeAfter, new Date().toISOString())))
        .returning({ id: repositories.id })
    return deleted.length
}
