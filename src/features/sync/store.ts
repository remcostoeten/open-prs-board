import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'

import type { ReviewState } from '@/features/board/types'
import { findTicket } from '@/features/providers/tickets'
import type { SyncedPullRequest, SyncedReviewer, SyncedThread } from '@/features/providers/types'
import { db } from '@/server/db/client'
import { comments, links, pullRequests, reviewers, threads } from '@/server/db/board-schema'
import type { ID } from '@/store/semantic'

export type StoredPullRequest = typeof pullRequests.$inferSelect

function reviewState(list: SyncedReviewer[]): ReviewState {
    if (list.some((reviewer) => reviewer.state === 'changes_requested')) return 'changes_requested'
    if (list.some((reviewer) => reviewer.state === 'approved')) return 'approved'
    return list.length > 0 ? 'pending' : 'none'
}

/**
 * @name upsertPullRequest
 * @description Inserts or updates one synced PR on its repository and number, replaces its reviewers, and returns
 * the stored row. Running it twice with the same input changes nothing.
 *
 * @example
 * const row = await upsertPullRequest(repository.id, synced)
 */
export async function upsertPullRequest(repositoryId: ID, pr: SyncedPullRequest): Promise<StoredPullRequest> {
    const values = {
        externalId: pr.externalId,
        title: pr.title,
        url: pr.url,
        state: pr.state,
        draft: pr.draft,
        author: pr.author,
        sourceBranch: pr.sourceBranch,
        targetBranch: pr.targetBranch,
        headCommit: pr.headCommit,
        additions: pr.additions,
        deletions: pr.deletions,
        files: pr.files,
        pipeline: pr.pipeline,
        review: reviewState(pr.reviewers),
        environment: pr.environment,
        ticketKey: pr.ticket?.key ?? findTicket(pr.sourceBranch, pr.title),
        ticketOld: pr.ticket?.old ?? null,
        providerCreatedAt: pr.createdAt,
        providerUpdatedAt: pr.updatedAt,
        closedAt: pr.closedAt,
    }
    const [row] = await db
        .insert(pullRequests)
        .values({ repositoryId, number: pr.number, ...values })
        .onConflictDoUpdate({ target: [pullRequests.repositoryId, pullRequests.number], set: values })
        .returning()
    if (!row) throw new Error(`upsert of PR ${pr.number} returned no row`)
    await db.delete(reviewers).where(eq(reviewers.pullRequestId, row.id))
    if (pr.reviewers.length > 0)
        await db
            .insert(reviewers)
            .values(
                pr.reviewers.map((reviewer) => ({ pullRequestId: row.id, name: reviewer.name, state: reviewer.state })),
            )
            .onConflictDoNothing()
    return row
}

/**
 * @name closePullRequest
 * @description Records the final state of a PR that left the provider's open list.
 *
 * @example
 * await closePullRequest(row.id, 'merged', synced.closedAt)
 */
export async function closePullRequest(id: ID, state: 'merged' | 'declined', closedAt: string) {
    await db.update(pullRequests).set({ state, closedAt }).where(eq(pullRequests.id, id))
}

/**
 * @name storeThreads
 * @description Upserts provider threads and their comments for one PR and removes provider comments that no
 * longer exist upstream. Board threads and board comments are never touched.
 *
 * @example
 * await storeThreads(row.id, syncedThreads)
 */
export async function storeThreads(pullRequestId: ID, list: SyncedThread[]) {
    for (const thread of list) {
        const values = {
            path: thread.path,
            line: thread.line,
            lineFrom: thread.lineFrom,
            commit: thread.commit,
            changedCommit: thread.changedCommit,
            changedAt: thread.changedAt,
            url: thread.url,
            providerStatus: thread.status,
            fix: thread.fix,
        }
        const [row] = await db
            .insert(threads)
            .values({ pullRequestId, origin: 'provider', externalId: thread.externalId, ...values })
            .onConflictDoUpdate({ target: [threads.pullRequestId, threads.origin, threads.externalId], set: values })
            .returning({ id: threads.id })
        if (!row) continue
        for (const comment of thread.comments) {
            const body = { authorName: comment.author, body: comment.body, postedAt: comment.createdAt }
            await db
                .insert(comments)
                .values({ threadId: row.id, origin: 'provider', externalId: comment.externalId, ...body })
                .onConflictDoUpdate({ target: [comments.threadId, comments.origin, comments.externalId], set: body })
        }
        const kept = thread.comments.map((comment) => comment.externalId)
        await db
            .delete(comments)
            .where(
                and(
                    eq(comments.threadId, row.id),
                    eq(comments.origin, 'provider'),
                    kept.length > 0 ? notInArray(comments.externalId, kept) : sql`1 = 1`,
                ),
            )
    }
    await db
        .update(pullRequests)
        .set({ threadsSyncedAt: new Date().toISOString(), threadsErrorCode: null })
        .where(eq(pullRequests.id, pullRequestId))
}

/**
 * @name deriveLinks
 * @description Rebuilds the derived arrows of a repository from branch targets: when PR B targets the source branch
 * of open PR A, B builds on A. Links a user hid stay hidden, manual links are left alone, and derived links whose
 * branches no longer line up are removed.
 *
 * @example
 * await deriveLinks(repository.id)
 */
export async function deriveLinks(repositoryId: ID) {
    const open = await db
        .select({ id: pullRequests.id, source: pullRequests.sourceBranch, target: pullRequests.targetBranch })
        .from(pullRequests)
        .where(and(eq(pullRequests.repositoryId, repositoryId), eq(pullRequests.state, 'open')))
    const bySource = new Map(open.map((pr) => [pr.source, pr.id]))
    const pairs = open.flatMap((pr) => {
        const base = bySource.get(pr.target)
        return base && base !== pr.id ? [{ fromId: base, toId: pr.id }] : []
    })
    const ids = open.map((pr) => pr.id)
    if (ids.length === 0) return
    const existing = await db
        .select({ id: links.id, fromId: links.fromId, toId: links.toId })
        .from(links)
        .where(and(eq(links.origin, 'derived'), inArray(links.toId, ids)))
    const wanted = new Set(pairs.map((pair) => `${pair.fromId}>${pair.toId}`))
    const stale = existing.filter((link) => !wanted.has(`${link.fromId}>${link.toId}`)).map((link) => link.id)
    if (stale.length > 0) await db.delete(links).where(and(inArray(links.id, stale), eq(links.hidden, false)))
    if (pairs.length > 0)
        await db
            .insert(links)
            .values(pairs.map((pair) => ({ ...pair, origin: 'derived' as const })))
            .onConflictDoNothing()
}
