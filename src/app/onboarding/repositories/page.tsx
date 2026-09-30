import { Suspense } from 'react'

import { RepositoriesStep } from '@/features/onboarding/repositories-step'

export default function RepositoriesPage() {
    return (
        <main className="narrow">
            <Suspense fallback={<div className="loading page-loading" />}>
                <RepositoriesStep />
            </Suspense>
        </main>
    )
}
