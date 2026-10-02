import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { and, eq } from 'drizzle-orm'

import { datasetDir } from '@/features/providers/snapshot/adapter'
import { snapshotBoardSchema, snapshotNotesSchema } from '@/features/providers/snapshot/schema'
import type { ExternalID } from '@/features/providers/types'
import { enqueueSync } from '@/features/sync/queue'
import { executeRun } from '@/features/sync/run'
import { member } from '@/server/db/auth-schema'
import { groupMembers, groups, links, notes, pullRequests, repositories } from '@/server/db/board-schema'
import { db } from '@/server/db/client'
import type { ID } from '@/store/semantic'

async function readJson(externalId: ExternalID, name: string) {
    return JSON.parse(await readFile(join(datasetDir(externalId), name), 'utf8'))
}

/**
 * @name seedDataset
 * @description Connects a snapshot dataset to a workspace as a repository, syncs its pull requests, threads and
 * diffs, and adds the stack group, links and notes that ship with the dataset. Returns the number of synced PRs.
 *
 * @example
 * const count = await seedDataset(workspace.id, DUMMY_EXTERNAL_ID)
 */
export async function seedDataset(organizationId: ID, externalId: ExternalID) {
    const board = snapshotBoardSchema.parse(await readJson(externalId, 'board.json'))
    const snapshotNotes = snapshotNotesSchema.parse(await readJson(externalId, 'notes.json'))
    const [owner] = await db
        .select()
        .from(member)
        .where(and(eq(member.organizationId, organizationId), eq(member.role, 'owner')))

    await db
        .insert(repositories)
        .values({
            organizationId,
            provider: 'snapshot',
            externalId,
            slug: board.repository,
            name: board.repository,
            url: board.prs[0]?.url.replace(/\/pull-requests\/\d+.*$/, '') ?? '',
            connectedBy: owner?.userId ?? null,
        })
        .onConflictDoNothing()
    const [repository] = await db
        .select()
        .from(repositories)
        .where(and(eq(repositories.organizationId, organizationId), eq(repositories.externalId, externalId)))
    if (!repository) throw new Error('snapshot repository was not created')

    const [run] = await enqueueSync(organizationId, [repository.id], 'manual', crypto.randomUUID())
    if (run) await executeRun(run, 120_000)

    const rows = await db
        .select({ id: pullRequests.id, number: pullRequests.number })
        .from(pullRequests)
        .where(eq(pullRequests.repositoryId, repository.id))
    const idOf = new Map(rows.map((row) => [row.number, row.id]))

    for (const [position, group] of board.groups.filter((entry) => entry.id === 'stack').entries()) {
        const [created] = await db
            .insert(groups)
            .values({ organizationId, title: group.title, description: group.description, position })
            .returning({ id: groups.id })
        if (!created) continue
        const ordered = [...group.prs, ...(group.trailing ?? [])]
        for (const [index, number] of ordered.entries()) {
            const prId = idOf.get(number)
            if (prId)
                await db
                    .insert(groupMembers)
                    .values({ groupId: created.id, pullRequestId: prId, position: index })
                    .onConflictDoNothing()
        }
        for (const [index, number] of group.prs.entries()) {
            const next = group.prs[index + 1]
            const fromId = idOf.get(number)
            const toId = next ? idOf.get(next) : undefined
            if (fromId && toId)
                await db
                    .insert(links)
                    .values({ fromId, toId, origin: 'manual', label: 'merge-volgorde' })
                    .onConflictDoNothing()
        }
        const stackNote = snapshotNotes.stack
        if (stackNote?.text)
            await db.insert(notes).values({ organizationId, groupId: created.id, text: stackNote.text })
    }

    for (const pr of board.prs) {
        const fromId = pr.linkedTo ? idOf.get(pr.number) : undefined
        const toId = pr.linkedTo ? idOf.get(pr.linkedTo) : undefined
        if (fromId && toId)
            await db.insert(links).values({ fromId: toId, toId: fromId, origin: 'manual' }).onConflictDoNothing()
    }

    for (const [key, note] of Object.entries(snapshotNotes)) {
        const prId = idOf.get(Number(key))
        if (!prId) continue
        await db
            .insert(notes)
            .values({
                organizationId,
                pullRequestId: prId,
                text: note.text ?? null,
                priority: note.priority ?? null,
                effort: note.effort ?? null,
            })
            .onConflictDoNothing()
    }

    return rows.length
}
