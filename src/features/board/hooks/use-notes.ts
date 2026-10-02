'use client'

import { useState } from 'react'

import { saveNoteAction } from '@/features/board/actions'
import type { Note, NoteID, NotePatch } from '@/features/board/types'
import type { PublicError } from '@/shared/errors/result'

export class NoteSaveError extends Error {
    constructor(readonly error: PublicError) {
        super(error.code)
    }
}

const SAVE_FAILED: PublicError = {
    code: 'unknown',
    message: 'Opslaan mislukt. Probeer het opnieuw.',
    recovery: 'retry',
    reference: null,
}

function byId(notes: Note[]) {
    return new Map(notes.map((note) => [note.id, note]))
}

function applyPatch(current: Note | undefined, id: NoteID, patch: NotePatch): Note {
    const at = new Date().toISOString()
    return {
        id,
        createdAt: current?.createdAt ?? at,
        updatedAt: at,
        text: patch.text === undefined ? (current?.text ?? null) : patch.text,
        priority: patch.priority === undefined ? (current?.priority ?? null) : patch.priority,
        effort: patch.effort === undefined ? (current?.effort ?? null) : patch.effort,
        updatedBy: current?.updatedBy ?? null,
    }
}

export function useNotes(initial: Note[]) {
    const [source, setSource] = useState(initial)
    const [notes, setNotes] = useState(() => byId(initial))
    if (source !== initial) {
        setSource(initial)
        setNotes(byId(initial))
    }

    async function save(id: NoteID, patch: NotePatch) {
        const previous = notes.get(id)
        setNotes((current) => new Map(current).set(id, applyPatch(current.get(id), id, patch)))
        const result = await saveNoteAction(id, patch).catch(() => ({ ok: false, error: SAVE_FAILED }) as const)
        setNotes((current) => {
            const next = new Map(current)
            const settled = result.ok ? result.value : previous
            if (settled) next.set(id, settled)
            else next.delete(id)
            return next
        })
        if (!result.ok) throw new NoteSaveError(result.error)
    }

    return { notes, save }
}
