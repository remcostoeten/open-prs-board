import Link from 'next/link'

import { Steps } from '@/features/onboarding/steps'
import { WorkspaceForm } from '@/features/onboarding/workspace-form'
import { findWorkspace, requireViewer } from '@/server/session'

export async function WorkspaceStep() {
    const viewer = await requireViewer('/onboarding/workspace')
    const workspace = await findWorkspace(viewer.id)
    if (workspace)
        return (
            <div className="card">
                <Steps current={2} />
                <h1>Je hoort al bij {workspace.name}</h1>
                <div className="notice-actions">
                    <Link className="button primary" href="/onboarding/repositories">
                        Repositories kiezen
                    </Link>
                    <Link className="button" href="/board">
                        Naar het bord
                    </Link>
                </div>
            </div>
        )
    return (
        <div className="card">
            <Steps current={1} />
            <h1>Maak een workspace</h1>
            <p className="lede">
                Een workspace is het gedeelde bord van je team. Collega&apos;s nodig je later uit via Instellingen.
            </p>
            <WorkspaceForm />
        </div>
    )
}
