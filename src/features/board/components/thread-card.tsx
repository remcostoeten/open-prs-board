'use client'

import { useState } from 'react'

import { addCommentAction, resolveThreadAction } from '@/features/board/actions'
import { useBoard, usePullRequest } from '@/features/board/components/board-context'
import { CommentForm } from '@/features/board/components/comment-form'
import { DiffExcerpt, FixBlock } from '@/features/board/components/diff-view'
import { Editable } from '@/features/board/components/editable'
import { PROVIDER_LABEL, THREAD_STATUS } from '@/features/board/copy'
import { formatDateTime } from '@/features/board/format'
import type { DiffFile, ReviewThread, ThreadFix, ThreadID } from '@/features/board/types'

export type GroupedThread = ReviewThread & { siblings: ReviewThread[] }

type Props = {
    thread: ReviewThread
    siblings?: ReviewThread[]
    fix: ThreadFix | undefined
    file?: DiffFile
    onJump?: (path: string, thread: ThreadID) => boolean
}

function statusNote(thread: ReviewThread) {
    if (thread.status === 'resolved')
        return thread.resolvedBy ? `Resolved door ${thread.resolvedBy} op het bord.` : 'Thread staat op resolved.'
    if (thread.status === 'open')
        return `Nog geen reactie en geen wijziging aan dit bestand sinds de comment van ${thread.who}.`
    const bits: string[] = []
    if (thread.changed && thread.changedAt)
        bits.push(`bestand gewijzigd in ${thread.changed} op ${formatDateTime(thread.changedAt)}`)
    if (thread.replied) bits.push('er is geantwoord')
    const summary = bits.join(' en ').replace(/^./, (first) => first.toUpperCase())
    return `${summary} na de comment van ${thread.who}. ${thread.who} is aan zet om opnieuw te kijken.`
}

function location(thread: ReviewThread) {
    if (!thread.path) return 'Algemene comment'
    if (!thread.line) return thread.path
    return `${thread.path}:${thread.lineFrom ? `${thread.lineFrom}–` : ''}${thread.line}`
}

export function ThreadCard({ thread, siblings = [], fix, file, onJump }: Props) {
    const board = useBoard()
    const pr = usePullRequest()
    const [missing, setMissing] = useState(false)
    const [replying, setReplying] = useState(false)
    const [busy, setBusy] = useState(false)
    const path = thread.path
    const lastReply = thread.messages.slice(1).findLast((message) => message.who !== thread.who)

    async function toggleResolved() {
        setBusy(true)
        await resolveThreadAction(thread.id, thread.status !== 'resolved')
        setBusy(false)
    }

    return (
        <div className={`thread s-${thread.status}`}>
            <div className="thread-top">
                <span className={`tstat ${thread.status}`}>{THREAD_STATUS[thread.status]}</span>
                {thread.origin === 'board' && <span className="tstat board">Op het bord</span>}
                {lastReply && (
                    <span className="tstat replied" title={`${lastReply.who} heeft op deze opmerking geantwoord.`}>
                        ✓ {lastReply.who} heeft gereageerd · {formatDateTime(lastReply.at)}
                    </span>
                )}
                {path && onJump ? (
                    <button
                        type="button"
                        className={missing ? 'tjump missing' : 'tjump'}
                        title={
                            missing
                                ? 'Dit bestand zit niet in de huidige diff'
                                : 'Open dit bestand in de diff hieronder'
                        }
                        onClick={() => setMissing(!onJump(path, thread.id))}
                    >
                        <span className="twhere">{location(thread)}</span>
                    </button>
                ) : (
                    <span className="twhere">{location(thread)}</span>
                )}
                {thread.url && (
                    <a className="tlink" href={thread.url} target="_blank" rel="noopener">
                        {PROVIDER_LABEL[pr.provider] ?? 'Bron'} ↗
                    </a>
                )}
            </div>
            {siblings.length > 0 && (
                <div className="tsame">
                    <span>Zelfde thread op {siblings.length + 1} bestanden:</span>
                    <ul>
                        {[thread, ...siblings].map((item) => (
                            <li key={item.id}>
                                {item.url ? (
                                    <a href={item.url} target="_blank" rel="noopener">
                                        {item.path}
                                    </a>
                                ) : (
                                    item.path
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div className="tmsgs">
                {thread.messages.map((message) => (
                    <div key={message.id} className={`tmsg ${message.authorId === board.viewer.id ? 'me' : ''}`}>
                        <span className="tav">{message.who.slice(0, 1)}</span>
                        <span className="tby">
                            <b>{message.who}</b>
                            <time>{formatDateTime(message.at)}</time>
                            {message.origin === 'board' && thread.origin === 'provider' && (
                                <span className="tvia">via het bord</span>
                            )}
                        </span>
                        <p>{message.text}</p>
                    </div>
                ))}
            </div>
            {fix ? (
                <FixBlock thread={thread} fix={fix} />
            ) : (
                file?.diff && <DiffExcerpt file={file} line={thread.line} />
            )}
            <p className={`tnote ${thread.replied ? 'replied' : ''}`}>{statusNote(thread)}</p>
            <Editable fallback={null}>
                {replying ? (
                    <CommentForm
                        label={`Antwoord op ${thread.who}`}
                        placeholder="Antwoord op het bord. Dit gaat niet naar de provider."
                        submitLabel="Antwoorden"
                        autoFocus
                        onSubmit={(body) => addCommentAction(thread.id, body)}
                        onCancel={() => setReplying(false)}
                    />
                ) : (
                    <div className="thread-actions">
                        <button type="button" onClick={() => setReplying(true)}>
                            Antwoorden
                        </button>
                        {(thread.status !== 'resolved' || thread.resolvedBy) && (
                            <button type="button" disabled={busy} onClick={() => void toggleResolved()}>
                                {thread.status === 'resolved' ? 'Heropenen' : 'Resolve'}
                            </button>
                        )}
                    </div>
                )}
            </Editable>
        </div>
    )
}
