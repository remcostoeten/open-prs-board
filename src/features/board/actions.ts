'use server'

import { refresh, updateTag } from 'next/cache'
import { z } from 'zod'

import { notePatchSchema } from '@/features/board/schema'
import type { Note } from '@/features/board/types'
import { saveNote } from '@/server/notes'
import { canEdit, signIn, signOut } from '@/server/session'

export type SaveNoteResult = { ok: true; note: Note | null } | { ok: false; error: 'not_granted' | 'invalid' }

const noteIdSchema = z.string().regex(/^(\d+|stack)$/)

export async function saveNoteAction(id: string, patch: z.input<typeof notePatchSchema>): Promise<SaveNoteResult> {
    const parsedId = noteIdSchema.safeParse(id)
    const parsedPatch = notePatchSchema.safeParse(patch)
    if (!parsedId.success || !parsedPatch.success) return { ok: false, error: 'invalid' }
    if (!(await canEdit())) return { ok: false, error: 'not_granted' }
    const note = await saveNote(parsedId.data, parsedPatch.data)
    updateTag('notes')
    return { ok: true, note }
}

export async function signInAction(_state: string, form: FormData) {
    const passcode = z.string().safeParse(form.get('passcode'))
    if (!passcode.success || !(await signIn(passcode.data))) return 'Onjuiste code.'
    refresh()
    return ''
}

export async function signOutAction() {
    await signOut()
    refresh()
}
