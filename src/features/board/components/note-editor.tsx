'use client'

import { useEffect, useRef, useState } from 'react'

import { Editable } from '@/features/board/components/editable'
import { PR_NOTE_COPY, STACK_NOTE_COPY } from '@/features/board/copy'
import { formatDateTime } from '@/features/board/format'
import { NoteSaveError } from '@/features/board/hooks/use-notes'
import type { Note, NoteID, NotePatch } from '@/features/board/types'

type Props = {
    id: NoteID
    note: Note | undefined
    onSave: (id: NoteID, patch: NotePatch) => Promise<void>
}

export function NoteEditor({ id, note, onSave }: Props) {
    const copy = id === 'stack' ? STACK_NOTE_COPY : PR_NOTE_COPY
    const text = note?.text ?? ''
    const [draft, setDraft] = useState(text)
    const [dirty, setDirty] = useState(false)
    const [busy, setBusy] = useState(false)
    const [status, setStatus] = useState<{ message: string; bad: boolean }>({ message: '', bad: false })
    const area = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (!dirty && document.activeElement !== area.current) setDraft(text)
    }, [text, dirty])

    async function persist(value: string) {
        setBusy(true)
        setStatus({ message: 'Opslaan…', bad: false })
        try {
            await onSave(id, { text: value || null })
            setDirty(false)
            setDraft(value)
            setStatus({
                message: value ? 'Opgeslagen. Daan ziet dit als hij de pagina opent.' : 'Notitie verwijderd.',
                bad: false,
            })
        } catch (error) {
            setStatus({
                message:
                    error instanceof NoteSaveError && error.code === 'not_granted'
                        ? 'Je hebt geen rechten om notities te wijzigen.'
                        : 'Opslaan mislukt. Probeer het opnieuw.',
                bad: true,
            })
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className={text ? 'note-box has-note' : 'note-box'}>
            <div className="note-head">
                <span className="note-label">{copy.label}</span>
                {text && note && <span className="note-meta">bijgewerkt {formatDateTime(note.updatedAt)}</span>}
            </div>
            <Editable
                fallback={text ? <p className="note-text">{text}</p> : <p className="note-empty">{copy.empty}</p>}
            >
                <label className="sr-only" htmlFor={`note-${id}`}>
                    {copy.srLabel ?? `Notitie voor Daan bij PR ${id}`}
                </label>
                <textarea
                    ref={area}
                    id={`note-${id}`}
                    rows={3}
                    placeholder={copy.placeholder}
                    value={draft}
                    onChange={(event) => {
                        setDraft(event.target.value)
                        setDirty(true)
                        setStatus({ message: 'Niet opgeslagen wijzigingen', bad: false })
                    }}
                    onKeyDown={(event) => {
                        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                            event.preventDefault()
                            void persist(draft.trim())
                        }
                    }}
                />
                <div className="note-bar">
                    <button
                        type="button"
                        className="note-save"
                        disabled={busy}
                        onClick={() => void persist(draft.trim())}
                    >
                        Notitie opslaan
                    </button>
                    <button
                        type="button"
                        className="note-clear"
                        disabled={busy}
                        hidden={!text}
                        onClick={() => {
                            setDraft('')
                            void persist('')
                        }}
                    >
                        Wissen
                    </button>
                    <span className={status.bad ? 'note-status bad' : 'note-status'} aria-live="polite">
                        {status.message}
                    </span>
                </div>
            </Editable>
        </div>
    )
}
