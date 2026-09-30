import { eq } from 'drizzle-orm'
import Link from 'next/link'

import { RepositoryPicker } from '@/features/onboarding/repository-picker'
import { Steps } from '@/features/onboarding/steps'
import type { ProviderId } from '@/features/providers/types'
import { configuredProviders } from '@/server/auth'
import { account } from '@/server/db/auth-schema'
import { db } from '@/server/db/client'
import { isManager, requireWorkspace } from '@/server/session'

export async function RepositoriesStep() {
    const { viewer, workspace } = await requireWorkspace('/onboarding/repositories')
    if (!isManager(workspace.role))
        return (
            <div className="card">
                <h1>Alleen owners en admins koppelen repositories</h1>
                <Link className="button" href="/board">
                    Naar het bord
                </Link>
            </div>
        )
    const linked = await db.select({ provider: account.providerId }).from(account).where(eq(account.userId, viewer.id))
    const linkedIds = new Set(linked.map((row) => row.provider))
    const providers: { id: ProviderId; linked: boolean }[] = [
        ...configuredProviders().map((id) => ({ id, linked: linkedIds.has(id) })),
        { id: 'snapshot', linked: true },
    ]
    return (
        <div className="card wide">
            <Steps current={2} />
            <h1>Kies repositories voor {workspace.name}</h1>
            <p className="lede">
                Het bord toont de open PR&apos;s van alle gekozen repositories samen. De eerste synchronisatie haalt
                alle open PR&apos;s op plus wat in de laatste 30 dagen is gemerged of gesloten.
            </p>
            <RepositoryPicker providers={providers} />
        </div>
    )
}
