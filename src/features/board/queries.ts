import { and, desc, eq, gte, inArray, ne } from 'drizzle-orm'

import type {
    Board,
    BoardView,
    Link,
    Member,
    Note,
    PullRequest,
    PullRequestGroup,
    PullRequestID,
    RepositorySummary,
    ReviewData,
    ReviewThread,
    ThreadStatus,
    Viewer,
} from '@/features/board/types'
import { member, user } from '@/server/db/auth-schema'
import {
    comments,
    groupMembers,
    groups,
    links,
    notes,
    pullRequestReads,
    pullRequests,
    repositories,
    reviewers,
    syncRuns,
    threads,
} from '@/server/db/board-schema'
import { db } from '@/server/db/client'
import type { ID } from '@/store/semantic'

export const ARCHIVE_LIMIT = 200

type BoardOptions = {
    view: BoardView
    filter: ID[]
    mine: boolean
}

type ThreadRow = typeof threads.$inferSelect
type CommentRow = typeof comments.$inferSelect

function threadStatus(thread: ThreadRow, messages: CommentRow[]): ThreadStatus {
    if (thread.providerStatus === 'resolved' || thread.resolvedAt) return 'resolved'
    const starter = messages[0]
    const last = messages.at(-1)
    if (!starter || !last) return 'open'
    if (last.authorName !== starter.authorName) return 'recheck'
    return thread.changedAt && thread.changedAt > last.postedAt ? 'recheck' : 'open'
}

function toThread(thread: ThreadRow, messages: CommentRow[], names: Map<ID, string>): ReviewThread {
    const starter = messages[0]
    return {
        id: thread.id,
        origin: thread.origin,
        who: starter?.authorName ?? 'Onbekend',
        path: thread.path,
        line: thread.line,
        lineFrom: thread.lineFrom,
        created: starter?.postedAt ?? thread.createdAt,
        status: threadStatus(thread, messages),
        changed: thread.changedCommit,
        changedAt: thread.changedAt,
        replied: messages.some((message) => message.authorName !== starter?.authorName),
        url: thread.url,
        resolvedBy: thread.resolvedBy ? (names.get(thread.resolvedBy) ?? null) : null,
        messages: messages.map((message) => ({
            id: message.id,
            who: message.authorName,
            authorId: message.authorId,
            origin: message.origin,
            at: message.postedAt,
            text: message.body,
        })),
    }
}

function steps(visible: Set<PullRequestID>, list: Link[]) {
    const outgoing = new Map<PullRequestID, PullRequestID[]>()
    const incoming = new Map<PullRequestID, number>()
    for (const link of list) {
        if (!visible.has(link.fromId) || !visible.has(link.toId)) continue
        outgoing.set(link.fromId, [...(outgoing.get(link.fromId) ?? []), link.toId])
        incoming.set(link.toId, (incoming.get(link.toId) ?? 0) + 1)
    }
    const result = new Map<PullRequestID, number>()
    for (const start of outgoing.keys()) {
        if (incoming.has(start)) continue
        let current: PullRequestID | undefined = start
        for (let step = 1; current && !result.has(current); step++) {
            result.set(current, step)
            const next: PullRequestID[] = outgoing.get(current) ?? []
            current = next.length === 1 ? next[0] : undefined
        }
    }
    return result
}

function isWaitingOn(viewer: Viewer, pr: PullRequest, list: ReviewThread[], reviewerNames: string[]) {
    const name = viewer.name.toLowerCase()
    const reviewing = reviewerNames.some((reviewer) => reviewer.toLowerCase() === name)
    if (pr.author.toLowerCase() === name) return list.some((thread) => thread.status === 'open')
    if (!reviewing) return false
    return pr.review === 'pending' || list.some((thread) => thread.status === 'recheck')
}

/**
 * @name loadMembers
 * @description Lists the members of a workspace with their role, for mentions, attribution and settings.
 *
 * @example
 * const members = await loadMembers(workspace.id)
 */
export async function loadMembers(organizationId: ID): Promise<Member[]> {
    const rows = await db
        .select({ id: user.id, name: user.name, email: user.email, role: member.role, joinedAt: member.createdAt })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(eq(member.organizationId, organizationId))
    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role === 'owner' || row.role === 'admin' ? row.role : 'member',
    }))
}

/**
 * @name loadRepositories
 * @description Lists the repositories of a workspace with their latest sync run. Plain members never see
 * disconnected repositories; owners and admins do, read-only, until the purge deadline.
 *
 * @example
 * const repos = await loadRepositories(workspace.id, viewer.role)
 */
