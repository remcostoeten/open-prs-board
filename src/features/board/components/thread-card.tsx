'use client'

import { useState } from 'react'

import { DiffExcerpt, FixBlock } from '@/features/board/components/diff-view'
import { AUTHOR, THREAD_STATUS } from '@/features/board/copy'
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
    if (thread.status === 'resolved') return 'Thread staat op resolved in Bitbucket.'
    if (thread.status === 'open')
        return `Nog geen reactie van ${AUTHOR} en geen wijziging aan dit bestand sinds de comment van ${thread.who}.`
    const bits: string[] = []
    if (thread.changed && thread.changedAt)
        bits.push(`bestand gewijzigd in ${thread.changed} op ${formatDateTime(thread.changedAt)}`)
    if (thread.replied) bits.push(`${AUTHOR} heeft geantwoord`)
    const summary = bits.join(' en ').replace(/^./, (first) => first.toUpperCase())
    return `${summary} na de comment van ${thread.who}. ${thread.who} is aan zet om opnieuw te kijken.`
}

function location(thread: ReviewThread) {
    if (!thread.path) return 'Algemene comment'
    if (!thread.line) return thread.path
    return `${thread.path}:${thread.lineFrom ? `${thread.lineFrom}–` : ''}${thread.line}`
}

export function ThreadCard({ thread, siblings = [], fix, file, onJump }: Props) {
    const [missing, setMissing] = useState(false)
    const mine = thread.messages.filter((message) => message.who === AUTHOR)
    const lastReply = mine.at(-1)
    const path = thread.path

    return (
        <div className={`thread s-${thread.status}`}>
            <div className="thread-top">
                <span className={`tstat ${thread.status}`}>
                    {THREAD_STATUS[thread.status].replace('Daan', thread.who)}
                </span>
                {lastReply && (
                    <span
                        className="tstat replied"
                        title={`${AUTHOR} heeft op deze opmerking geantwoord. Scroll naar het oranje bericht.`}
                    >
                        ✓ {AUTHOR} heeft gereageerd · {formatDateTime(lastReply.at)}
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
                <a className="tlink" href={thread.url} target="_blank" rel="noopener">
                    Bitbucket ↗
                </a>
            </div>
            {siblings.length > 0 && (
                <div className="tsame">
                    <span>Zelfde thread op {siblings.length + 1} bestanden:</span>
                    <ul>
                        {[thread, ...siblings].map((item) => (
                            <li key={item.id}>
                                <a href={item.url} target="_blank" rel="noopener">
                                    {item.path}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div className="tmsgs">
                {thread.messages.map((message, index) => (
                    <div key={index} className={`tmsg ${message.who === AUTHOR ? 'me' : ''}`}>
                        <span className="tav">{message.who.slice(0, 1)}</span>
                        <span className="tby">
                            <b>{message.who}</b>
                            <time>{formatDateTime(message.at)}</time>
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
        </div>
    )
}
