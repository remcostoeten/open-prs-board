import { and, eq } from 'drizzle-orm'

import type { ErrorCode } from '@/shared/errors/codes'
import { appError, toPublicError, type ActionResult } from '@/shared/errors/result'
import { pullRequests, repositories, threads } from '@/server/db/board-schema'
import { db } from '@/server/db/client'
import { findWorkspace, getViewer, isManager, type Viewer, type Workspace } from '@/server/session'
import type { ID } from '@/store/semantic'

export type Actor = {
    viewer: Viewer
    workspace: Workspace
    correlationId: ID
}

/**
 * @name denied
 * @description Builds a failed action result with the public message for an error code.
 *
 * @example
 * return denied('forbidden', correlationId)
 */
export function denied<Value>(code: ErrorCode, correlationId?: ID): ActionResult<Value> {
    return { ok: false, error: toPublicError(appError(code, code, { correlationId })) }
}

/**
 * @name currentActor
 * @description Resolves the signed-in user and their active workspace for a server action, with a fresh
 * correlation ID. Returns null when either is missing.
 *
 * @example
 * const actor = await currentActor()
 * if (!actor) return denied('forbidden')
 */
export async function currentActor(): Promise<Actor | null> {
    const viewer = await getViewer()
    if (!viewer) return null
    const workspace = await findWorkspace(viewer.id)
    if (!workspace) return null
    return { viewer, workspace, correlationId: crypto.randomUUID() }
}

/**
 * @name managerActor
 * @description Like `currentActor`, but only for owners and admins.
 *
 * @example
 * const actor = await managerActor()
 */
export async function managerActor(): Promise<Actor | null> {
    const actor = await currentActor()
    return actor && isManager(actor.workspace.role) ? actor : null
}

/**
 * @name writablePullRequest
 * @description Loads a PR that belongs to the actor's workspace and whose repository still accepts writes. Returns
 * null for a PR of another workspace or of a disconnected repository.
 *
 * @example
 * const pr = await writablePullRequest(actor, prId)
 */
export async function writablePullRequest(actor: Actor, id: ID) {
    const [row] = await db
        .select({ pr: pullRequests, repository: repositories })
        .from(pullRequests)
        .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
        .where(and(eq(pullRequests.id, id), eq(repositories.organizationId, actor.workspace.id)))
    if (!row || row.repository.status === 'disconnected') return null
    return row
}

/**
 * @name readablePullRequest
 * @description Loads a PR of the actor's workspace. Disconnected repositories are readable by owners and admins
 * only.
 *
 * @example
 * const row = await readablePullRequest(actor, prId)
 */
export async function readablePullRequest(actor: Actor, id: ID) {
    const [row] = await db
        .select({ pr: pullRequests, repository: repositories })
        .from(pullRequests)
        .innerJoin(repositories, eq(pullRequests.repositoryId, repositories.id))
        .where(and(eq(pullRequests.id, id), eq(repositories.organizationId, actor.workspace.id)))
    if (!row) return null
    if (row.repository.status === 'disconnected' && !isManager(actor.workspace.role)) return null
    return row
}

/**
 * @name writableThread
 * @description Loads a thread whose PR is writable for the actor.
 *
 * @example
 * const thread = await writableThread(actor, threadId)
 */
export async function writableThread(actor: Actor, id: ID) {
    const [thread] = await db.select().from(threads).where(eq(threads.id, id))
    if (!thread) return null
    const pr = await writablePullRequest(actor, thread.pullRequestId)
    return pr ? { thread, ...pr } : null
}
