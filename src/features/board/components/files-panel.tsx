'use client'

import { useRef, useState } from 'react'

import { FileNode } from '@/features/board/components/file-node'
import { type GroupedThread, ThreadCard } from '@/features/board/components/thread-card'
import { formatCount } from '@/features/board/format'
import type { DiffFile, ReviewData, ReviewThread, ThreadID } from '@/features/board/types'

type Props = {
    files: DiffFile[]
    threads: ReviewThread[]
    verdict: ReviewData['review'][string]
    fixes: ReviewData['fixes']
}

const ORDER = { open: 0, recheck: 1, resolved: 2 }
const VERDICT = { changes_requested: 'heeft changes requested', approved: 'heeft approved, klaar' }

function groupThreads(threads: ReviewThread[]) {
    const groups = new Map<string, GroupedThread>()
    for (const thread of threads) {
        const key = JSON.stringify([thread.status, thread.replied, thread.messages.map((m) => [m.who, m.text])])
        const group = groups.get(key)
        if (group) group.siblings.push(thread)
        else groups.set(key, { ...thread, siblings: [] })
    }
    return [...groups.values()].toSorted((a, b) => ORDER[a.status] - ORDER[b.status])
}

function belongsTo(file: DiffFile, path: string | null) {
    return file.path === path || file.old === path
}

export function FilesPanel({ files, threads, verdict, fixes }: Props) {
    const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
    const panel = useRef<HTMLDivElement>(null)
    const add = files.reduce((sum, file) => sum + file.add, 0)
    const rem = files.reduce((sum, file) => sum + file.rem, 0)
    const max = Math.max(1, ...files.map((file) => file.add + file.rem))

    function toggle(path: string, next: boolean) {
        setOpen((current) => {
            if (current.has(path) === next) return current
            const updated = new Set(current)
            if (next) updated.add(path)
            else updated.delete(path)
            return updated
        })
    }

    function jump(path: string, thread: ThreadID) {
        if (!files.some((file) => file.path === path)) return false
        toggle(path, true)
        requestAnimationFrame(() =>
            requestAnimationFrame(() => {
                const host = panel.current
                const target =
                    host?.querySelector(`tr.thread-row[data-thread="${thread}"]`) ??
                    [...(host?.querySelectorAll<HTMLElement>('details.file') ?? [])].find(
                        (node) => node.dataset.path === path,
                    )
                target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }),
        )
        return true
    }

    return (
        <div className="files-panel" ref={panel}>
            {verdict && (threads.length > 0 || verdict.state) && (
                <div className="review-box">
                    <div className="files-head">
                        <span>
                            {verdict.who} {verdict.state ? VERDICT[verdict.state] : 'heeft nog niet gereviewd'} ·{' '}
                            {threads.length} review thread{threads.length === 1 ? '' : 's'}
                        </span>
                    </div>
                    {groupThreads(threads).map(({ siblings, ...thread }) => (
                        <ThreadCard
                            key={thread.id}
                            thread={thread}
                            siblings={siblings}
                            fix={fixes[thread.id]}
                            file={thread.path ? files.find((file) => belongsTo(file, thread.path)) : undefined}
                            onJump={jump}
                        />
                    ))}
                </div>
            )}
            <div className="files-head">
                <span>
                    {files.length} gewijzigd{files.length === 1 ? ' bestand' : 'e bestanden'} · +{formatCount(add)} −
                    {formatCount(rem)}
                </span>
                {files.length <= 60 && (
                    <button type="button" onClick={() => setOpen(new Set(files.map((file) => file.path)))}>
                        Alles openklappen
                    </button>
                )}
                <button type="button" onClick={() => setOpen(new Set())}>
                    Alles dichtklappen
                </button>
            </div>
            {files.map((file) => (
                <FileNode
                    key={file.path}
                    file={file}
                    max={max}
                    threads={threads.filter((thread) => belongsTo(file, thread.path))}
                    fixes={fixes}
                    open={open.has(file.path)}
                    onToggle={(next) => toggle(file.path, next)}
                />
            ))}
        </div>
    )
}
