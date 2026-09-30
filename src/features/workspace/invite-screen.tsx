import { eq } from 'drizzle-orm'
import Link from 'next/link'

import { AcceptInvitation } from '@/features/workspace/accept-invitation'
import { invitation, organization } from '@/server/db/auth-schema'
import { db } from '@/server/db/client'
import { getViewer } from '@/server/session'

type Props = {
    params: Promise<{ id: string }>
}

async function openInvitation(id: string) {
    const [row] = await db
        .select({
            email: invitation.email,
            status: invitation.status,
            expiresAt: invitation.expiresAt,
            workspace: organization.name,
        })
        .from(invitation)
        .innerJoin(organization, eq(invitation.organizationId, organization.id))
        .where(eq(invitation.id, id))
    return row && row.status === 'pending' && row.expiresAt > new Date() ? row : null
}

export async function InviteScreen({ params }: Props) {
    const { id } = await params
    const row = await openInvitation(id)
    if (!row)
        return (
            <div className="card">
                <h1>Uitnodiging niet geldig</h1>
                <p className="lede">
                    Deze uitnodiging is verlopen, al gebruikt of ingetrokken. Vraag om een nieuwe link.
                </p>
            </div>
        )
    const viewer = await getViewer()
    const next = encodeURIComponent(`/invite/${id}`)
    return (
        <div className="card">
            <h1>Uitnodiging voor {row.workspace}</h1>
            <p className="lede">Je bent uitgenodigd om mee te werken aan het PR-bord van {row.workspace}.</p>
            {viewer ? (
                <>
                    {viewer.email.toLowerCase() !== row.email.toLowerCase() && (
                        <p className="notice warn">
                            Je bent ingelogd als {viewer.email}, maar de uitnodiging is voor een ander e-mailadres. Log
                            in met het juiste account.
                        </p>
                    )}
                    {!viewer.emailVerified && (
                        <p className="notice warn">
                            Je e-mailadres is nog niet geverifieerd. Log in met Bitbucket of GitHub, of vraag een owner
                            of admin om het te bevestigen.
                        </p>
                    )}
                    <AcceptInvitation id={id} />
                </>
            ) : (
                <div className="notice-actions">
                    <Link className="button primary" href={`/sign-in?next=${next}`}>
                        Inloggen om te accepteren
                    </Link>
                </div>
            )}
        </div>
    )
}
