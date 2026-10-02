import { AuthForms } from '@/features/auth/auth-forms'
import { signInWithProviderAction } from '@/features/auth/actions'
import { PROVIDER_LABEL } from '@/features/board/copy'
import { configuredProviders } from '@/server/auth'
import Link from 'next/link'

import { getViewer } from '@/server/session'
import { toRoute } from '@/shared/helpers/route'

type Props = {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}

function safeNext(value: string | string[] | undefined) {
    const next = Array.isArray(value) ? value[0] : value
    return next && /^\/(?!\/)/.test(next) ? next : '/board'
}

export async function SignInScreen({ searchParams }: Props) {
    const params = await searchParams
    const next = safeNext(params.next)
    const viewer = await getViewer()
    if (viewer)
        return (
            <div className="card">
                <h1>Je bent ingelogd</h1>
                <p className="lede">Ingelogd als {viewer.email}.</p>
                <Link className="button primary" href={toRoute(next)}>
                    Verder
                </Link>
            </div>
        )
    const providers = configuredProviders()
    return (
        <div className="card">
            <h1>PR board</h1>
            <p className="lede">Eén bord voor de pull requests van je team, met reacties die op het bord blijven.</p>
            {params.error && <p className="notice bad">Inloggen bij de provider lukte niet. Probeer het opnieuw.</p>}
            {providers.length > 0 && (
                <div className="provider-buttons">
                    {providers.map((provider) => (
                        <form key={provider} action={signInWithProviderAction}>
                            <input type="hidden" name="provider" value={provider} />
                            <input type="hidden" name="next" value={next} />
                            <button type="submit" className="primary">
                                Inloggen met {PROVIDER_LABEL[provider]}
                            </button>
                        </form>
                    ))}
                </div>
            )}
            <AuthForms next={next} withDivider={providers.length > 0} />
        </div>
    )
}
