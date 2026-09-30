import { Suspense } from 'react'

import { WorkspaceStep } from '@/features/onboarding/workspace-step'

export default function WorkspacePage() {
    return (
        <main className="narrow">
            <Suspense fallback={<div className="loading page-loading" />}>
                <WorkspaceStep />
            </Suspense>
        </main>
    )
}
