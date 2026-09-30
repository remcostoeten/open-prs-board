'use client'

import { useEffect, useState } from 'react'

import { linkProviderAction } from '@/features/auth/actions'
import { PROVIDER_LABEL } from '@/features/board/copy'
import { ErrorNotice } from '@/features/errors/error-notice'
import { connectRepositoriesAction, listRepositoriesAction, type RepositoryOption } from '@/features/onboarding/actions'
import type { ProviderId } from '@/features/providers/types'
import type { PublicError } from '@/shared/errors/result'

type Props = {
    providers: { id: ProviderId; linked: boolean }[]
}

type ListState =
    | { status: 'loading' }
    | { status: 'error'; error: PublicError }
    | { status: 'ready'; repositories: RepositoryOption[] }

const FAILED: PublicError = {
    code: 'unknown',
    message: 'De lijst kon niet worden geladen.',
    recovery: 'retry',
    reference: null,
}

export function RepositoryPicker({ providers }: Props) {
    const [provider, setProvider] = useState<ProviderId>(providers[0]?.id ?? 'snapshot')
    const [attempt, setAttempt] = useState(0)
    const [settled, setSettled] = useState<{ key: string; list: ListState } | null>(null)
    const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
    const [search, setSearch] = useState('')
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<PublicError | null>(null)
    const current = providers.find((entry) => entry.id === provider)
    const key = `${provider}:${attempt}`
    const list: ListState | null = !current?.linked ? null : settled?.key === key ? settled.list : { status: 'loading' }

    useEffect(() => {
        if (!current?.linked) return
        let active = true
        listRepositoriesAction(provider)
            .then((result) => {
                if (!active) return
                setSettled({
                    key,
                    list: result.ok
                        ? { status: 'ready', repositories: result.value }
                        : { status: 'error', error: result.error },
                })
            })
            .catch(() => active && setSettled({ key, list: { status: 'error', error: FAILED } }))
        return () => {
            active = false
        }
    }, [provider, current?.linked, key])

    function toggle(id: string) {
        setSelected((value) => {
            const next = new Set(value)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    async function connect() {
        setSaving(true)
        setSaveError(null)
        const result = await connectRepositoriesAction(provider, [...selected]).catch(
            () => ({ ok: false, error: FAILED }) as const,
        )
        if (result.ok) {
            window.location.assign('/board')
            return
        }
        setSaveError(result.error)
        setSaving(false)
    }

    const query = search.trim().toLowerCase()
    const shown =
        list?.status === 'ready'
            ? list.repositories.filter((repo) => !query || repo.slug.toLowerCase().includes(query))
            : []
    const owners = Map.groupBy(shown, (repo) => repo.owner)

    return (
        <div className="picker">
            <div className="tabs" role="tablist" aria-label="Provider">
                {providers.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={entry.id === provider}
                        onClick={() => {
                            setProvider(entry.id)
                            setSelected(new Set())
                        }}
                    >
                        {entry.id === 'snapshot' ? 'Demo-snapshot' : PROVIDER_LABEL[entry.id]}
                    </button>
                ))}
            </div>
            {current && !current.linked && (
                <form action={linkProviderAction} className="notice">
                    <p>Koppel eerst je {PROVIDER_LABEL[provider]}-account om je repositories te zien.</p>
                    <input type="hidden" name="provider" value={provider} />
                    <input type="hidden" name="next" value="/onboarding/repositories" />
                    <button type="submit" className="primary">
                        {PROVIDER_LABEL[provider]} koppelen
                    </button>
                </form>
            )}
            {list?.status === 'loading' && <div className="loading" />}
            {list?.status === 'error' && (
                <ErrorNotice error={list.error} onRetry={() => setAttempt((value) => value + 1)} />
            )}
            {list?.status === 'ready' && list.repositories.length === 0 && (
                <div className="notice">
                    <p>
                        Geen repositories gevonden voor dit {PROVIDER_LABEL[provider]}-account. Controleer of je lid
                        bent van de workspace of organisatie waar de repositories staan, en of je bij het koppelen
                        toegang tot repositories hebt gegeven.
                    </p>
                    <div className="notice-actions">
                        <button type="button" onClick={() => setAttempt((value) => value + 1)}>
                            Lijst verversen
                        </button>
                        <form action={linkProviderAction}>
                            <input type="hidden" name="provider" value={provider} />
                            <input type="hidden" name="next" value="/onboarding/repositories" />
                            <button type="submit">Ander account koppelen</button>
                        </form>
                    </div>
                </div>
            )}
            {list?.status === 'ready' && list.repositories.length > 0 && (
                <>
                    <input
                        className="search"
                        type="search"
                        placeholder="Zoek een repository"
                        aria-label="Zoek een repository"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                    <div className="repo-list">
                        {[...owners].map(([owner, repos]) => (
                            <fieldset key={owner}>
                                <legend>{owner}</legend>
                                {repos.map((repo) => (
                                    <label key={repo.externalId} className={repo.connected ? 'connected' : ''}>
                                        <input
                                            type="checkbox"
                                            checked={repo.connected || selected.has(repo.externalId)}
                                            disabled={repo.connected}
                                            onChange={() => toggle(repo.externalId)}
                                        />
                                        <span>{repo.slug}</span>
                                        {repo.connected && <span className="pill idle">Al gekoppeld</span>}
                                        {repo.private && <span className="pill idle">Privé</span>}
                                    </label>
                                ))}
                            </fieldset>
                        ))}
                    </div>
                    {saveError && <ErrorNotice error={saveError} onRetry={() => void connect()} />}
                    <div className="picker-bar">
                        <span>{selected.size} gekozen</span>
                        <button
                            type="button"
                            className="primary"
                            disabled={selected.size === 0 || saving}
                            onClick={() => void connect()}
                        >
                            {saving ? 'Koppelen…' : 'Koppelen en bord openen'}
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}
