'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { markReadAction } from '@/features/board/actions'
import { GroupHeader } from '@/features/board/components/group-header'
import { PullRequestRow } from '@/features/board/components/pull-request-row'
import { StackLinks } from '@/features/board/components/stack-links'
import { useNotes } from '@/features/board/hooks/use-notes'
import type { Board, PullRequest, PullRequestGroup, PullRequestID, SortMode } from '@/features/board/types'
import { noop } from '@/shared/helpers/noop'

type Props = {
    board: Board
    focus: PullRequestID | null
}

const SORT_KEY = 'open-prs-sort'

function readSortMode(): SortMode {
    try {
        return localStorage.getItem(SORT_KEY) === 'updated' ? 'updated' : 'priority'
    } catch {
        return 'priority'
    }
}

const sortListeners = new Set<() => void>()

function subscribeSortMode(listener: () => void) {
    sortListeners.add(listener)
    return () => {
        sortListeners.delete(listener)
    }
}

function writeSortMode(mode: SortMode) {
    try {
        localStorage.setItem(SORT_KEY, mode)
    } catch {
        noop()
    }
    sortListeners.forEach((listener) => listener())
}

export function BoardTable({ board, focus }: Props) {
    const { notes, save } = useNotes(board.notes)
    const [expanded, setExpanded] = useState<ReadonlySet<PullRequestID>>(() => new Set(focus ? [focus] : []))
    const [mounted, setMounted] = useState<ReadonlySet<PullRequestID>>(() => new Set(focus ? [focus] : []))
    const sortMode = useSyncExternalStore<SortMode>(subscribeSortMode, readSortMode, () => 'priority')
    const wrap = useRef<HTMLDivElement>(null)
    const byId = new Map(board.prs.map((pr) => [pr.id, pr]))
    const byIdRef = useRef(byId)
    const showEnv = board.prs.some((pr) => pr.env.kind !== 'none')
    const showRepo = board.repositories.length > 1
    const columns = 12 + Number(showEnv) + Number(showRepo)
    const customGroups = board.groups.filter((group) => group.kind === 'custom')

    function priorityOf(pr: PullRequestID) {
        return notes.get(`pr:${pr}`)?.priority ?? null
    }

    function toggle(pr: PullRequestID, open?: boolean) {
        if ((open ?? !expanded.has(pr)) && byId.get(pr)?.unread) void markReadAction(pr)
        setMounted((current) => (current.has(pr) ? current : new Set(current).add(pr)))
        setExpanded((current) => {
            const next = open ?? !current.has(pr)
            if (current.has(pr) === next) return current
            const updated = new Set(current)
            if (next) updated.add(pr)
            else updated.delete(pr)
            return updated
        })
    }

    function ordered(group: PullRequestGroup) {
        if (group.kind === 'archive' || group.kind === 'custom' || sortMode === 'updated') return group.prs
        return group.prs.toSorted((a, b) => (priorityOf(a) ?? 99) - (priorityOf(b) ?? 99))
    }

    function rows(ids: PullRequestID[]) {
        return ids
            .map((id) => byId.get(id))
            .filter((pr): pr is PullRequest => pr !== undefined)
            .map((pr) => (
                <PullRequestRow
                    key={pr.id}
                    pr={pr}
                    board={board}
                    columns={columns}
                    showEnv={showEnv}
                    showRepo={showRepo}
                    groups={customGroups}
                    note={notes.get(`pr:${pr.id}`)}
                    expanded={expanded.has(pr.id)}
                    mounted={mounted.has(pr.id)}
                    onToggle={(open) => toggle(pr.id, open)}
                    onSave={save}
                />
            ))
    }

    const layout = JSON.stringify([
        [...expanded],
        sortMode,
        board.groups.map((group) => ordered(group)),
        board.links.map((link) => link.id),
        [...notes.values()].map((note) => [note.id, note.text?.length ?? 0]),
    ])

    useEffect(() => {
        if (!focus) return
        if (byIdRef.current.get(focus)?.unread) void markReadAction(focus)
        wrap.current?.querySelector(`tr.row[data-pr="${focus}"]`)?.scrollIntoView({ block: 'center' })
    }, [focus])

    if (board.prs.length === 0)
        return (
            <p className="board-empty">
                {board.mine
                    ? 'Er wacht nu niets op jou.'
                    : board.view === 'archive'
                      ? 'Geen gemergede of gesloten PR’s in de laatste 30 dagen.'
                      : 'Geen open pull requests.'}
            </p>
        )

    return (
        <div className="table-wrap" ref={wrap}>
            <table>
                <thead>
                    <tr>
                        <th title="Klik op een rij of op Details om de review threads, de diff en de notitie te zien">
                            PR
                        </th>
                        {showRepo && <th>Repository</th>}
                        <th>Ticket</th>
                        <th>Titel</th>
                        <th>Diff</th>
                        {showEnv && <th className="envcol">Test env</th>}
                        <th>Pipeline</th>
                        <th>Draft</th>
                        <th>Auteur</th>
                        <th>Reviewer</th>
                        <th>Review</th>
                        <th>Prio</th>
                        <th>Reviewtijd</th>
                        <th>{board.view === 'archive' ? 'Gesloten' : 'Bijgewerkt'}</th>
                    </tr>
                </thead>
                <tbody>
                    {board.groups.map((group) => [
                        <GroupHeader
                            key={`${group.id}-head`}
                            group={group}
                            columns={columns}
                            note={notes.get(`group:${group.id}`)}
                            sortMode={sortMode}
                            sortable={group.kind === 'open' || group.kind === 'drafts'}
                            anyPriority={group.prs.some((pr) => priorityOf(pr) !== null)}
                            onSort={() => writeSortMode(sortMode === 'priority' ? 'updated' : 'priority')}
                            onSave={save}
                        />,
                        ...rows(ordered(group)),
                    ])}
                </tbody>
            </table>
            <StackLinks wrap={wrap} layout={layout} links={board.links} />
        </div>
    )
}
