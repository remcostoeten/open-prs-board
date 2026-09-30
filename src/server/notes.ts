import { eq } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'

import type { Note, NoteID, NotePatch } from '@/features/board/types'
import { db } from '@/server/db/client'
import { notes } from '@/server/db/schema'

/**
 * @name listNotes
 * @description Returns every stored note, priority and review effort, one row per PR or `stack`. Cached under
 * the `notes` tag, which every write invalidates.
 *
 * @example
 * const all = await listNotes()
 */
export async function listNotes(): Promise<Note[]> {
    'use cache'
    cacheTag('notes')
    cacheLife('minutes')
    return db.select().from(notes)
}

/**
 * @name saveNote
 * @description Applies a patch to the note of one PR. Absent fields are kept, `null` clears a field. The row is
 * deleted once text, priority and effort are all empty. Returns the stored note, or null when it was deleted.
 *
 * @example
 * await saveNote('851', { priority: 1 })
 * await saveNote('stack', { text: null })
 */
export async function saveNote(id: NoteID, patch: NotePatch): Promise<Note | null> {
    const [current] = await db.select().from(notes).where(eq(notes.id, id))
    const next = {
        text: (patch.text === undefined ? current?.text : patch.text?.trim()) || null,
        priority: patch.priority === undefined ? (current?.priority ?? null) : patch.priority,
        effort: patch.effort === undefined ? (current?.effort ?? null) : patch.effort,
    }
    if (!next.text && !next.priority && !next.effort) {
        await db.delete(notes).where(eq(notes.id, id))
        return null
    }
    const [saved] = await db
        .insert(notes)
        .values({ id, ...next })
        .onConflictDoUpdate({ target: notes.id, set: { ...next, updatedAt: new Date().toISOString() } })
        .returning()
    return saved ?? null
}
