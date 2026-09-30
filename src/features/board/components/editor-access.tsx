'use client'

import { Suspense, useActionState } from 'react'

import { signInAction, signOutAction } from '@/features/board/actions'
import { useCanWrite } from '@/features/board/components/editable'

function Access() {
    const [error, submit, pending] = useActionState(signInAction, '')
    if (useCanWrite())
        return (
            <form className="editor-access" action={signOutAction}>
                <span>Je bewerkt notities, prio en reviewtijd.</span>
                <button type="submit">Uitloggen</button>
            </form>
        )
    return (
        <details className="editor-access">
            <summary>Bewerken</summary>
            <form action={submit}>
                <label className="sr-only" htmlFor="passcode">
                    Toegangscode
                </label>
                <input id="passcode" name="passcode" type="password" autoComplete="current-password" required />
                <button type="submit" disabled={pending}>
                    Inloggen
                </button>
                {error && <span className="editor-error">{error}</span>}
            </form>
        </details>
    )
}

export function EditorAccess({ enabled }: { enabled: boolean }) {
    if (!enabled) return null
    return (
        <Suspense>
            <Access />
        </Suspense>
    )
}
