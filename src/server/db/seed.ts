import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { and, eq } from 'drizzle-orm'

import { SNAPSHOT_EXTERNAL_ID } from '@/features/providers/snapshot/adapter'
import { snapshotBoardSchema, snapshotNotesSchema } from '@/features/providers/snapshot/schema'
import { enqueueSync } from '@/features/sync/queue'
import { executeRun } from '@/features/sync/run'
import { member, organization } from '@/server/db/auth-schema'
import { groupMembers, groups, links, notes, pullRequests, repositories } from '@/server/db/board-schema'
import { db } from '@/server/db/client'

const slug = process.argv[2]
if (!slug) {
    console.error('Usage: bun run db:seed <workspace-slug>')
    process.exit(1)
}

const [workspace] = await db.select().from(organization).where(eq(organization.slug, slug))
if (!workspace) {
    console.error(`No workspace with slug ${slug}`)
    process.exit(1)
}
const [owner] = await db
    .select()
    .from(member)
    .where(and(eq(member.organizationId, workspace.id), eq(member.role, 'owner')))

async function readJson(name: string) {
    return JSON.parse(await readFile(join(process.cwd(), 'data', 'snapshot', name), 'utf8'))
}

const board = snapshotBoardSchema.parse(await readJson('board.json'))
const snapshotNotes = snapshotNotesSchema.parse(await readJson('notes.json'))

await db
    .insert(repositories)
    .values({
        organizationId: workspace.id,
        provider: 'snapshot',
        externalId: SNAPSHOT_EXTERNAL_ID,
        slug: board.repository,
        name: board.repository,
        url: board.prs[0]?.url.replace(/\/pull-requests\/\d+.*$/, '') ?? '',
        connectedBy: owner?.userId ?? null,
    })
    .onConflictDoNothing()
const [repository] = await db
    .select()
    .from(repositories)
    .where(and(eq(repositories.organizationId, workspace.id), eq(repositories.externalId, SNAPSHOT_EXTERNAL_ID)))
if (!repository) throw new Error('snapshot repository was not created')

const [run] = await enqueueSync(workspace.id, [repository.id], 'manual', crypto.randomUUID())
if (run) await executeRun(run, 120_000)

const rows = await db
    .select({ id: pullRequests.id, number: pullRequests.number })
    .from(pullRequests)
    .where(eq(pullRequests.repositoryId, repository.id))
const idOf = new Map(rows.map((row) => [row.number, row.id]))

for (const [position, group] of board.groups.filter((entry) => entry.id === 'stack').entries()) {
    const [created] = await db
        .insert(groups)
        .values({ organizationId: workspace.id, title: group.title, description: group.description, position })
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
        await db.insert(notes).values({ organizationId: workspace.id, groupId: created.id, text: stackNote.text })
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
            organizationId: workspace.id,
            pullRequestId: prId,
            text: note.text ?? null,
            priority: note.priority ?? null,
            effort: note.effort ?? null,
        })
        .onConflictDoNothing()
}

console.log(`Seeded ${rows.length} PRs, groups, links and notes into ${workspace.name}`)
