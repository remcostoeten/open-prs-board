'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { PROVIDER_LABEL } from '@/features/board/copy'
import { formatDateTime } from '@/features/board/format'
import type { RepositorySummary, Role } from '@/features/board/types'
import { ErrorNotice } from '@/features/errors/error-notice'
import { deleteRepositoryAction, reconnectRepositoryAction, syncNowAction } from '@/features/sync/actions'
import type { SyncPhase } from '@/features/sync/types'
import { ERRORS } from '@/shared/errors/codes'
import { publicMessage, type ActionResult, type PublicError } from '@/shared/errors/result'

type Props = {
    repositories: RepositorySummary[]
    role: Role
}

const POLL_MS = 3_000

const PHASE: Record<SyncPhase, string> = {
    pull_requests: 'open PR’s ophalen',
    closed_pull_requests: 'gesloten PR’s van de laatste 30 dagen ophalen',
    threads: 'review threads ophalen',
    links: 'pijlen bijwerken',
}

function isSyncing(repo: RepositorySummary) {
    return repo.sync?.status === 'queued' || repo.sync?.status === 'running'
}

/**
 * @name useAutoRefresh
 * @description Refreshes the server-rendered page every few seconds while `active` and whenever the window regains
 * focus, so sync progress and colleagues' comments show up without a reload.
 *
 * @example
 * useAutoRefresh(repositories.some(isSyncing))
 */
export function useAutoRefresh(active: boolean) {
    const router = useRouter()
    useEffect(() => {
        function onFocus() {
            router.refresh()
        }
        window.addEventListener('focus', onFocus)
        const timer = active ? setInterval(() => router.refresh(), POLL_MS) : null
        return () => {
            window.removeEventListener('focus', onFocus)
            if (timer) clearInterval(timer)
        }
    }, [active, router])
}

function Disconnected({ repo }: { repo: RepositorySummary }) {
    const [confirming, setConfirming] = useState(false)
    const [name, setName] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<PublicError | null>(null)

    async function run(task: () => Promise<ActionResult<null>>) {
        setBusy(true)
        setError(null)
        const result = await task()
        setBusy(false)
        if (!result.ok) setError(result.error)
    }

    return (
        <div className="notice warn" role="status">
            <p>
                <b>{repo.slug}</b> is ontkoppeld: niemand in de workspace heeft nog toegang bij{' '}
                {PROVIDER_LABEL[repo.provider]}. De synchronisatie is gestopt. Alleen owners en admins zien de bestaande
                gegevens, alleen-lezen.
            </p>
            {repo.purgeAfter && (
                <p className="deadline">
                    De gegevens worden definitief verwijderd op <b>{formatDateTime(repo.purgeAfter)}</b>.
                </p>
            )}
            <div className="notice-actions">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => reconnectRepositoryAction(repo.id))}
                >
                    Opnieuw koppelen
                </button>
                {confirming ? (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault()
                            void run(() => deleteRepositoryAction(repo.id, name))
                        }}
                    >
                        <label>
                            Typ <code>{repo.slug}</code> om te bevestigen
                            <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
                        </label>
                        <button type="submit" className="danger" disabled={busy || name !== repo.slug}>
                            Definitief verwijderen
                        </button>
                    </form>
                ) : (
                    <button type="button" className="danger" onClick={() => setConfirming(true)}>
                        Nu verwijderen
                    </button>
                )}
            </div>
            {error && <ErrorNotice error={error} compact />}
        </div>
    )
}

function Failed({ repo }: { repo: RepositorySummary }) {
    const [busy, setBusy] = useState(false)
    const code = repo.sync?.errorCode ?? repo.lastErrorCode ?? 'unknown'
    const error: PublicError = {
        code,
        message: `${repo.slug}: ${publicMessage(code, repo.provider)}`,
        recovery: ERRORS[code].recovery,
        reference: repo.sync?.reference ?? null,
    }
    return (
        <ErrorNotice
            error={busy ? { ...error, message: `${repo.slug}: opnieuw proberen…` } : error}
            onRetry={() => {
                setBusy(true)
                void syncNowAction(repo.id).finally(() => setBusy(false))
            }}
        />
    )
}

export function SyncPanel({ repositories, role }: Props) {
    const syncing = repositories.filter(isSyncing)
    useAutoRefresh(syncing.length > 0)
    const manager = role === 'owner' || role === 'admin'
    if (repositories.length === 0)
        return (
            <div className="notice">
                <p>Deze workspace heeft nog geen repositories.</p>
                {manager ? (
                    <div className="notice-actions">
                        <Link href="/onboarding/repositories">Repositories koppelen</Link>
                    </div>
                ) : (
                    <p>Vraag een owner of admin om repositories te koppelen.</p>
                )}
            </div>
        )
    const partial = repositories.filter((repo) => !isSyncing(repo) && repo.sync?.status === 'partial')
    const disconnected = repositories.filter((repo) => repo.status === 'disconnected')
    const failed = repositories.filter(
        (repo) =>
            !isSyncing(repo) &&
            repo.status !== 'disconnected' &&
            (repo.status === 'needs_auth' || repo.status === 'error' || repo.sync?.status === 'failed'),
    )
    if (syncing.length + partial.length + disconnected.length + failed.length === 0) return null
    return (
        <div className="sync-panel">
            {syncing.map((repo) => (
                <div key={repo.id} className="notice" role="status">
                    <span className="live" aria-hidden="true" />
                    <b>{repo.slug}</b> synchroniseert
                    {repo.sync?.phase ? `: ${PHASE[repo.sync.phase]}` : ''}. Het bord vult zich vanzelf.
                </div>
            ))}
            {disconnected.map((repo) => (
                <Disconnected key={repo.id} repo={repo} />
            ))}
            {failed.map((repo) => (
                <Failed key={repo.id} repo={repo} />
            ))}
            {partial.map((repo) => (
                <div key={repo.id} className="notice warn" role="status">
                    <b>{repo.slug}</b> is gedeeltelijk gesynchroniseerd
                    {repo.sync?.errorCode ? `: ${publicMessage(repo.sync.errorCode, repo.provider)}` : '.'} De rest
                    volgt automatisch.
                </div>
            ))}
        </div>
    )
}
