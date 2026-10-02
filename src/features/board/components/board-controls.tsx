'use client'

import Link from 'next/link'
import { useState } from 'react'

import { createGroupAction } from '@/features/board/actions'
import type { Board, BoardView, RepositoryID } from '@/features/board/types'

type Props = {
    board: Board
}

type Query = {
    view: BoardView
    filter: RepositoryID[]
    mine: boolean
}

function href(query: Query) {
    const search: Record<string, string> = {}
    if (query.view === 'archive') search.view = 'archive'
    if (query.filter.length > 0) search.repo = query.filter.join(',')
    if (query.mine) search.mine = '1'
    return { pathname: '/board' as const, query: search }
}

function NewGroup() {
    const [open, setOpen] = useState(false)
    const [title, setTitle] = useState('')
    if (!open)
        return (
            <button type="button" className="chip" onClick={() => setOpen(true)}>
                + Groep
            </button>
        )
    return (
        <form
            className="inline-form"
            onSubmit={async (event) => {
                event.preventDefault()
                await createGroupAction(title)
                setTitle('')
                setOpen(false)
            }}
        >
            <input
                aria-label="Naam van de nieuwe groep"
                placeholder="Naam van de groep"
                value={title}
                maxLength={80}
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
            />
            <button type="submit" disabled={!title.trim()}>
                Aanmaken
            </button>
            <button type="button" onClick={() => setOpen(false)}>
                Annuleren
            </button>
        </form>
    )
}

export function BoardControls({ board }: Props) {
    const query: Query = { view: board.view, filter: board.filter, mine: board.mine }
    const visible = board.repositories.filter(
        (repo) => repo.status !== 'disconnected' || board.viewer.role !== 'member',
    )
    return (
        <div className="board-controls">
            <div className="tabs" role="tablist" aria-label="Weergave">
                <Link role="tab" aria-selected={board.view === 'active'} href={href({ ...query, view: 'active' })}>
                    Actief
                </Link>
                <Link role="tab" aria-selected={board.view === 'archive'} href={href({ ...query, view: 'archive' })}>
                    Archief
                </Link>
            </div>
            <Link
                className={board.mine ? 'chip on' : 'chip'}
                aria-pressed={board.mine}
                href={href({ ...query, mine: !board.mine })}
            >
                Wacht op mij
            </Link>
            {visible.length > 1 && (
                <div className="repo-filter" aria-label="Repositories">
                    <Link
                        className={board.filter.length === 0 ? 'chip on' : 'chip'}
                        href={href({ ...query, filter: [] })}
                    >
                        Alle repositories
                    </Link>
                    {visible.map((repo) => {
                        const on = board.filter.includes(repo.id)
                        const next = on ? board.filter.filter((id) => id !== repo.id) : [...board.filter, repo.id]
                        return (
                            <Link
                                key={repo.id}
                                className={on ? 'chip on' : 'chip'}
                                aria-pressed={on}
                                href={href({ ...query, filter: next })}
                            >
                                {repo.slug}
                            </Link>
                        )
                    })}
                </div>
            )}
            {board.view === 'active' && <NewGroup />}
        </div>
    )
}
