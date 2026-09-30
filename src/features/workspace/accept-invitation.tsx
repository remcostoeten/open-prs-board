'use client'

import { useState } from 'react'

import { ErrorNotice } from '@/features/errors/error-notice'
import { acceptInvitationAction } from '@/features/workspace/actions'
import type { PublicError } from '@/shared/errors/result'

export function AcceptInvitation({ id }: { id: string }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<PublicError | null>(null)
    return (
        <div>
            <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={async () => {
                    setBusy(true)
                    const result = await acceptInvitationAction(id)
                    setBusy(false)
                    if (result && !result.ok) setError(result.error)
                }}
            >
                Uitnodiging accepteren
            </button>
            {error && <ErrorNotice error={error} />}
        </div>
    )
}
