'use server'

import { and, eq, max } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { z } from 'zod'

import { mentionedMembers } from '@/features/board/mentions'
import { loadMembers } from '@/features/board/queries'
import { commentBodySchema, notePatchSchema } from '@/features/board/schema'
import type { DiffFile, Note } from '@/features/board/types'
import { getAdapter } from '@/features/providers/registry'
import { candidateTokens } from '@/features/sync/tokens'
import { appError, toPublicError, type ActionResult } from '@/shared/errors/result'
import { logError } from '@/server/errors/log'
import { withRetry } from '@/server/errors/retry'
import { currentActor, denied, readablePullRequest, writablePullRequest, writableThread } from '@/server/guard'
import {
    comments,
    diffCache,
    groupMembers,
    groups,
    links,
    notes,
    notifications,
    pullRequestReads,
    threads,
} from '@/server/db/board-schema'
import { db } from '@/server/db/client'

const idSchema = z.string().min(1).max(64)
const noteKeySchema = z.string().regex(/^(pr|group):[\w-]+$/)

function done(): ActionResult<null> {
    return { ok: true, value: null }
}

export async function saveNoteAction(
    key: string,
    patch: z.input<typeof notePatchSchema>,
): Promise<ActionResult<Note | null>> {
    const parsedKey = noteKeySchema.safeParse(key)
    const parsedPatch = notePatchSchema.safeParse(patch)
    if (!parsedKey.success || !parsedPatch.success) return denied('invalid_input')
    const actor = await currentActor()
    if (!actor) return denied('forbidden')
    const [kind, id = ''] = parsedKey.data.split(':')
    if (kind === 'pr' && !(await writablePullRequest(actor, id))) return denied('forbidden', actor.correlationId)
    if (kind === 'group') {
        const [group] = await db
            .select()
            .from(groups)
            .where(and(eq(groups.id, id), eq(groups.organizationId, actor.workspace.id)))
        if (!group) return denied('forbidden', actor.correlationId)
    }
    const target = kind === 'pr' ? eq(notes.pullRequestId, id) : eq(notes.groupId, id)
    const [current] = await db
        .select()
        .from(notes)
        .where(and(eq(notes.organizationId, actor.workspace.id), target))
    const next = {
        text: (parsedPatch.data.text === undefined ? current?.text : parsedPatch.data.text?.trim()) || null,
        priority: parsedPatch.data.priority === undefined ? (current?.priority ?? null) : parsedPatch.data.priority,
        effort: parsedPatch.data.effort === undefined ? (current?.effort ?? null) : parsedPatch.data.effort,
        updatedBy: actor.viewer.id,
    }
    if (!next.text && !next.priority && !next.effort) {
        if (current) await db.delete(notes).where(eq(notes.id, current.id))
        refresh()
        return { ok: true, value: null }
    }
    const [saved] = current
        ? await db.update(notes).set(next).where(eq(notes.id, current.id)).returning()
        : await db
              .insert(notes)
              .values({
                  organizationId: actor.workspace.id,
                  pullRequestId: kind === 'pr' ? id : null,
                  groupId: kind === 'group' ? id : null,
                  ...next,
              })
              .returning()
    if (!saved) return denied('unknown', actor.correlationId)
    return {
        ok: true,
        value: {
            id: parsedKey.data,
            createdAt: saved.createdAt,
            updatedAt: saved.updatedAt,
            text: saved.text,
            priority: saved.priority,
            effort: saved.effort,
            updatedBy: actor.viewer.name,
        },
    }
}

export async function loadDiffAction(prId: string): Promise<ActionResult<DiffFile[]>> {
    const actor = await currentActor()
    if (!actor || !idSchema.safeParse(prId).success) return denied('forbidden')
    const row = await readablePullRequest(actor, prId)
    if (!row) return denied('forbidden', actor.correlationId)
    const commit = row.pr.headCommit ?? `updated:${row.pr.providerUpdatedAt}`
    const [cached] = await db
        .select()
        .from(diffCache)
        .where(and(eq(diffCache.pullRequestId, prId), eq(diffCache.commit, commit)))
    if (cached?.status === 'ok' && cached.files) return { ok: true, value: JSON.parse(cached.files) }
    if (cached?.status === 'failed') return denied(cached.errorCode ?? 'invalid_diff', actor.correlationId)
    if (row.repository.status === 'disconnected') return denied('access_lost', actor.correlationId)
    const adapter = getAdapter(row.repository.provider)
    if (!adapter) return denied('unknown', actor.correlationId)
    const context = { correlationId: actor.correlationId, provider: row.repository.provider, pullRequestId: prId }
    let lastError = appError('auth_revoked', 'no member token', context)
    for await (const candidate of candidateTokens(row.repository)) {
        const result = await withRetry(
            () =>
                adapter.getDiff(
                    {
                        correlationId: actor.correlationId,
                        token: candidate.token,
                        scheme: candidate.scheme,
                        repository: { slug: row.repository.slug, externalId: row.repository.externalId },
                        signal: AbortSignal.timeout(40_000),
                    },
                    row.pr.externalId,
                    row.pr.headCommit,
                ),
            { maxWaitMs: 5_000 },
        )
        if (result.ok) {
            await db
                .insert(diffCache)
                .values({ pullRequestId: prId, commit, status: 'ok', files: JSON.stringify(result.value) })
                .onConflictDoUpdate({
                    target: [diffCache.pullRequestId, diffCache.commit],
                    set: { status: 'ok', files: JSON.stringify(result.value), errorCode: null },
                })
            return { ok: true, value: result.value }
        }
        lastError = { ...result.error, context: { ...result.error.context, ...context } }
        if (result.error.code !== 'access_lost' && result.error.code !== 'auth_expired') break
    }
    logError(lastError, 'diff.load')
    if (lastError.code === 'invalid_diff')
        await db
            .insert(diffCache)
            .values({ pullRequestId: prId, commit, status: 'failed', errorCode: 'invalid_diff' })
            .onConflictDoNothing()
    return { ok: false, error: toPublicError(lastError) }
}

