import { Suspense } from 'react'

import { SettingsScreen } from '@/features/workspace/settings-screen'

export default function SettingsPage() {
    return (
        <main>
            <Suspense fallback={<div className="loading page-loading" />}>
                <SettingsScreen />
            </Suspense>
        </main>
    )
}
