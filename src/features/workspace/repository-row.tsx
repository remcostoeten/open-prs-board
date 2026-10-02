'use client'

import { useState } from 'react'

import { PROVIDER_LABEL } from '@/features/board/copy'
import { formatDateTime } from '@/features/board/format'
import type { RepositorySummary } from '@/features/board/types'
import { syncNowAction } from '@/features/sync/actions'

type Props = {
    repo: RepositorySummary
    manager: boolean
    webhook: { url: string; secret: string } | null
}

const STATUS: Record<RepositorySummary['status'], string> = {
    pending: 'Wacht op eerste sync',
    active: 'Actief',
    needs_auth: 'Opnieuw inloggen nodig',
    disconnected: 'Ontkoppeld',
    error: 'Fout',
}

export function RepositoryRow({ repo, manager, webhook }: Props) {
    const [busy, setBusy] = useState(false)
    const [showHook, setShowHook] = useState(false)
    const [animate, setAnimate] = useState(false)
    return (
        <>
            <tr>
                <td>
                    <a href={repo.url} target="_blank" rel="noopener">
                        {repo.slug}
                    </a>
                    <span className="sub">{PROVIDER_LABEL[repo.provider]}</span>
                </td>
                <td>{STATUS[repo.status]}</td>
                <td>{repo.lastSyncedAt ? formatDateTime(repo.lastSyncedAt) : 'Nog niet'}</td>
                <td className="actions">
                    {repo.status !== 'disconnected' && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                                setBusy(true)
                                void syncNowAction(repo.id).finally(() => setBusy(false))
                            }}
                        >
                            Nu synchroniseren
                        </button>
                    )}
                    {manager && webhook && (
                        <button
                            type="button"
                            aria-expanded={showHook}
                            onClick={(event) => {
                                setAnimate(event.detail > 0)
                                setShowHook((value) => !value)
                            }}
                        >
                            Webhook
                        </button>
                    )}
                </td>
            </tr>
            {manager && webhook && (
                <tr className="webhook-row" data-open={showHook} data-motion={animate} inert={!showHook}>
                    <td colSpan={4}>
                        <div className="notice webhook-notice">
                            <p>
                                Voeg in {PROVIDER_LABEL[repo.provider]} een webhook toe voor pull request-events met
                                deze URL en dit geheim. Zonder webhook synchroniseert het bord elke 10 minuten.
                            </p>
                            <p>
                                URL <code>{webhook.url}</code>
                            </p>
                            <p>
                                Geheim <code>{webhook.secret}</code>
                            </p>
                        </div>
                    </td>
                </tr>
            )}
        </>
    )
}
