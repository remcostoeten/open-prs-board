'use client'

import { useRef } from 'react'

import { FilesPanel } from '@/features/board/components/files-panel'
import { NoteEditor } from '@/features/board/components/note-editor'
import {
    EffortCell,
    EnvironmentCell,
    PipelineCell,
    PriorityCell,
    ReviewCell,
} from '@/features/board/components/row-cells'
import { AUTHOR } from '@/features/board/copy'
import { formatCount, formatDayAndClock } from '@/features/board/format'
import { loadDiff, useDiff } from '@/features/board/hooks/use-diff'
import type { Note, NoteID, NotePatch, PullRequest, ReviewData } from '@/features/board/types'

export const COLUMNS = 13

type Props = {
    pr: PullRequest
    review: ReviewData
    note: Note | undefined
    expanded: boolean
    mounted: boolean
    onToggle: (open?: boolean) => void
    onSave: (id: NoteID, patch: NotePatch) => Promise<void>
}

function afterPaint(run: () => void) {
    requestAnimationFrame(() => requestAnimationFrame(run))
}

function Detail({ pr, review }: Pick<Props, 'pr' | 'review'>) {
    const diff = useDiff(pr.number)
    if (diff.status === 'loading')
        return (
            <div className="files-panel">
                <div className="loading" />
            </div>
        )
    if (diff.status === 'error')
        return (
            <div className="files-panel">
                <div className="msg err">
                    Kon de gewijzigde bestanden niet laden. Klap de rij dicht en weer open om het opnieuw te proberen.
                </div>
            </div>
        )
    return (
        <FilesPanel
            files={diff.files}
            threads={review.threads[pr.number] ?? []}
            verdict={review.review[pr.number]}
            fixes={review.fixes}
        />
    )
}

export function PullRequestRow({ pr, review, note, expanded, mounted, onToggle, onSave }: Props) {
    const detail = useRef<HTMLTableRowElement>(null)
    const id = String(pr.number)
    const text = note?.text ?? ''
    const [day, clock] = formatDayAndClock(pr.updatedAt)
    const classes = ['row', pr.review === 'approved' && 'done', text && 'has-note'].filter(Boolean).join(' ')

    function reveal(selector: string, block: ScrollLogicalPosition) {
        onToggle(true)
        afterPaint(() => detail.current?.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block }))
    }

    function showThreads() {
        onToggle(true)
        loadDiff(pr.number)
            .then(() => afterPaint(() => reveal('.review-box', 'start')))
            .catch((error: Error) => console.warn('Diff laden mislukt', error))
    }

    return (
        <>
            <tr
                className={classes}
                data-pr={pr.number}
                data-link={pr.linkedTo ?? undefined}
                data-link-title={pr.linkedTo ? `#${pr.linkedTo} bouwt voort op #${pr.number}` : undefined}
                tabIndex={0}
                aria-expanded={expanded}
                title="Toon gewijzigde bestanden"
                onClick={(event) => {
                    if (event.target instanceof Element && event.target.closest('a, button, select, textarea')) return
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
                        <span className="step" title={`Merge-stap ${pr.step}`}>
                            {pr.step}
                        </span>
                    )}
                    <a className="prlink" href={pr.url} target="_blank" rel="noopener">
                        #{pr.number} ↗
                    </a>
                </td>
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
                    {pr.base && <span className="sub">{pr.base}</span>}
                    <div className="row-actions">
                        <button
                            type="button"
                            className="row-open"
                            title="Open of sluit de review threads, de diff en de notitie"
                            aria-label={`Details van PR ${pr.number}`}
                            onClick={() => onToggle()}
                        >
                            <span className="chev">▾</span>Details
                        </button>
                        {text && (
                            <button
                                type="button"
                                className="note-flag"
                                title={`Er staat een notitie van ${AUTHOR} bij deze PR. Klik om hem helemaal te lezen.`}
                                onClick={() => reveal('.note-box', 'center')}
                            >
                                ✎ Notitie voor Daan · lees
                            </button>
                        )}
                    </div>
                    {text && <span className="note-peek">{text}</span>}
                </td>
                <td className="diff">
                    <span className="add">+{formatCount(pr.add)}</span>{' '}
                    <span className="rem">−{formatCount(pr.rem)}</span>
                    <span className="files">{pr.files} bestanden</span>
                </td>
                <EnvironmentCell pr={pr} />
                <PipelineCell pr={pr} />
                <td>{pr.draft && <span className="pill draft">Draft</span>}</td>
                <td className="who">{pr.author}</td>
                {pr.reviewer ? <td className="who">{pr.reviewer}</td> : <td className="who none">Geen</td>}
                <ReviewCell pr={pr} review={review} onShowThreads={showThreads} />
                <PriorityCell pr={pr} priority={note?.priority ?? null} onSave={(patch) => onSave(id, patch)} />
                <EffortCell pr={pr} effort={note?.effort ?? null} onSave={(patch) => onSave(id, patch)} />
                <td className="upd">
                    <time dateTime={pr.updatedAt}>
                        {day}
                        <span>{clock}</span>
                    </time>
                </td>
            </tr>
            {mounted && (
                <tr className="detail" ref={detail} hidden={!expanded}>
                    <td colSpan={COLUMNS}>
                        <div className="note-host">
                            <NoteEditor id={id} note={note} onSave={onSave} />
                        </div>
                        <Detail pr={pr} review={review} />
                    </td>
                </tr>
            )}
        </>
    )
}
