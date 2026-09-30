'use client'

import { useEffect, useRef, useState } from 'react'

import { saveNoteAction } from '@/features/board/actions'
import type { Note, NoteID, NotePatch } from '@/features/board/types'

const POLL_MS = 15_000

export class NoteSaveError extends Error {
    constructor(readonly code: string) {
        super(code)
    }
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
    }
}

async function fetchNotes() {
    const response = await fetch('/api/notes', { cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    const notes: Note[] = await response.json()
    return notes
}

export function useNotes(initial: Note[]) {
    const [notes, setNotes] = useState(() => byId(initial))
    const latest = useRef(notes)

    useEffect(() => {
        latest.current = notes
    }, [notes])

    useEffect(() => {
        let stopped = false
        function refresh() {
            if (document.visibilityState !== 'visible') return
            fetchNotes()
                .then((fresh) => {
                    if (!stopped) setNotes(byId(fresh))
                })
                .catch((error: Error) => console.warn('Notities verversen mislukt', error))
        }
        const timer = setInterval(refresh, POLL_MS)
        document.addEventListener('visibilitychange', refresh)
        return () => {
            stopped = true
            clearInterval(timer)
            document.removeEventListener('visibilitychange', refresh)
        }
    }, [])

    async function save(id: NoteID, patch: NotePatch) {
        const previous = latest.current.get(id)
        setNotes((current) => new Map(current).set(id, applyPatch(current.get(id), id, patch)))
        const result = await saveNoteAction(id, patch).catch(() => ({ ok: false, error: 'failed' }) as const)
        setNotes((current) => {
            const next = new Map(current)
            const settled = result.ok ? result.note : previous
            if (settled) next.set(id, settled)
            else next.delete(id)
            return next
        })
        if (!result.ok) throw new NoteSaveError(result.error)
    }

    return { notes, save }
}
