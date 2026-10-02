'use client'

import { useActionState } from 'react'

import { createWorkspaceAction } from '@/features/workspace/actions'

export function WorkspaceForm() {
    const [state, submit, pending] = useActionState(createWorkspaceAction, { error: '' })
    return (
        <form className="stack-form" action={submit}>
            <label>
                Naam
                <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={60}
                    placeholder="Bijvoorbeeld Team Website"
                    autoFocus
                />
            </label>
            {state.error && (
                <p className="notice bad" role="alert">
                    {state.error}
                </p>
            )}
            <button type="submit" className="primary" disabled={pending}>
                Workspace aanmaken
            </button>
        </form>
    )
}