async function notifyMentions(
    actor: NonNullable<Awaited<ReturnType<typeof currentActor>>>,
    body: string,
    pullRequestId: string,
    commentId: string,
) {
    const mentioned = mentionedMembers(body, await loadMembers(actor.workspace.id), actor.viewer.id)
    if (mentioned.length === 0) return
    await db.insert(notifications).values(
        mentioned.map((member) => ({
            organizationId: actor.workspace.id,
            userId: member.id,
            actorId: actor.viewer.id,
            kind: 'mention' as const,
            pullRequestId,
            commentId,
        })),
    )
}

export async function addCommentAction(threadId: string, body: string): Promise<ActionResult<null>> {
    const text = commentBodySchema.safeParse(body)
    if (!text.success || !idSchema.safeParse(threadId).success) return denied('invalid_input')
    const actor = await currentActor()
    if (!actor) return denied('forbidden')
    const target = await writableThread(actor, threadId)
    if (!target) return denied('forbidden', actor.correlationId)
    const [comment] = await db
        .insert(comments)
        .values({
            threadId,
            origin: 'board',
            authorId: actor.viewer.id,
            authorName: actor.viewer.name,
            body: text.data,
            postedAt: new Date().toISOString(),
        })
        .returning({ id: comments.id })
    if (target.thread.resolvedAt)
        await db.update(threads).set({ resolvedAt: null, resolvedBy: null }).where(eq(threads.id, threadId))
    if (comment) await notifyMentions(actor, text.data, target.pr.id, comment.id)
    refresh()
    return done()
}

const startSchema = z.object({
    prId: idSchema,
    path: z.string().max(1000).nullable(),
    line: z.number().int().positive().nullable(),
    body: commentBodySchema,
})

export async function startThreadAction(input: z.input<typeof startSchema>): Promise<ActionResult<null>> {
    const parsed = startSchema.safeParse(input)
    if (!parsed.success) return denied('invalid_input')
    const actor = await currentActor()
    if (!actor) return denied('forbidden')
    const row = await writablePullRequest(actor, parsed.data.prId)
    if (!row) return denied('forbidden', actor.correlationId)
    const [thread] = await db
        .insert(threads)
        .values({
            pullRequestId: row.pr.id,
            origin: 'board',
            path: parsed.data.path,
            line: parsed.data.line,
            commit: row.pr.headCommit,
            createdBy: actor.viewer.id,
        })
        .returning({ id: threads.id })
    if (!thread) return denied('unknown', actor.correlationId)
    const [comment] = await db
        .insert(comments)
        .values({
            threadId: thread.id,
            origin: 'board',
            authorId: actor.viewer.id,
            authorName: actor.viewer.name,
            body: parsed.data.body,
            postedAt: new Date().toISOString(),
        })
        .returning({ id: comments.id })
    if (comment) await notifyMentions(actor, parsed.data.body, row.pr.id, comment.id)
    refresh()
    return done()
}

export async function resolveThreadAction(threadId: string, resolved: boolean): Promise<ActionResult<null>> {
    const actor = await currentActor()
    if (!actor || !idSchema.safeParse(threadId).success) return denied('forbidden')
    const target = await writableThread(actor, threadId)
    if (!target) return denied('forbidden', actor.correlationId)
    await db
        .update(threads)
        .set(
            resolved
                ? { resolvedAt: new Date().toISOString(), resolvedBy: actor.viewer.id }
                : { resolvedAt: null, resolvedBy: null },
        )
        .where(eq(threads.id, threadId))
    refresh()
    return done()
}

export async function markReadAction(prId: string): Promise<ActionResult<null>> {
    const actor = await currentActor()
    if (!actor || !idSchema.safeParse(prId).success) return denied('forbidden')
    if (!(await readablePullRequest(actor, prId))) return denied('forbidden', actor.correlationId)
    const now = new Date().toISOString()
    await db
        .insert(pullRequestReads)
        .values({ userId: actor.viewer.id, pullRequestId: prId, lastReadAt: now })
        .onConflictDoUpdate({
            target: [pullRequestReads.userId, pullRequestReads.pullRequestId],
            set: { lastReadAt: now },
        })
    await db
        .update(notifications)
        .set({ readAt: now })
        .where(and(eq(notifications.userId, actor.viewer.id), eq(notifications.pullRequestId, prId)))
    return done()
}

