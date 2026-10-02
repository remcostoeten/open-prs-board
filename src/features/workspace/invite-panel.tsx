'use client'

import { useRef, useState } from 'react'

import { ErrorNotice } from '@/features/errors/error-notice'
import { cancelInvitationAction, inviteAction } from '@/features/workspace/actions'
import type { PublicError } from '@/shared/errors/result'

type Pending = {
    id: string
    email: string
    role: string
    expiresAt: string
}

type Props = {
    baseUrl: string
    pending: Pending[]
}

function CopyLink({ url }: { url: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <span className="copy-link">
            <input
                readOnly
                value={url}
                aria-label="Uitnodigingslink"
                onFocus={(event) => event.currentTarget.select()}
            />
            <button
                type="button"
                onClick={() => {
                    void navigator.clipboard
                        .writeText(url)
                        .then(() => setCopied(true))
                        .catch(() => setCopied(false))
                }}
            >
                {copied ? 'Gekopieerd' : 'Kopieer link'}
            </button>
        </span>
    )
}

export function InvitePanel({ baseUrl, pending }: Props) {
    const [email, setEmail] = useState('')
    const [role, setRole] = useState('member')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<PublicError | null>(null)
    const [created, setCreated] = useState<string | null>(null)
    const [animate, setAnimate] = useState(false)
    const pointerSubmit = useRef(false)

    return (
        <div className="invite-panel">
            <h3>Collega uitnodigen</h3>
            <p className="lede">
                Er gaat nog geen e-mail uit. Kopieer de link en stuur hem zelf. De link werkt alleen voor dit
                e-mailadres, is 7 dagen geldig en vraagt om een geverifieerd e-mailadres.
            </p>
            <form
                className="inline-form"
                onKeyDownCapture={() => {
                    pointerSubmit.current = false
                }}
                onSubmit={async (event) => {
                    event.preventDefault()
                    const shouldAnimate = pointerSubmit.current
                    pointerSubmit.current = false
                    setBusy(true)
                    setError(null)
                    const result = await inviteAction(email, role)
                    setBusy(false)
                    if (result.ok) {
                        setAnimate(shouldAnimate)
                        setCreated(`${baseUrl}/invite/${result.value.id}`)
                        setEmail('')
                    } else setError(result.error)
                }}
            >
                <input
                    type="email"
                    required
                    placeholder="naam@bedrijf.nl"
                    aria-label="E-mailadres"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                />
                <select aria-label="Rol" value={role} onChange={(event) => setRole(event.target.value)}>
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                </select>
                <button
                    type="submit"
                    className="primary"
                    disabled={busy}
                    onClick={(event) => {
                        pointerSubmit.current = event.detail > 0
                    }}
                >
                    Link maken
                </button>
            </form>
            {error && <ErrorNotice error={error} compact />}
            {created && (
                <div className="notice ok invitation-success" data-motion={animate} role="status">
                    <p>Uitnodiging gemaakt. Stuur deze link naar je collega:</p>
                    <CopyLink url={created} />
                </div>
            )}
            {pending.length > 0 && (
                <ul className="plain-list">
                    {pending.map((item) => (
                        <li key={item.id}>
                            <span>
                                {item.email} · {item.role} · verloopt {item.expiresAt}
                            </span>
                            <CopyLink url={`${baseUrl}/invite/${item.id}`} />
                            <button
                                type="button"
                                className="danger"
                                onClick={() => void cancelInvitationAction(item.id)}
                            >
                                Intrekken
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
