import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { snapshotNotesSchema } from '@/features/board/schema'
import { db } from '@/server/db/client'
import { notes } from '@/server/db/schema'

const raw: string = await readFile(join(process.cwd(), 'data', 'snapshot', 'notes.json'), 'utf8')
const snapshot = snapshotNotesSchema.parse(JSON.parse(raw))

const rows = Object.entries(snapshot).map(([id, note]) => ({
    id,
    text: note.text ?? null,
    priority: note.priority ?? null,
    effort: note.effort ?? null,
    createdAt: note.updatedAt,
    updatedAt: note.updatedAt,
}))

await db.insert(notes).values(rows).onConflictDoNothing()
console.log(`Seeded ${rows.length} notes`)
