'use client'

import { useState } from 'react'

import { deleteGroupAction, updateGroupAction } from '@/features/board/actions'
import { NoteEditor } from '@/features/board/components/note-editor'
import type { Note, NoteID, NotePatch, PullRequestGroup, SortMode } from '@/features/board/types'

type Props = {
    group: PullRequestGroup
    columns: number
    note: Note | undefined
    sortMode: SortMode
    sortable: boolean
    anyPriority: boolean
    onSort: () => void
    onSave: (id: NoteID, patch: NotePatch) => Promise<void>
}

function GroupEditor({ group, onDone }: { group: PullRequestGroup; onDone: () => void }) {
    const [title, setTitle] = useState(group.title)
    const [description, setDescription] = useState(group.description ?? '')
    const [busy, setBusy] = useState(false)
    return (
        <form
            className="group-edit"
            onSubmit={async (event) => {
                event.preventDefault()
                setBusy(true)
                await updateGroupAction(group.id, title, description || null)
                setBusy(false)
                onDone()
            }}
        >
            <input
                aria-label="Naam van de groep"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={80}
            />
            <input
                aria-label="Beschrijving"
                placeholder="Beschrijving (optioneel)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
            />
            <button type="submit" disabled={busy}>
                Opslaan
            </button>
            <button type="button" onClick={onDone}>
                Annuleren
            </button>
            <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={async () => {
                    if (!confirm(`Groep "${group.title}" verwijderen? De PR's blijven op het bord.`)) return
                    setBusy(true)
                    await deleteGroupAction(group.id)
                }}
            >
                Groep verwijderen
            </button>
        </form>
    )
}

export function GroupHeader({ group, columns, note, sortMode, sortable, anyPriority, onSort, onSave }: Props) {
    const [editing, setEditing] = useState(false)
    const custom = group.kind === 'custom'
    const headClass = custom ? 'group-head' : `group-head other${group.kind === 'drafts' ? ' drafts' : ''}`
    return (
        <tr className={headClass}>
            <td colSpan={columns}>
                {editing ? (
                    <GroupEditor group={group} onDone={() => setEditing(false)} />
                ) : (
                    <>
                        <span className="gtitle">{group.title}</span>
                        <span className="gcount">{group.prs.length}</span>
                        {sortable && (
                            <button
                                type="button"
                                className={sortMode === 'priority' ? 'sort-toggle on' : 'sort-toggle'}
                                hidden={!anyPriority}
                                onClick={onSort}
                            >
                                {sortMode === 'priority' ? 'Volgorde: prioriteit' : 'Volgorde: bijgewerkt'}
                            </button>
                        )}
                        {custom && (
                            <button type="button" className="sort-toggle" onClick={() => setEditing(true)}>
                                Bewerken
                            </button>
                        )}
                        {group.description && <span className="gdesc">{group.description}</span>}
                    </>
                )}
                {custom && (
                    <div className="note-host stack">
                        <NoteEditor
                            id={`group:${group.id}`}
                            label={`Notitie bij ${group.title}`}
                            note={note}
                            onSave={onSave}
                        />
                    </div>
                )}
                {custom && group.prs.length === 0 && (
                    <p className="gempty">Nog geen PR&apos;s. Open een PR en kies deze groep onder Indeling.</p>
                )}
            </td>
        </tr>
    )
}