export async function loadRepositories(organizationId: ID, role: Viewer['role']): Promise<RepositorySummary[]> {
    const rows = await db
        .select()
        .from(repositories)
        .where(
            and(
                eq(repositories.organizationId, organizationId),
                role === 'member' ? ne(repositories.status, 'disconnected') : undefined,
            ),
        )
        .orderBy(repositories.slug)
    if (rows.length === 0) return []
    const runs = await db
        .select()
        .from(syncRuns)
        .where(
            inArray(
                syncRuns.repositoryId,
                rows.map((row) => row.id),
            ),
        )
        .orderBy(desc(syncRuns.createdAt))
        .limit(rows.length * 5)
    return rows.map((row) => {
        const run = runs.find((candidate) => candidate.repositoryId === row.id && !candidate.pullRequestExternalId)
        return {
            id: row.id,
            slug: row.slug,
            name: row.name,
            url: row.url,
            provider: row.provider,
            status: row.status,
            lastSyncedAt: row.lastSyncedAt,
            lastErrorCode: row.lastErrorCode,
            purgeAfter: row.purgeAfter,
            sync: run
                ? {
                      status: run.status,
                      phase: run.phase,
                      errorCode: run.errorCode,
                      reference: run.correlationId.slice(0, 8),
                  }
                : null,
        }
    })
}

/**
 * @name loadBoard
 * @description Builds the combined board of a workspace for one viewer from the database: repositories with their
 * sync state, PRs of the active or archive view (optionally filtered by repository or to PRs waiting on the viewer),
 * groups, arrows, review threads with derived turn state, notes and unread counts. Never calls a provider.
 *
 * @example
 * const board = await loadBoard(workspace, viewer, { view: 'active', filter: [], mine: false })
 */
