'use client'

import { useEffect, useRef, useState } from 'react'

import { Editable } from '@/features/board/components/editable'
import { formatDateTime } from '@/features/board/format'
import { NoteSaveError } from '@/features/board/hooks/use-notes'
import type { Note, NoteID, NotePatch } from '@/features/board/types'

type Props = {
    id: NoteID
    label: string
    note: Note | undefined
    onSave: (id: NoteID, patch: NotePatch) => Promise<void>
}

export function NoteEditor({ id, label, note, onSave }: Props) {
    const text = note?.text ?? ''
    const [draft, setDraft] = useState(text)
    const [dirty, setDirty] = useState(false)
    const [busy, setBusy] = useState(false)
    const [status, setStatus] = useState<{ message: string; bad: boolean }>({ message: '', bad: false })
    const area = useRef<HTMLTextAreaElement>(null)
    const fieldId = `note-${id.replace(':', '-')}`

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
                message: value ? 'Opgeslagen. Iedereen in de workspace ziet dit.' : 'Notitie verwijderd.',
                bad: false,
            })
        } catch (error) {
            setStatus({
                message: error instanceof NoteSaveError ? error.error.message : 'Opslaan mislukt. Probeer het opnieuw.',
                bad: true,
            })
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className={text ? 'note-box has-note' : 'note-box'}>
            <div className="note-head">
                <span className="note-label">{label}</span>
                {text && note && (
                    <span className="note-meta">
                        {note.updatedBy ? `${note.updatedBy} · ` : ''}bijgewerkt {formatDateTime(note.updatedAt)}
                    </span>
                )}
            </div>
            <Editable
                fallback={text ? <p className="note-text">{text}</p> : <p className="note-empty">Geen notitie.</p>}
            >
                <label className="sr-only" htmlFor={fieldId}>
                    {label}
                </label>
                <textarea
                    ref={area}
                    id={fieldId}
                    rows={3}
                    placeholder="Context voor je collega's: wat is er veranderd, wat moet getest worden, wat heb je nodig?"
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
