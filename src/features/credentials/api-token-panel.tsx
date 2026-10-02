'use client'

import { useState } from 'react'

import { removeBitbucketTokenAction, saveBitbucketTokenAction } from '@/features/credentials/actions'
import { ErrorNotice } from '@/features/errors/error-notice'
import type { PublicError } from '@/shared/errors/result'
import type { Nullable } from '@/store/semantic'

type StoredToken = {
    username: string
    displayName: string
    updatedAt: string
}

type Props = {
    defaultEmail: string
    stored: Nullable<StoredToken>
}

export function ApiTokenPanel({ defaultEmail, stored }: Props) {
    const [email, setEmail] = useState(stored?.username ?? defaultEmail)
    const [token, setToken] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<PublicError | null>(null)
    const [editing, setEditing] = useState(!stored)

    return (
        <div className="invite-panel">
            <h3>Bitbucket met een API-token</h3>
            <p className="lede">
                Voor als je workspace geen OAuth-consumer toestaat. Maak een API-token met scopes op{' '}
                <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">
                    id.atlassian.com
                </a>{' '}
                voor de app Bitbucket, met alleen leesrechten: <code>read:user:bitbucket</code>,{' '}
                <code>read:repository:bitbucket</code> en <code>read:pullrequest:bitbucket</code>. Vul hier het
                e-mailadres van je Atlassian-account en de token in. De token wordt versleuteld opgeslagen.
            </p>
            {stored && !editing && (
                <ul className="plain-list">
                    <li>
                        <span>
                            Gekoppeld als <b>{stored.displayName}</b> · {stored.username} · bijgewerkt{' '}
                            {stored.updatedAt}
                        </span>
                        <button type="button" onClick={() => setEditing(true)}>
                            Token vervangen
                        </button>
                        <button
                            type="button"
                            className="danger"
                            disabled={busy}
                            onClick={async () => {
                                setBusy(true)
                                const result = await removeBitbucketTokenAction()
                                setBusy(false)
                                if (result.ok) setEditing(true)
                                else setError(result.error)
                            }}
                        >
                            Verwijderen
                        </button>
                    </li>
                </ul>
            )}
            {editing && (
                <form
                    className="inline-form"
                    onSubmit={async (event) => {
                        event.preventDefault()
                        setBusy(true)
                        setError(null)
                        const result = await saveBitbucketTokenAction(email, token)
                        setBusy(false)
                        if (result.ok) {
                            setToken('')
                            setEditing(false)
                        } else setError(result.error)
                    }}
                >
                    <input
                        type="email"
                        required
                        autoComplete="username"
                        placeholder="naam@bedrijf.nl"
                        aria-label="E-mailadres van je Atlassian-account"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                    />
                    <input
                        type="password"
                        required
                        minLength={20}
                        autoComplete="off"
                        placeholder="API-token"
                        aria-label="API-token"
                        value={token}
                        onChange={(event) => setToken(event.target.value)}
                    />
                    <button type="submit" className="primary" disabled={busy}>
                        {busy ? 'Controleren…' : 'Opslaan'}
                    </button>
                    {stored && (
                        <button type="button" onClick={() => setEditing(false)}>
                            Annuleren
                        </button>
                    )}
                </form>
            )}
            {error && <ErrorNotice error={error} compact />}
        </div>
    )
}
