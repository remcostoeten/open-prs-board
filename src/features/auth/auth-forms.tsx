'use client'

import { useActionState, useState } from 'react'

import { signInAction, signUpAction, type AuthFormState } from '@/features/auth/actions'

const INITIAL: AuthFormState = { error: '', email: '' }

export function AuthForms({ next, withDivider }: { next: string; withDivider: boolean }) {
    const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
    const [signInState, signIn, signingIn] = useActionState(signInAction, INITIAL)
    const [signUpState, signUp, signingUp] = useActionState(signUpAction, INITIAL)
    const state = mode === 'sign-in' ? signInState : signUpState
    return (
        <div className="auth-forms">
            {withDivider && <p className="divider">of met e-mail en wachtwoord (voor testen)</p>}
            <div className="tabs" role="tablist">
                <button type="button" role="tab" aria-selected={mode === 'sign-in'} onClick={() => setMode('sign-in')}>
                    Inloggen
                </button>
                <button type="button" role="tab" aria-selected={mode === 'sign-up'} onClick={() => setMode('sign-up')}>
                    Account maken
                </button>
            </div>
            <form className="stack-form" action={mode === 'sign-in' ? signIn : signUp} key={mode}>
                <input type="hidden" name="next" value={next} />
                {mode === 'sign-up' && (
                    <label>
                        Naam
                        <input name="name" autoComplete="name" required maxLength={80} />
                    </label>
                )}
                <label>
                    E-mailadres
                    <input name="email" type="email" autoComplete="email" required defaultValue={state.email} />
                </label>
                <label>
                    Wachtwoord
                    <input
                        name="password"
                        type="password"
                        autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                        minLength={mode === 'sign-up' ? 10 : undefined}
                        required
                    />
                </label>
                {state.error && (
                    <p className="notice bad" role="alert">
                        {state.error}
                    </p>
                )}
                <button type="submit" className="primary" disabled={signingIn || signingUp}>
                    {mode === 'sign-in' ? 'Inloggen' : 'Account maken'}
                </button>
            </form>
        </div>
    )
}
