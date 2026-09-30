'use client'

import Link from 'next/link'

import type { PublicError } from '@/shared/errors/result'

type Props = {
    error: PublicError
    onRetry?: () => void
    compact?: boolean
}

export function ErrorNotice({ error, onRetry, compact = false }: Props) {
    return (
        <div className={compact ? 'notice bad compact' : 'notice bad'} role="alert">
            <p>{error.message}</p>
            <div className="notice-actions">
                {error.recovery === 'retry' && onRetry && (
                    <button type="button" onClick={onRetry}>
                        Opnieuw proberen
                    </button>
                )}
                {error.recovery === 'reauthenticate' && <Link href="/settings#accounts">Opnieuw inloggen</Link>}
                {error.recovery === 'reconnect_repository' && (
                    <Link href="/settings#repositories">Repository opnieuw koppelen</Link>
                )}
                {error.reference && <span className="notice-ref">Referentie {error.reference}</span>}
            </div>
        </div>
    )
}
