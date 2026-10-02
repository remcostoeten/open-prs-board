import { Suspense } from 'react'

import { SignInScreen } from '@/features/auth/sign-in-screen'

export default function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
    return (
        <main className="narrow">
            <Suspense fallback={<div className="loading page-loading" />}>
                <SignInScreen searchParams={searchParams} />
            </Suspense>
        </main>
    )
}