export async function addLinkAction(fromId: string, toId: string, label: string | null): Promise<ActionResult<null>> {
    const actor = await currentActor()
    if (!actor || !idSchema.safeParse(fromId).success || !idSchema.safeParse(toId).success || fromId === toId)
        return denied('invalid_input')
    if (!(await writablePullRequest(actor, fromId)) || !(await writablePullRequest(actor, toId)))
        return denied('forbidden', actor.correlationId)
    const cleanLabel = label?.trim().slice(0, 80) || null
    await db
        .insert(links)
        .values({ fromId, toId, label: cleanLabel, origin: 'manual', createdBy: actor.viewer.id })
        .onConflictDoUpdate({ target: [links.fromId, links.toId], set: { hidden: false, label: cleanLabel } })
    refresh()
    return done()
}

export async function removeLinkAction(linkId: string): Promise<ActionResult<null>> {
    const actor = await currentActor()
    if (!actor || !idSchema.safeParse(linkId).success) return denied('forbidden')
    const [link] = await db.select().from(links).where(eq(links.id, linkId))
    if (!link || !(await writablePullRequest(actor, link.fromId))) return denied('forbidden', actor.correlationId)
    if (link.origin === 'derived') await db.update(links).set({ hidden: true }).where(eq(links.id, linkId))
    else await db.delete(links).where(eq(links.id, linkId))
    refresh()
    return done()
}

export async function createGroupAction(title: string): Promise<ActionResult<null>> {
    const parsed = z.string().trim().min(1).max(80).safeParse(title)
    const actor = await currentActor()
    if (!actor || !parsed.success) return denied('invalid_input')
    const [last] = await db
        .select({ position: max(groups.position) })
        .from(groups)
        .where(eq(groups.organizationId, actor.workspace.id))
    await db
        .insert(groups)
        .values({ organizationId: actor.workspace.id, title: parsed.data, position: (last?.position ?? 0) + 1 })
    refresh()
    return done()
}

export async function updateGroupAction(
    groupId: string,
    title: string,
    description: string | null,
): Promise<ActionResult<null>> {
    const parsed = z.string().trim().min(1).max(80).safeParse(title)
    const actor = await currentActor()
    if (!actor || !parsed.success) return denied('invalid_input')
    await db
        .update(groups)
        .set({ title: parsed.data, description: description?.trim().slice(0, 500) || null })
        .where(and(eq(groups.id, groupId), eq(groups.organizationId, actor.workspace.id)))
    refresh()
    return done()
}

export async function deleteGroupAction(groupId: string): Promise<ActionResult<null>> {
    const actor = await currentActor()
    if (!actor) return denied('forbidden')
    await db.delete(groups).where(and(eq(groups.id, groupId), eq(groups.organizationId, actor.workspace.id)))
    refresh()
    return done()
}

export async function setGroupAction(prId: string, groupId: string | null): Promise<ActionResult<null>> {
    const actor = await currentActor()
    if (!actor) return denied('forbidden')
    if (!(await writablePullRequest(actor, prId))) return denied('forbidden', actor.correlationId)
    await db.delete(groupMembers).where(eq(groupMembers.pullRequestId, prId))
    if (groupId) {
        const [group] = await db
            .select()
            .from(groups)
            .where(and(eq(groups.id, groupId), eq(groups.organizationId, actor.workspace.id)))
        if (!group) return denied('forbidden', actor.correlationId)
        const [last] = await db
            .select({ position: max(groupMembers.position) })
            .from(groupMembers)
            .where(eq(groupMembers.groupId, groupId))
        await db.insert(groupMembers).values({ groupId, pullRequestId: prId, position: (last?.position ?? 0) + 1 })
    }
    refresh()
    return done()
}

export async function moveInGroupAction(prId: string, direction: -1 | 1): Promise<ActionResult<null>> {
    const actor = await currentActor()
    if (!actor || !(await writablePullRequest(actor, prId))) return denied('forbidden')
    const [entry] = await db.select().from(groupMembers).where(eq(groupMembers.pullRequestId, prId))
    if (!entry) return done()
    const siblings = await db
        .select()
        .from(groupMembers)
        .where(eq(groupMembers.groupId, entry.groupId))
        .orderBy(groupMembers.position)
    const index = siblings.findIndex((row) => row.id === entry.id)
    const other = siblings[index + direction]
    if (!other) return done()
    const ordered = siblings.map((row) => row.id)
    ordered[index] = other.id
    ordered[index + direction] = entry.id
    for (const [position, id] of ordered.entries())
        await db.update(groupMembers).set({ position }).where(eq(groupMembers.id, id))
    refresh()
    return done()
}

export async function markNotificationsReadAction(): Promise<ActionResult<null>> {
    const actor = await currentActor()
    if (!actor) return denied('forbidden')
    await db
        .update(notifications)
        .set({ readAt: new Date().toISOString() })
        .where(eq(notifications.userId, actor.viewer.id))
    refresh()
    return done()
}
