'use client'

import { useRef, useState } from 'react'

import { PullRequestProvider } from '@/features/board/components/board-context'
import { CanWriteProvider, Editable } from '@/features/board/components/editable'
import { FilesPanel } from '@/features/board/components/files-panel'
import { NoteEditor } from '@/features/board/components/note-editor'
import { PullRequestTools } from '@/features/board/components/pr-tools'
import {
    EffortCell,
    EnvironmentCell,
    PipelineCell,
    PriorityCell,
    ReviewCell,
} from '@/features/board/components/row-cells'
import { formatCount, formatDayAndClock } from '@/features/board/format'
import { loadDiff, useDiff } from '@/features/board/hooks/use-diff'
import type { Board, Note, NoteID, NotePatch, PullRequest, PullRequestGroup } from '@/features/board/types'

type Props = {
    pr: PullRequest
    board: Board
    columns: number
    showEnv: boolean
    showRepo: boolean
    groups: PullRequestGroup[]
    note: Note | undefined
    expanded: boolean
    mounted: boolean
    onToggle: (open?: boolean) => void
    onSave: (id: NoteID, patch: NotePatch) => Promise<void>
}

function afterPaint(run: () => void) {
    requestAnimationFrame(() => requestAnimationFrame(run))
}

function Detail({ pr, board }: Pick<Props, 'pr' | 'board'>) {
    const [attempt, setAttempt] = useState(0)
    const diff = useDiff(pr.id, attempt)
    return (
        <FilesPanel
            files={diff.status === 'ready' ? diff.files : []}
            loading={diff.status === 'loading'}
            diffError={diff.status === 'error' ? diff.error : null}
            onRetry={() => setAttempt((value) => value + 1)}
            threads={board.review.threads[pr.id] ?? []}
            verdict={board.review.review[pr.id]}
            fixes={board.review.fixes}
            threadsFailed={pr.threadsError !== null}
        />
    )
}

export function PullRequestRow({
    pr,
    board,
    columns,
    showEnv,
    showRepo,
    groups,
    note,
    expanded,
    mounted,
    onToggle,
    onSave,
}: Props) {
    const detail = useRef<HTMLTableRowElement>(null)
    const key = `pr:${pr.id}`
    const text = note?.text ?? ''
    const [day, clock] = formatDayAndClock(pr.closedAt ?? pr.updatedAt)
    const classes = [
        'row',
        (pr.review === 'approved' || pr.state !== 'open') && 'done',
        text && 'has-note',
        pr.readOnly && 'read-only',
    ]
        .filter(Boolean)
        .join(' ')

    function reveal(selector: string, block: ScrollLogicalPosition) {
        onToggle(true)
        afterPaint(() => detail.current?.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block }))
    }

    function showThreads() {
        onToggle(true)
        loadDiff(pr.id)
            .catch((error: Error) => console.warn('Diff laden mislukt', error))
            .finally(() => afterPaint(() => reveal('.review-box', 'start')))
    }

    return (
        <CanWriteProvider value={!pr.readOnly && pr.state === 'open'}>
            <PullRequestProvider pr={pr}>
                <tr
                    className={classes}
                    data-pr={pr.id}
                    tabIndex={0}
                    aria-expanded={expanded}
                    title="Toon review threads, notitie en diff"
                    onClick={(event) => {
                        if (
                            event.target instanceof Element &&
                            event.target.closest('a, button, select, textarea, input')
                        )
                            return
                        onToggle()
                    }}
                    onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
                        event.preventDefault()
                        onToggle()
                    }}
                >
                    <td className="pr">
                        {pr.step !== null && (
                            <span className="step" title={`Stap ${pr.step} in de keten`}>
                                {pr.step}
                            </span>
                        )}
                        <a className="prlink" href={pr.url} target="_blank" rel="noopener">
                            #{pr.number} ↗
                        </a>
                        {pr.unread > 0 && (
                            <span
                                className="unread"
                                title={`${pr.unread} nieuwe ${pr.unread === 1 ? 'reactie' : 'reacties'} sinds je laatste bezoek`}
                            >
                                {pr.unread}
                            </span>
                        )}
                    </td>
                    {showRepo && <td className="repo">{pr.repository}</td>}
                    {pr.ticket ? (
                        <td className="key">
                            {pr.ticket.key}
                            {pr.ticket.old && <span className="old">{pr.ticket.old}</span>}
                        </td>
                    ) : (
                        <td className="key none">geen</td>
                    )}
                    <td className="title">
                        <a href={pr.url} target="_blank" rel="noopener">
                            {pr.title}
                        </a>
                        <span className="sub">
                            {pr.source} → {pr.base}
                        </span>
                        <div className="row-actions">
                            <button
                                type="button"
                                className="row-open"
                                aria-label={`Details van PR ${pr.number}`}
                                onClick={() => onToggle()}
                            >
                                <span className="chev">▾</span>Details
                            </button>
                            {text && (
                                <button
                                    type="button"
                                    className="note-flag"
                                    onClick={() => reveal('.note-box', 'center')}
                                >
                                    ✎ Notitie · lees
                                </button>
                            )}
                            {pr.state !== 'open' && (
                                <span className="pill idle">{pr.state === 'merged' ? 'Gemerged' : 'Gesloten'}</span>
                            )}
                            {pr.readOnly && <span className="pill idle">Alleen lezen</span>}
                        </div>
                        {text && <span className="note-peek">{text}</span>}
                    </td>
                    <td className="diff">
                        {pr.add === null || pr.rem === null ? (
                            <span className="none">onbekend</span>
                        ) : (
                            <>
                                <span className="add">+{formatCount(pr.add)}</span>{' '}
                                <span className="rem">−{formatCount(pr.rem)}</span>
                            </>
                        )}
                        {pr.files !== null && <span className="files">{pr.files} bestanden</span>}
                    </td>
                    {showEnv && <EnvironmentCell pr={pr} />}
                    <PipelineCell pr={pr} />
                    <td>{pr.draft && <span className="pill draft">Draft</span>}</td>
                    <td className="who">{pr.author}</td>
                    {pr.reviewer ? <td className="who">{pr.reviewer}</td> : <td className="who none">Geen</td>}
                    <ReviewCell pr={pr} review={board.review} onShowThreads={showThreads} />
                    <PriorityCell pr={pr} priority={note?.priority ?? null} onSave={(patch) => onSave(key, patch)} />
                    <EffortCell pr={pr} effort={note?.effort ?? null} onSave={(patch) => onSave(key, patch)} />
                    <td className="upd">
                        <time dateTime={pr.closedAt ?? pr.updatedAt}>
                            {day}
                            <span>{clock}</span>
                        </time>
                    </td>
                </tr>
                {mounted && (
                    <tr className="detail" ref={detail} hidden={!expanded}>
                        <td colSpan={columns}>
                            <div className="note-host">
                                <NoteEditor id={key} label="Notitie bij deze PR" note={note} onSave={onSave} />
                            </div>
                            <Editable fallback={null}>
                                <PullRequestTools groups={groups} />
                            </Editable>
                            {expanded && <Detail pr={pr} board={board} />}
                        </td>
                    </tr>
                )}
            </PullRequestProvider>
        </CanWriteProvider>
    )
}