export async function loadBoard(workspace: Board['workspace'], viewer: Viewer, options: BoardOptions): Promise<Board> {
    const [allRepositories, members] = await Promise.all([
        loadRepositories(workspace.id, viewer.role),
        loadMembers(workspace.id),
    ])
    const shown = allRepositories.filter((repo) => options.filter.length === 0 || options.filter.includes(repo.id))
    const byRepo = new Map(shown.map((repo) => [repo.id, repo]))
    const empty: Board = {
        workspace,
        viewer,
        view: options.view,
        filter: options.filter,
        mine: options.mine,
        repositories: allRepositories,
        members,
        prs: [],
        groups: [],
        links: [],
        review: { threads: {}, review: {}, fixes: {} },
        notes: [],
    }
    if (shown.length === 0) return empty

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const prRows = await db
        .select()
        .from(pullRequests)
        .where(
            and(
                inArray(pullRequests.repositoryId, [...byRepo.keys()]),
                options.view === 'active' ? eq(pullRequests.state, 'open') : ne(pullRequests.state, 'open'),
                options.view === 'archive' ? gte(pullRequests.closedAt, since) : undefined,
            ),
        )
        .orderBy(desc(options.view === 'active' ? pullRequests.providerUpdatedAt : pullRequests.closedAt))
        .limit(options.view === 'active' ? 1000 : ARCHIVE_LIMIT)
    if (prRows.length === 0) return empty
    const prIds = prRows.map((row) => row.id)

    const [reviewerRows, threadRows, noteRows, groupRows, memberRows, linkRows, readRows, joined] = await Promise.all([
        db.select().from(reviewers).where(inArray(reviewers.pullRequestId, prIds)),
        db.select().from(threads).where(inArray(threads.pullRequestId, prIds)),
        db.select().from(notes).where(eq(notes.organizationId, workspace.id)),
        db.select().from(groups).where(eq(groups.organizationId, workspace.id)).orderBy(groups.position),
        db.select().from(groupMembers).where(inArray(groupMembers.pullRequestId, prIds)).orderBy(groupMembers.position),
        db
            .select()
            .from(links)
            .where(and(inArray(links.fromId, prIds), eq(links.hidden, false))),
        db
            .select()
            .from(pullRequestReads)
            .where(and(eq(pullRequestReads.userId, viewer.id), inArray(pullRequestReads.pullRequestId, prIds))),
        db
            .select({ at: member.createdAt })
            .from(member)
            .where(and(eq(member.userId, viewer.id), eq(member.organizationId, workspace.id))),
    ])
    const commentRows =
        threadRows.length === 0
            ? []
            : await db
                  .select()
                  .from(comments)
                  .where(
                      inArray(
                          comments.threadId,
                          threadRows.map((thread) => thread.id),
                      ),
                  )
                  .orderBy(comments.postedAt)

    const names = new Map(members.map((entry) => [entry.id, entry.name]))
    const commentsByThread = Map.groupBy(
        commentRows.filter((row) => !row.deletedAt),
        (row) => row.threadId,
    )
    const review: ReviewData = { threads: {}, review: {}, fixes: {} }
    const lastCommentByPr = new Map<PullRequestID, CommentRow[]>()
    for (const thread of threadRows) {
        const messages = commentsByThread.get(thread.id) ?? []
        if (messages.length === 0) continue
        review.threads[thread.pullRequestId] = [
            ...(review.threads[thread.pullRequestId] ?? []),
            toThread(thread, messages, names),
        ]
        if (thread.fix) review.fixes[thread.id] = thread.fix
        lastCommentByPr.set(thread.pullRequestId, [...(lastCommentByPr.get(thread.pullRequestId) ?? []), ...messages])
    }
    const reviewersByPr = Map.groupBy(reviewerRows, (row) => row.pullRequestId)
    for (const [prId, list] of reviewersByPr) {
        const verdict =
            list.find((row) => row.state === 'changes_requested') ?? list.find((row) => row.state) ?? list[0]
        if (verdict) review.review[prId] = { who: verdict.name, state: verdict.state }
    }

    const baseline = joined[0]?.at.toISOString() ?? new Date(0).toISOString()
    const readAt = new Map(readRows.map((row) => [row.pullRequestId, row.lastReadAt]))
    const allLinks: Link[] = linkRows.map((row) => ({
        id: row.id,
        fromId: row.fromId,
        toId: row.toId,
        label: row.label,
        origin: row.origin,
    }))
    const stepOf = steps(new Set(prIds), allLinks)

    let prs: PullRequest[] = prRows.map((row) => {
        const repo = byRepo.get(row.repositoryId)
        const since = readAt.get(row.id) ?? baseline
        return {
            id: row.id,
            repositoryId: row.repositoryId,
            repository: repo?.slug ?? '',
            provider: repo?.provider ?? 'snapshot',
            number: row.number,
            url: row.url,
            step: stepOf.get(row.id) ?? null,
            ticket: row.ticketKey ? { key: row.ticketKey, old: row.ticketOld } : null,
            title: row.title,
            base: row.targetBranch,
            source: row.sourceBranch,
            add: row.additions,
            rem: row.deletions,
            files: row.files,
            env: row.environment ?? { kind: 'none' },
            pipeline: row.pipeline,
            draft: row.draft,
            author: row.author,
            reviewer: reviewersByPr.get(row.id)?.[0]?.name ?? null,
            review: row.review,
            state: row.state,
            updatedAt: row.providerUpdatedAt,
            closedAt: row.closedAt,
            threadsError: row.threadsErrorCode,
            unread: (lastCommentByPr.get(row.id) ?? []).filter(
                (comment) => comment.postedAt > since && comment.authorId !== viewer.id,
            ).length,
            readOnly: repo?.status === 'disconnected',
        }
    })
    if (options.mine)
        prs = prs.filter((pr) =>
            isWaitingOn(
                viewer,
                pr,
                review.threads[pr.id] ?? [],
                (reviewersByPr.get(pr.id) ?? []).map((row) => row.name),
            ),
        )
    const visible = new Set(prs.map((pr) => pr.id))

    const placed = new Set<PullRequestID>()
    const boardGroups: PullRequestGroup[] = []
    if (options.view === 'active') {
        for (const group of groupRows) {
            const ids = memberRows
                .filter((row) => row.groupId === group.id && visible.has(row.pullRequestId))
                .map((row) => row.pullRequestId)
            ids.forEach((id) => placed.add(id))
            boardGroups.push({
                id: group.id,
                kind: 'custom',
                title: group.title,
                description: group.description,
                prs: ids,
            })
        }
        const rest = prs.filter((pr) => !placed.has(pr.id))
        boardGroups.push({
            id: 'open',
            kind: 'open',
            title: 'Open pull requests',
            description: null,
            prs: rest.filter((pr) => !pr.draft).map((pr) => pr.id),
        })
        boardGroups.push({
            id: 'drafts',
            kind: 'drafts',
            title: 'Drafts',
            description: null,
            prs: rest.filter((pr) => pr.draft).map((pr) => pr.id),
        })
    } else
        boardGroups.push({
            id: 'archive',
            kind: 'archive',
            title: 'Gemerged en gesloten, laatste 30 dagen',
            description: null,
            prs: prs.map((pr) => pr.id),
        })

    const boardNotes: Note[] = noteRows.flatMap((row) => {
        const key = row.pullRequestId ? `pr:${row.pullRequestId}` : row.groupId ? `group:${row.groupId}` : null
        if (!key) return []
        return [
            {
                id: key,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
                text: row.text,
                priority: row.priority,
                effort: row.effort,
                updatedBy: row.updatedBy ? (names.get(row.updatedBy) ?? null) : null,
            },
        ]
    })

    return {
        ...empty,
        prs,
        groups: boardGroups.filter((group) => group.kind === 'custom' || group.prs.length > 0),
        links: allLinks.filter((link) => visible.has(link.fromId) && visible.has(link.toId)),
        review,
        notes: boardNotes,
    }
}
