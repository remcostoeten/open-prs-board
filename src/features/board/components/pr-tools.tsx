'use client'

import { useState } from 'react'

import { addLinkAction, moveInGroupAction, removeLinkAction, setGroupAction } from '@/features/board/actions'
import { useBoard, usePullRequest } from '@/features/board/components/board-context'
import type { PullRequestGroup } from '@/features/board/types'
import { ErrorNotice } from '@/features/errors/error-notice'
import type { ActionResult, PublicError } from '@/shared/errors/result'

type Props = {
    groups: PullRequestGroup[]
}

export function PullRequestTools({ groups }: Props) {
    const board = useBoard()
    const pr = usePullRequest()
    const [target, setTarget] = useState('')
    const [label, setLabel] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<PublicError | null>(null)
    const current = groups.find((group) => group.prs.includes(pr.id))
    const outgoing = board.links.filter((link) => link.fromId === pr.id)
    const incoming = board.links.filter((link) => link.toId === pr.id)
    const byId = new Map(board.prs.map((item) => [item.id, item]))
    const candidates = board.prs.filter((item) => item.id !== pr.id && !outgoing.some((link) => link.toId === item.id))

    async function run(task: () => Promise<ActionResult<null>>) {
        setBusy(true)
        setError(null)
        const result = await task()
        setBusy(false)
        if (!result.ok) setError(result.error)
        return result.ok
    }

    function name(id: string) {
        const item = byId.get(id)
        return item ? `#${item.number} ${item.title}` : 'onbekende PR'
    }

    return (
        <div className="pr-tools">
            <div className="tool">
                <span className="tool-label">Indeling</span>
                <select
                    aria-label="Groep van deze PR"
                    value={current?.id ?? ''}
                    disabled={busy}
                    onChange={(event) => void run(() => setGroupAction(pr.id, event.target.value || null))}
                >
                    <option value="">Geen groep</option>
                    {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                            {group.title}
                        </option>
                    ))}
                </select>
                {current && (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void run(() => moveInGroupAction(pr.id, -1))}
                            aria-label="Omhoog in de groep"
                        >
                            ↑
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void run(() => moveInGroupAction(pr.id, 1))}
                            aria-label="Omlaag in de groep"
                        >
                            ↓
                        </button>
                    </>
                )}
            </div>
            <form
                className="tool"
                onSubmit={async (event) => {
                    event.preventDefault()
                    if (!target) return
                    if (await run(() => addLinkAction(pr.id, target, label || null))) {
                        setTarget('')
                        setLabel('')
                    }
                }}
            >
                <span className="tool-label">Pijl naar</span>
                <select aria-label="Pijl naar PR" value={target} onChange={(event) => setTarget(event.target.value)}>
                    <option value="">Kies een PR</option>
                    {candidates.map((item) => (
                        <option key={item.id} value={item.id}>
                            #{item.number} {item.title.slice(0, 60)}
                        </option>
                    ))}
                </select>
                <input
                    aria-label="Label van de pijl"
                    placeholder="Label (optioneel)"
                    value={label}
                    maxLength={80}
                    onChange={(event) => setLabel(event.target.value)}
                />
                <button type="submit" disabled={busy || !target}>
                    Toevoegen
                </button>
            </form>
            {(outgoing.length > 0 || incoming.length > 0) && (
                <ul className="link-list">
                    {outgoing.map((link) => (
                        <li key={link.id}>
                            → {name(link.toId)}
                            {link.label && <span className="link-label">{link.label}</span>}
                            {link.origin === 'derived' && <span className="link-origin">uit branches</span>}
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(() => removeLinkAction(link.id))}
                            >
                                Verwijderen
                            </button>
                        </li>
                    ))}
                    {incoming.map((link) => (
                        <li key={link.id}>
                            ← {name(link.fromId)}
                            {link.label && <span className="link-label">{link.label}</span>}
                            {link.origin === 'derived' && <span className="link-origin">uit branches</span>}
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => void run(() => removeLinkAction(link.id))}
                            >
                                Verwijderen
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {error && <ErrorNotice error={error} compact />}
        </div>
    )
}
