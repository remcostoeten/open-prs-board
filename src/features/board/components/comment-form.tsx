'use client'

import { useId, useState } from 'react'

import { ErrorNotice } from '@/features/errors/error-notice'
import type { ActionResult, PublicError } from '@/shared/errors/result'

type Props = {
    label: string
    placeholder: string
    submitLabel: string
    autoFocus?: boolean
    onSubmit: (body: string) => Promise<ActionResult<null>>
    onCancel?: () => void
}

const FAILED: PublicError = {
    code: 'unknown',
    message: 'Versturen mislukt. Probeer het opnieuw.',
    recovery: 'retry',
    reference: null,
}

export function CommentForm({ label, placeholder, submitLabel, autoFocus = false, onSubmit, onCancel }: Props) {
    const id = useId()
    const [body, setBody] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<PublicError | null>(null)

    async function send() {
        if (!body.trim()) return
        setBusy(true)
        setError(null)
        const result = await onSubmit(body).catch(() => ({ ok: false, error: FAILED }) as const)
        setBusy(false)
        if (result.ok) {
            setBody('')
            onCancel?.()
        } else setError(result.error)
    }

    return (
        <form
            className="comment-form"
            onSubmit={(event) => {
                event.preventDefault()
                void send()
            }}
        >
            <label className="sr-only" htmlFor={id}>
                {label}
            </label>
            <textarea
                id={id}
                rows={2}
                value={body}
                placeholder={placeholder}
                autoFocus={autoFocus}
                onChange={(event) => setBody(event.target.value)}
                onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                        event.preventDefault()
                        void send()
                    }
                }}
            />
            <div className="comment-bar">
                <button type="submit" className="note-save" disabled={busy || !body.trim()}>
                    {submitLabel}
                </button>
                {onCancel && (
                    <button type="button" className="note-clear" onClick={onCancel}>
                        Annuleren
                    </button>
                )}
                <span className="comment-hint">Noem iemand met @naam om diegene een melding te sturen.</span>
            </div>
            {error && <ErrorNotice error={error} compact onRetry={() => void send()} />}
        </form>
    )
}
