import { Suspense } from 'react'

import { InviteScreen } from '@/features/workspace/invite-screen'

export default function InvitePage({ params }: PageProps<'/invite/[id]'>) {
    return (
        <main className="narrow">
            <Suspense fallback={<div className="loading page-loading" />}>
                <InviteScreen params={params} />
            </Suspense>
        </main>
    )
}
