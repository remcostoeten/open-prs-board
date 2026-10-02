import { aliasedTable, and, desc, eq } from 'drizzle-orm'

import { user } from '@/server/db/auth-schema'
import { notifications, pullRequests } from '@/server/db/board-schema'
import { db } from '@/server/db/client'
import type { ID, Nullable, Timestamp } from '@/store/semantic'

export type NotificationItem = {
    id: ID
    actor: string
    pullRequestId: Nullable<ID>
    title: string
    number: Nullable<number>
    at: Timestamp
    read: boolean
}

/**
 * @name loadNotifications
 * @description Returns the 20 newest notifications of a user in a workspace with the actor's name and the PR title.
 *
 * @example
 * const items = await loadNotifications(viewer.id, workspace.id)
 */
export async function loadNotifications(userId: ID, organizationId: ID): Promise<NotificationItem[]> {
    const actor = aliasedTable(user, 'actor')
    const rows = await db
        .select({
            id: notifications.id,
            actor: actor.name,
            pullRequestId: notifications.pullRequestId,
            title: pullRequests.title,
            number: pullRequests.number,
            at: notifications.createdAt,
            readAt: notifications.readAt,
        })
        .from(notifications)
        .leftJoin(actor, eq(notifications.actorId, actor.id))
        .leftJoin(pullRequests, eq(notifications.pullRequestId, pullRequests.id))
        .where(and(eq(notifications.userId, userId), eq(notifications.organizationId, organizationId)))
        .orderBy(desc(notifications.createdAt))
        .limit(20)
    return rows.map((row) => ({
        id: row.id,
        actor: row.actor ?? 'Iemand',
        pullRequestId: row.pullRequestId,
        title: row.title ?? 'een pull request',
        number: row.number,
        at: row.at,
        read: row.readAt !== null,
    }))
}
