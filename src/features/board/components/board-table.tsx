'use client'

import { useRef, useState, useSyncExternalStore } from 'react'

import { NoteEditor } from '@/features/board/components/note-editor'
import { PullRequestRow } from '@/features/board/components/pull-request-row'
import { StackLinks } from '@/features/board/components/stack-links'
import { useNotes } from '@/features/board/hooks/use-notes'
import type {
    Board,
    Note,
    PullRequest,
    PullRequestGroup,
    PullRequestNumber,
    ReviewData,
    SortMode,
} from '@/features/board/types'
import { noop } from '@/shared/helpers/noop'

type Props = {
    board: Board
    review: ReviewData
    initialNotes: Note[]
}

const SORT_KEY = 'open-prs-sort'
const GROUP_SPAN = 14

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

export function BoardTable({ board, review, initialNotes }: Props) {
    const { notes, save } = useNotes(initialNotes)
    const [expanded, setExpanded] = useState<ReadonlySet<PullRequestNumber>>(() => new Set())
    const [mounted, setMounted] = useState<ReadonlySet<PullRequestNumber>>(() => new Set())
    const sortMode = useSyncExternalStore<SortMode>(subscribeSortMode, readSortMode, () => 'priority')
    const wrap = useRef<HTMLDivElement>(null)
    const byNumber = new Map(board.prs.map((pr) => [pr.number, pr]))

    function priorityOf(pr: PullRequestNumber) {
        return notes.get(String(pr))?.priority ?? null
    }

    function toggle(pr: PullRequestNumber, open?: boolean) {
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

    function switchSort() {
        writeSortMode(sortMode === 'priority' ? 'updated' : 'priority')
    }

    function ordered(group: PullRequestGroup) {
        if (group.id === 'stack' || sortMode === 'updated') return group.prs
        return group.prs.toSorted((a, b) => (priorityOf(a) ?? 99) - (priorityOf(b) ?? 99))
    }

    function rows(numbers: PullRequestNumber[]) {
        return numbers
            .map((number) => byNumber.get(number))
            .filter((pr): pr is PullRequest => pr !== undefined)
            .map((pr) => (
                <PullRequestRow
                    key={pr.number}
                    pr={pr}
                    review={review}
                    note={notes.get(String(pr.number))}
                    expanded={expanded.has(pr.number)}
                    mounted={mounted.has(pr.number)}
                    onToggle={(open) => toggle(pr.number, open)}
                    onSave={save}
                />
            ))
    }

    const layout = JSON.stringify([
        [...expanded],
        sortMode,
        board.groups.map((group) => ordered(group)),
        [...notes.values()].map((note) => [note.id, note.text?.length ?? 0]),
    ])

    return (
        <div className="table-wrap" ref={wrap}>
            <table>
                <thead>
                    <tr>
                        <th title="Klik op een rij of op Details om de review threads, de diff en de notitie te zien">
                            PR · klik om te openen
                        </th>
                        <th>Ticket</th>
                        <th>Titel</th>
                        <th>Diff</th>
                        <th className="envcol">Test env</th>
                        <th>Pipeline</th>
                        <th>Draft</th>
                        <th>Auteur</th>
                        <th>Assignee</th>
                        <th>Review</th>
                        <th>Prio</th>
                        <th>Reviewtijd</th>
                        <th>Bijgewerkt</th>
                    </tr>
                </thead>
                <tbody>
                    {board.groups.map((group) => {
                        const sortable = group.id !== 'stack'
                        const anyPriority = group.prs.some((pr) => priorityOf(pr) !== null)
                        const headClass =
                            group.id === 'stack'
                                ? 'group-head'
                                : `group-head other${group.id === 'drafts' ? ' drafts' : ''}`
                        return [
                            <tr key={`${group.id}-head`} className={headClass}>
                                <td colSpan={GROUP_SPAN}>
                                    <span className="gtitle">{group.title}</span>
                                    {sortable && (
                                        <button
                                            type="button"
                                            className={sortMode === 'priority' ? 'sort-toggle on' : 'sort-toggle'}
                                            hidden={!anyPriority}
                                            title={
                                                sortMode === 'priority'
                                                    ? 'Klik om op bijgewerkt te sorteren'
                                                    : 'Klik om op prioriteit te sorteren'
                                            }
                                            onClick={switchSort}
                                        >
                                            {sortMode === 'priority' ? 'Volgorde: prioriteit' : 'Volgorde: bijgewerkt'}
                                        </button>
                                    )}
                                    {group.description && <span className="gdesc">{group.description}</span>}
                                    {group.id === 'stack' && (
                                        <div className="note-host stack">
                                            <NoteEditor id="stack" note={notes.get('stack')} onSave={save} />
                                        </div>
                                    )}
                                </td>
                            </tr>,
                            ...rows(ordered(group)),
                            ...(group.id === 'stack'
                                ? [
                                      <tr key="stack-note" className="group-note">
                                          <td colSpan={GROUP_SPAN}>
                                              <div className="stack-note">
                                                  <div className="sn-text">
                                                      <span className="sn-label">Eindresultaat</span>
                                                      <p>
                                                          Alle branches hierboven zijn al gemerged naar{' '}
                                                          <code>{board.stack.branch}</code>. Elke keer als ik feedback
                                                          verwerk, rebase ik vanaf die branch de hele stack omhoog tot
                                                          en met de gedeployde test environment.
                                                      </p>
                                                  </div>
                                                  <a
                                                      className="sn-link"
                                                      href={board.stack.envUrl}
                                                      target="_blank"
                                                      rel="noopener"
                                                  >
                                                      <span className="sn-dot" aria-hidden="true" />
                                                      Open test environment
                                                      <span aria-hidden="true">↗</span>
                                                  </a>
                                              </div>
                                          </td>
                                      </tr>,
                                      <tr key="stack-gap" className="group-gap">
                                          <td colSpan={GROUP_SPAN}>
                                              <span className="step ghost">↓</span>
                                              <code>{board.stack.branch}</code> naar master. Nog geen PR.
                                          </td>
                                      </tr>,
                                      ...rows(group.trailing ?? []),
                                  ]
                                : []),
                        ]
                    })}
                </tbody>
            </table>
            <StackLinks wrap={wrap} layout={layout} />
        </div>
    )
}
