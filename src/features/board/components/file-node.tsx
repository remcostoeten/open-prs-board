'use client'

import { Fragment } from 'react'

import { Code, DiffLine } from '@/features/board/components/diff-view'
import { ThreadCard } from '@/features/board/components/thread-card'
import { AUTHOR, THREAD_STATUS } from '@/features/board/copy'
import { parseDiff } from '@/features/board/diff'
import type { DiffFile, ReviewData, ReviewThread, ThreadStatus } from '@/features/board/types'

type FileNodeProps = {
    file: DiffFile
    max: number
    threads: ReviewThread[]
    fixes: ReviewData['fixes']
    open: boolean
    onToggle: (open: boolean) => void
}

const SEVERITY: ThreadStatus[] = ['open', 'recheck', 'resolved']

function FileDiff({ file, threads, fixes }: Pick<FileNodeProps, 'file' | 'threads' | 'fixes'>) {
    function loose(items: ReviewThread[]) {
        return items.map((thread) => <ThreadCard key={thread.id} thread={thread} fix={fixes[thread.id]} />)
    }
    if (file.binary)
        return (
            <>
                {loose(threads)}
                <div className="msg">Binair bestand, geen tekst-diff.</div>
            </>
        )
    if (!file.diff)
        return (
            <>
                {loose(threads)}
                <div className="msg">Geen inhoudelijke wijzigingen (alleen mode of rename).</div>
            </>
        )
    const rows = parseDiff(file.diff)
    const lines = new Set(rows.flatMap((row) => (row.kind === 'line' && row.new !== null ? [row.new] : [])))
    return (
        <>
            {loose(threads.filter((thread) => thread.line === null || !lines.has(thread.line)))}
            <Code added={file.status === 'added'}>
                {rows.map((row, index) => (
                    <Fragment key={index}>
                        <DiffLine row={row} />
                        {row.kind === 'line' &&
                            row.new !== null &&
                            threads
                                .filter((thread) => thread.line === row.new)
                                .map((thread) => (
                                    <tr key={thread.id} className="thread-row" data-thread={thread.id}>
                                        <td colSpan={4}>
                                            <ThreadCard thread={thread} fix={fixes[thread.id]} />
                                        </td>
                                    </tr>
                                ))}
                    </Fragment>
                ))}
            </Code>
            {file.truncated && (
                <div className="msg">Diff afgekapt op 150 KB. Open de PR in Bitbucket voor de rest.</div>
            )}
        </>
    )
}

function Marks({ threads }: { threads: ReviewThread[] }) {
    if (!threads.length) return null
    const worst = SEVERITY.find((status) => threads.some((thread) => thread.status === status))
    const answered = threads.filter((thread) => thread.replied).length
    return (
        <>
            <span
                className={`cmark ${worst}`}
                title={threads
                    .map((thread) => `${THREAD_STATUS[thread.status]}${thread.line ? ` (regel ${thread.line})` : ''}`)
                    .join('\n')}
            >
                {threads.length} comment{threads.length === 1 ? '' : 's'}
            </span>{' '}
            {answered > 0 && (
                <>
                    <span className="cmark replied" title={`${AUTHOR} heeft hierop geantwoord`}>
                        {answered === threads.length ? '✓ beantwoord' : `✓ ${answered} beantwoord`}
                    </span>{' '}
                </>
            )}
        </>
    )
}

export function FileNode({ file, max, threads, fixes, open, onToggle }: FileNodeProps) {
    const cut = file.path.lastIndexOf('/')
    const total = file.add + file.rem
    const width = Math.max(total / max, total ? 0.06 : 0) * 100
    return (
        <details className="file" data-path={file.path} open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
            <summary>
                <span className={`st ${file.status}`}>{file.status}</span>
                <span className="fpath" title={file.path}>
                    <bdi>
                        {cut >= 0 && <span className="dir">{file.path.slice(0, cut + 1)}</span>}
                        {file.path.slice(cut + 1)}
                        {file.old && <span className="dir">{`  ← ${file.old}`}</span>}
                    </bdi>
                </span>
                <span className="fstat">
                    <Marks threads={threads} />
                    <span className="add">+{file.add}</span> <span className="rem">−{file.rem}</span>
                </span>
                <span className="bar">
                    <i className="a" style={{ width: `${total ? (file.add / total) * width : 0}%` }} />
                    <i className="r" style={{ width: `${total ? (file.rem / total) * width : 0}%` }} />
                </span>
            </summary>
            {open && <FileDiff file={file} threads={threads} fixes={fixes} />}
        </details>
    )
}
